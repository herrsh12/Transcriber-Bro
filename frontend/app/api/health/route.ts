import { NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/backend"

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    const data = await response.json().catch(() => ({}))

    return NextResponse.json({
      online: response.ok,
      backendUrl: BACKEND_URL,
      ...data,
    })
  } catch {
    return NextResponse.json(
      { online: false, backendUrl: BACKEND_URL },
      { status: 503 }
    )
  }
}
