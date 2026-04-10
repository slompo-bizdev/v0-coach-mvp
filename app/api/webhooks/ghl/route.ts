import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET endpoint para teste/validação
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "GHL webhook endpoint is active and ready",
    url: "https://www.askmoses.ai/api/webhooks/ghl",
    method: "POST",
    setup: {
      platform: "GoHighLevel",
      step1: "Create a new Workflow in GoHighLevel",
      step2: 'Add a "Custom Webhook" action',
      step3: "Configure: Method = POST",
      step4: "Configure: URL = https://www.askmoses.ai/api/webhooks/ghl",
      step5: "Trigger: When a call is completed",
    },
  })
}

interface GHLWebhookPayload {
  type: string
  contactId: string
  locationId: string
  messageId?: string
  conversationId?: string
  direction?: "inbound" | "outbound"
  duration?: number
  status?: string
  message?: {
    type?: string
  }
}

// Fetch transcription from GHL API
async function getGHLTranscription(locationId: string, messageId: string) {
  try {
    const response = await fetch(
      `https://rest.gohighlevel.com/v2/conversations/locations/${locationId}/messages/${messageId}/transcription`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      console.error(
        "[v0] GHL transcription error:",
        response.status,
        await response.text()
      )
      return null
    }

    const data = await response.json()
    return data.transcription || data.data?.transcription || null
  } catch (error) {
    console.error("[v0] Error fetching GHL transcription:", error)
    return null
  }
}

// Get call details from GHL API
async function getGHLCallDetails(locationId: string, messageId: string) {
  try {
    const response = await fetch(
      `https://rest.gohighlevel.com/v2/conversations/locations/${locationId}/messages/${messageId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      console.error("[v0] GHL call details error:", response.status)
      return null
    }

    const data = await response.json()
    return data.data || data
  } catch (error) {
    console.error("[v0] Error fetching GHL call details:", error)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const payload: GHLWebhookPayload = await request.json()

    console.log("[v0] GHL Webhook received:", {
      type: payload.type,
      contactId: payload.contactId,
      locationId: payload.locationId,
      messageId: payload.messageId,
    })

    // Only process completed calls
    if (
      !payload.messageId ||
      !payload.locationId ||
      payload.message?.type !== "CALL"
    ) {
      console.log("[v0] Skipping non-call message")
      return NextResponse.json({ success: true, processed: false })
    }

    // Fetch transcription and call details
    console.log("[v0] Fetching transcription and call details from GHL...")
    const [transcription, callDetails] = await Promise.all([
      getGHLTranscription(payload.locationId, payload.messageId),
      getGHLCallDetails(payload.locationId, payload.messageId),
    ])

    if (!transcription) {
      console.log("[v0] No transcription available yet, will retry later")
      return NextResponse.json({
        success: true,
        processed: false,
        reason: "No transcription",
      })
    }

    console.log("[v0] Transcription fetched, length:", transcription.length)

    // Get contact info from GHL
    let trainerName = "Unknown"
    let trainerEmail = "unknown@example.com"
    let leadName = "Lead"

    if (payload.contactId) {
      try {
        const contactResponse = await fetch(
          `https://rest.gohighlevel.com/v2/contacts/${payload.contactId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        )

        if (contactResponse.ok) {
          const contactData = await contactResponse.json()
          const contact = contactData.data || contactData
          leadName = contact.firstName || contact.name || "Lead"
          trainerEmail = contact.email || contact.phone || "unknown@example.com"
        }
      } catch (error) {
        console.error("[v0] Error fetching contact details:", error)
      }
    }

    // Get team member / user info if available
    if (callDetails?.userId) {
      try {
        const userResponse = await fetch(
          `https://rest.gohighlevel.com/v2/users/${callDetails.userId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        )

        if (userResponse.ok) {
          const userData = await userResponse.json()
          const user = userData.data || userData
          trainerName = user.name || user.firstName || "Team Member"
          if (user.email) trainerEmail = user.email
        }
      } catch (error) {
        console.error("[v0] Error fetching user details:", error)
      }
    }

    // Get active rubric
    const supabase = await createClient()
    const { data: rubricData } = await supabase
      .from("rubrics")
      .select("id")
      .eq("is_active", true)
      .single()

    if (!rubricData) {
      console.error("[v0] No active rubric found")
      return NextResponse.json({
        success: false,
        error: "No active rubric",
      })
    }

    // Get default script if available
    const { data: scriptData } = await supabase
      .from("scripts")
      .select("id")
      .eq("rubric_id", rubricData.id)
      .limit(1)
      .single()

    // Analyze the call using our analyze endpoint
    console.log("[v0] Sending to analyze endpoint...")
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.askmoses.ai"
    const analyzeResponse = await fetch(`${appUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: transcription,
        scriptId: scriptData?.id,
        trainerName,
        trainerEmail,
      }),
    })

    if (!analyzeResponse.ok) {
      const error = await analyzeResponse.text()
      console.error("[v0] Analyze request failed:", error)
      return NextResponse.json({
        success: false,
        error: "Analysis failed",
      })
    }

    const analysisResult = await analyzeResponse.json()

    // Save call to database
    console.log("[v0] Saving call to database...")
    const { error: saveError } = await supabase.from("calls").insert({
      rubric_id: rubricData.id,
      trainer_name: trainerName,
      trainer_email: trainerEmail,
      client_name: leadName,
      transcript: transcription,
      overall_score: analysisResult.overallScore,
      total_criteria: analysisResult.sections?.length || 0,
      criteria: analysisResult.sections || analysisResult.criteria,
      summary: analysisResult.summary,
      strengths: analysisResult.strengths,
      improvements: analysisResult.improvements,
      call_outcome: analysisResult.detectedOutcome || "no_decision",
      detected_outcome: analysisResult.detectedOutcome || null,
      ghl_message_id: payload.messageId,
      ghl_contact_id: payload.contactId,
      ghl_location_id: payload.locationId,
      email_sent: false,
    })

    if (saveError) {
      console.error("[v0] Error saving call:", saveError)
      return NextResponse.json({
        success: false,
        error: "Database save failed",
      })
    }

    // Send coaching email automatically
    console.log("[v0] Sending coaching email...")
    const emailResponse = await fetch(`${appUrl}/api/send-coaching`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
        transcript: transcription,
        callOutcome: analysisResult.detectedOutcome || "no_decision",
        detectedOutcome: analysisResult.detectedOutcome || null,
        ghlMessageId: payload.messageId,
        ghlContactId: payload.contactId,
        ghlLocationId: payload.locationId,
      }),
    })

    if (!emailResponse.ok) {
      console.error(
        "[v0] Email send failed:",
        await emailResponse.text()
      )
    }

    console.log("[v0] Call imported, analyzed, and email sent successfully from GHL")
    return NextResponse.json({
      success: true,
      processed: true,
      score: analysisResult.overallScore,
    })
  } catch (error) {
    console.error("[v0] Webhook error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
