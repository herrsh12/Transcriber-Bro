import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const file = searchParams.get("file")
    const type = searchParams.get("type") || "txt" // "txt" or "zip"

    if (!file) {
      return NextResponse.json({ error: "No file specified" }, { status: 400 })
    }

    // Determine which endpoint to call
    const endpoint = type === "zip" ? "/download-all" : "/download"
    const backendUrl = `${BACKEND_URL}${endpoint}?file=${encodeURIComponent(file)}`

    // Call the Express backend
    const response = await fetch(backendUrl)

    if (!response.ok) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const buffer = await response.arrayBuffer()

    // Determine filename and content type
    const filename = type === "zip" ? `${file.slice(0, -4)}_transcriptions.zip` : `${file.slice(0, -4)}.txt`
    const contentType = type === "zip" ? "application/zip" : "text/plain"

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json({ error: "Download failed" }, { status: 500 })
  }
}
