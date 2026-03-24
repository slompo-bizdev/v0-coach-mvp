// Direct OpenAI Whisper API call (AI SDK v5 doesn't support TranscriptionModelV3)

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get("audio") as File

    if (!audioFile) {
      return Response.json(
        { error: "No audio file provided" },
        { status: 400 }
      )
    }

    console.log("[v0] Transcribing file:", audioFile.name, "size:", audioFile.size)

    // Create FormData for OpenAI API
    const transcriptionFormData = new FormData()
    transcriptionFormData.append("file", audioFile)
    transcriptionFormData.append("model", "whisper-1")

    // Call OpenAI Whisper API directly
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: transcriptionFormData,
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("[v0] OpenAI API error:", error)
      throw new Error(error.error?.message || "OpenAI API error")
    }

    const result = await response.json()
    console.log("[v0] Transcription successful, text length:", result.text.length)

    return Response.json({ transcript: result.text })
  } catch (error) {
    console.error("[v0] Transcription error:", error instanceof Error ? error.message : error)
    const errorMsg = error instanceof Error ? error.message : "Unknown error during transcription"
    return Response.json(
      { error: `Failed to transcribe audio: ${errorMsg}` },
      { status: 500 }
    )
  }
}
