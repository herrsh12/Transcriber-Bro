import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000"

export async function POST(req: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, file, charge } = await req.json()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !file) {
      return NextResponse.json({ error: "Missing payment verification data" }, { status: 400 })
    }

    // Call the Express backend to verify payment
    const response = await fetch(`${BACKEND_URL}/verify-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        file,
        charge,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: data.message || "Payment verification failed" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: data.message || "Payment verified and transcription started",
    })
  } catch (error) {
    console.error("Payment verification error:", error)
    return NextResponse.json({ error: "Payment verification failed" }, { status: 500 })
  }
}
