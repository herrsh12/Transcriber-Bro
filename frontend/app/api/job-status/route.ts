import { NextRequest, NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/backend"

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("jobId")

    if (!jobId) {
      return NextResponse.json({ error: "No jobId provided" }, { status: 400 })
    }

    const response = await fetch(`${BACKEND_URL}/job-status/${jobId}`)

    if (!response.ok) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Job status error:", error)
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 })
  }
}