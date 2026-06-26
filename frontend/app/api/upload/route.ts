import { NextRequest, NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/backend"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("audio") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Create new FormData for the backend
    const backendFormData = new FormData()
    backendFormData.append("audio", file)

    // Call the Express backend
    const response = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      body: backendFormData,
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error("Backend upload failed:", response.status, data)
      return NextResponse.json(
        { error: data.error || "Backend upload failed", backendUrl: BACKEND_URL },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      file: data.file,
      charge: data.charge,
      duration: data.duration,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      {
        error: "Upload failed — could not reach backend",
        backendUrl: BACKEND_URL,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
