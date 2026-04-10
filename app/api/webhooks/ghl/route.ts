import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET endpoint para teste/validacao
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "GHL webhook endpoint is active and ready",
    url: "https://www.askmoses.ai/api/webhooks/ghl",
    method: "POST",
    expectedPayload: {
      type: "callCompleted",
      contactId: "string",
      userId: "string",
      callStatus: "completed",
      callDirection: "inbound | outbound",
      transcript: "string (from voice_ai.transcript)",
      userName: "string (coach name)",
      userEmail: "string (coach email)",
      contactName: "string (lead name)",
    },
  })
}

// Payload que o GHL vai enviar conforme a spec
interface GHLWebhookPayload {
  // Custom data from GHL workflow
  type: string // "callCompleted"
  contactId: string
  userId: string
  callStatus: string // "completed"
  callDirection?: "inbound" | "outbound"
  transcript: string // {{voice_ai.transcript}}
  userName: string // Coach/trainer name
  userEmail: string // Coach/trainer email
  contactName?: string // Lead/client name
  // Standard data auto-included by GHL
  locationId?: string
  workflowId?: string
  timestamp?: string
}

// Fetch transcription from GHL API (fallback se transcript vier vazio)
async function fetchTranscriptFromGHL(conversationId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/conversations/${conversationId}/messages`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
      }
    )

    if (!response.ok) {
      console.log("[v0] GHL API response not ok:", response.status)
      return null
    }

    const data = await response.json()
    // Look for voice/call messages with transcription
    const messages = data.messages || data.data || []
    for (const msg of messages) {
      if (msg.transcription || msg.transcript) {
        return msg.transcription || msg.transcript
      }
    }
    return null
  } catch (error) {
    console.log("[v0] Error fetching transcript from GHL API:", error)
    return null
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const payload: GHLWebhookPayload = await request.json()

    // Log incoming webhook per spec
    console.log("[v0] GHL Webhook received:", JSON.stringify({
      event: "ghl_webhook_received",
      timestamp: new Date().toISOString(),
      type: payload.type,
      contactId: payload.contactId,
      userId: payload.userId,
      hasTranscript: !!payload.transcript && payload.transcript.length > 0,
      transcriptLength: payload.transcript?.length || 0,
      userName: payload.userName,
      userEmail: payload.userEmail,
      contactName: payload.contactName,
      callStatus: payload.callStatus,
      callDirection: payload.callDirection,
    }))

    // Validate required fields
    if (!payload.type || !payload.contactId) {
      console.log("[v0] Missing required fields")
      return NextResponse.json(
        { status: "error", message: "Missing required fields: type, contactId" },
        { status: 400 }
      )
    }

    // Ignore non-callCompleted events
    if (payload.type !== "callCompleted") {
      console.log("[v0] Ignoring non-callCompleted event:", payload.type)
      return NextResponse.json({ status: "ignored", reason: "Not a callCompleted event" })
    }

    // Check for transcript
    let transcript = payload.transcript

    if (!transcript || transcript.trim().length === 0) {
      console.log("[v0] No transcript in payload, attempting fallback fetch...")
      // GHL may take 1-5 min to generate transcript
      // For now, return success and let them retry or queue
      return NextResponse.json({
        status: "no_transcript",
        message: "Transcript not available yet. GHL may still be processing.",
      })
    }

    console.log("[v0] Transcript received, length:", transcript.length)

    // Extract trainer (coach) and lead info from payload
    const trainerName = payload.userName || "Coach"
    const trainerEmail = payload.userEmail
    const leadName = payload.contactName || "Lead"

    // Validate trainer email
    if (!trainerEmail || !trainerEmail.includes("@")) {
      console.log("[v0] Invalid or missing userEmail:", trainerEmail)
      return NextResponse.json({
        status: "error",
        message: "Missing or invalid userEmail (coach email)",
      }, { status: 400 })
    }

    // Get active rubric
    const supabase = await createClient()
    const { data: rubricData, error: rubricError } = await supabase
      .from("rubrics")
      .select("id")
      .eq("is_active", true)
      .single()

    if (rubricError || !rubricData) {
      console.log("[v0] No active rubric found:", rubricError)
      return NextResponse.json({
        status: "error",
        message: "No active coaching script configured",
      }, { status: 500 })
    }

    // Get default script for this rubric
    const { data: scriptData } = await supabase
      .from("scripts")
      .select("id, name")
      .eq("rubric_id", rubricData.id)
      .limit(1)
      .single()

    console.log("[v0] Using script:", scriptData?.name || "default", "ID:", scriptData?.id)

    // Analyze the call
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.askmoses.ai"

    console.log("[v0] Starting analysis...")
    const analyzeResponse = await fetch(`${appUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        scriptId: scriptData?.id,
        trainerName,
        trainerEmail,
      }),
    })

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text()
      console.log("[v0] Analysis failed:", errorText)
      return NextResponse.json({
        status: "error",
        message: "Analysis failed",
        details: errorText,
      }, { status: 500 })
    }

    const analysisResult = await analyzeResponse.json()
    console.log("[v0] Analysis complete, score:", analysisResult.overallScore)

    // Save call to database
    const { error: saveError } = await supabase.from("calls").insert({
      rubric_id: rubricData.id,
      trainer_name: trainerName,
      trainer_email: trainerEmail,
      client_name: leadName,
      transcript,
      overall_score: analysisResult.overallScore,
      total_criteria: analysisResult.sections?.length || 0,
      criteria: analysisResult.sections || analysisResult.criteria,
      summary: analysisResult.summary,
      strengths: analysisResult.strengths,
      improvements: analysisResult.improvements,
      call_outcome: analysisResult.detectedOutcome || "no_decision",
      detected_outcome: analysisResult.detectedOutcome || null,
      ghl_contact_id: payload.contactId,
      ghl_location_id: payload.locationId || null,
      email_sent: false,
    })

    if (saveError) {
      console.log("[v0] Database save error:", saveError)
      // Continue to send email even if DB save fails
    }

    // Send coaching email to the trainer/coach
    console.log("[v0] Sending coaching email to:", trainerEmail)
    const emailResponse = await fetch(`${appUrl}/api/send-coaching`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainerName,
        trainerEmail,
        leadName,
        overallScore: analysisResult.overallScore,
        totalCriteria: analysisResult.sections?.length || 0,
        sections: analysisResult.sections || analysisResult.criteria,
        criteria: analysisResult.sections || analysisResult.criteria,
        summary: analysisResult.summary,
        strengths: analysisResult.strengths,
        improvements: analysisResult.improvements,
        transcript,
        callOutcome: analysisResult.detectedOutcome || "no_decision",
        detectedOutcome: analysisResult.detectedOutcome || null,
        ghlContactId: payload.contactId,
        ghlLocationId: payload.locationId || null,
      }),
    })

    const emailSent = emailResponse.ok
    if (!emailSent) {
      console.log("[v0] Email send failed:", await emailResponse.text())
    }

    const processingTime = Date.now() - startTime
    console.log("[v0] GHL webhook processing complete:", JSON.stringify({
      event: "ghl_webhook_processed",
      processingResult: "analyzed",
      score: analysisResult.overallScore,
      emailSent,
      processingTimeMs: processingTime,
    }))

    return NextResponse.json({
      status: "ok",
      analyzed: true,
      score: analysisResult.overallScore,
      emailSent,
      processingTimeMs: processingTime,
    })

  } catch (error) {
    console.log("[v0] Webhook error:", error)
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
