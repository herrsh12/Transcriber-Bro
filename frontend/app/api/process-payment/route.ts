import { NextRequest, NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/backend"

export async function POST(req: NextRequest) {
  try {
    const { file, charge } = await req.json()

    if (!file || !charge) {
      return NextResponse.json({ error: "Missing file or charge" }, { status: 400 })
    }

    // Call the Express backend to create Razorpay order
    const response = await fetch(`${BACKEND_URL}/process-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file, charge }),
    })

    if (!response.ok) {
      throw new Error("Backend payment processing failed")
    }

    const data = await response.json()

    return NextResponse.json({
      orderId: data.orderId,
      amount: data.amount,
    })
  } catch (error) {
    console.error("Payment processing error:", error)
    return NextResponse.json({ error: "Payment processing failed" }, { status: 500 })
  }
}
