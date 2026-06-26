import { NextRequest, NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/backend"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const orderId = searchParams.get("orderId")

    if (!orderId) {
      return NextResponse.json({ error: "No order ID provided" }, { status: 400 })
    }

    // Call the Express backend
    const response = await fetch(`${BACKEND_URL}/order-status/${orderId}`)

    if (!response.ok) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const data = await response.json()

    return NextResponse.json({
      orderId: data.orderId,
      status: data.status,
    })
  } catch (error) {
    console.error("Order status error:", error)
    return NextResponse.json({ error: "Failed to fetch order status" }, { status: 500 })
  }
}
