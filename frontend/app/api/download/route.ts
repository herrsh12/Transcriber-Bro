import { NextRequest, NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/backend"

const CONTENT_TYPES: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  srt: "text/plain; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  json: "application/json; charset=utf-8",
  tsv: "text/tab-separated-values; charset=utf-8",
  zip: "application/zip",
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const file = searchParams.get("file")
    const type = searchParams.get("type") || "txt"
    const format = searchParams.get("format") || type
    const preview = searchParams.get("preview") === "1"

    if (!file) {
      return NextResponse.json({ error: "No file specified" }, { status: 400 })
    }

    const endpoint = format === "zip" ? "/download-all" : "/download"
    const params = new URLSearchParams({ file })
    if (format !== "zip") {
      params.set("format", format)
      if (preview) params.set("inline", "1")
    }

    const response = await fetch(`${BACKEND_URL}${endpoint}?${params}`)

    if (!response.ok) {
      return NextResponse.json({ error: "File not found" }, { status: response.status })
    }

    if (preview && format !== "zip") {
      const text = await response.text()
      return new NextResponse(text, {
        status: 200,
        headers: { "Content-Type": CONTENT_TYPES[format] || "text/plain; charset=utf-8" },
      })
    }

    const buffer = await response.arrayBuffer()
    const baseName = file.includes(".") ? file.slice(0, file.lastIndexOf(".")) : file
    const filename =
      format === "zip" ? `${baseName}_transcriptions.zip` : `${baseName}.${format}`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[format] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json({ error: "Download failed" }, { status: 500 })
  }
}
