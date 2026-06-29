import { NextRequest, NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/backend"

export async function GET(req: NextRequest) {
  try {
    const file = req.nextUrl.searchParams.get("file")
    if (!file) {
      return NextResponse.json({ error: "No file specified" }, { status: 400 })
    }

    const response = await fetch(
      `${BACKEND_URL}/formats?file=${encodeURIComponent(file)}`,
      { cache: "no-store" }
    )

    if (!response.ok) {
      return NextResponse.json({ error: "Could not list formats" }, { status: response.status })
    }

    return NextResponse.json(await response.json())
  } catch (error) {
    console.error("Formats error:", error)
    return NextResponse.json({ error: "Failed to fetch formats" }, { status: 500 })
  }
}
