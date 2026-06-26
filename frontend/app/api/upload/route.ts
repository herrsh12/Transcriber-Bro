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

    if (!response.ok) {
      throw new Error("Backend upload failed")
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      file: data.file,
      charge: data.charge,
      duration: data.duration,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
