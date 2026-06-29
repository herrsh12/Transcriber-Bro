"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
const DEMO_MESSAGE =
  process.env.NEXT_PUBLIC_DEMO_MESSAGE ||
  "Portfolio demo — transcription runs on my home PC (GPU). Uploads work when my machine is online."

export function DemoBanner() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    if (!DEMO_MODE) return

    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" })
        const data = await res.json()
        setOnline(Boolean(data.online))
      } catch {
        setOnline(false)
      }
    }

    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [])

  if (!DEMO_MODE) return null

  return (
    <div
      className={cn(
        "mb-8 rounded-lg border px-4 py-3 text-sm font-light",
        online === true && "border-emerald-200 bg-emerald-50 text-emerald-900",
        online === false && "border-amber-200 bg-amber-50 text-amber-950",
        online === null && "border-gray-200 bg-gray-50 text-gray-800"
      )}
    >
      <p>{DEMO_MESSAGE}</p>
      <p className="mt-1 text-xs opacity-80">
        Backend:{" "}
        {online === null
          ? "checking…"
          : online
            ? "online — ready for live transcription"
            : "offline — start backend + Cloudflare tunnel on my PC"}
        {" · "}
        Razorpay test mode only
      </p>
    </div>
  )
}
