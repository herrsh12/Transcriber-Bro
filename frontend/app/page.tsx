"use client"

import type React from "react"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Upload, FileAudio, Copy, Check, Loader2, Trash2, ArrowRight, Download, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { DemoBanner } from "@/components/demo-banner"

const MAX_UPLOAD_MB = parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || "5", 10)

const TRANSCRIPTION_FORMATS = ["txt", "srt", "vtt", "json", "tsv"] as const
type TranscriptionFormat = (typeof TRANSCRIPTION_FORMATS)[number]

async function fetchTranscriptionPreview(filename: string, format: string): Promise<string> {
  const response = await fetch(
    `/api/download?file=${encodeURIComponent(filename)}&format=${format}&preview=1`
  )
  if (!response.ok) {
    throw new Error("Failed to load transcription")
  }
  let text = await response.text()
  if (format === "json") {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      // keep raw JSON string
    }
  }
  return text
}

interface UploadedFile {
  id: string
  file: File
  duration: string
  pricing: number
  uploadProgress: number
  filename: string
  orderId?: string
}

interface TranscriptionResult {
  id: string
  filename: string
  text: string
  duration: string
  timestamp: Date
  availableFormats: TranscriptionFormat[]
}

type FlowStep = "upload" | "pricing" | "payment" | "processing" | "success" | "download"

const DynamicBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    // Create floating dots with trail history
    const dots: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      opacity: number
      fadeDirection: number
      trail: Array<{ x: number; y: number; age: number }>
    }> = []

    // Initialize dots
    for (let i = 0; i < 50; i++) {
      dots.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.3 + 0.1,
        fadeDirection: Math.random() > 0.5 ? 1 : -1,
        trail: [],
      })
    }

    const animate = () => {
      // Create a subtle fade effect instead of clearing completely
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      dots.forEach((dot, index) => {
        // Add current position to trail
        dot.trail.push({ x: dot.x, y: dot.y, age: 0 })

        // Limit trail length and update ages
        if (dot.trail.length > 15) {
          dot.trail.shift()
        }
        dot.trail.forEach((point) => point.age++)

        // Update position
        dot.x += dot.vx
        dot.y += dot.vy

        // Update opacity for breathing effect
        dot.opacity += dot.fadeDirection * 0.002
        if (dot.opacity <= 0.05 || dot.opacity >= 0.3) {
          dot.fadeDirection *= -1
        }

        // Wrap around edges
        if (dot.x < 0) {
          dot.x = canvas.width
          dot.trail = [] // Clear trail when wrapping
        }
        if (dot.x > canvas.width) {
          dot.x = 0
          dot.trail = []
        }
        if (dot.y < 0) {
          dot.y = canvas.height
          dot.trail = []
        }
        if (dot.y > canvas.height) {
          dot.y = 0
          dot.trail = []
        }

        // Draw trail
        dot.trail.forEach((point, trailIndex) => {
          const trailOpacity = dot.opacity * (1 - point.age / 15) * 0.3
          const trailSize = dot.size * (1 - point.age / 20)

          if (trailOpacity > 0.01 && trailSize > 0.1) {
            ctx.beginPath()
            ctx.arc(point.x, point.y, trailSize, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0, 0, 0, ${trailOpacity})`
            ctx.fill()
          }
        })

        // Draw main dot
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 0, 0, ${dot.opacity})`
        ctx.fill()

        // Draw connections to nearby dots
        dots.slice(index + 1).forEach((otherDot) => {
          const dx = dot.x - otherDot.x
          const dy = dot.y - otherDot.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 100) {
            const opacity = ((100 - distance) / 100) * 0.08
            ctx.beginPath()
            ctx.moveTo(dot.x, dot.y)
            ctx.lineTo(otherDot.x, otherDot.y)
            ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        })
      })

      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)" }}
    />
  )
}

export default function TranscriptionApp() {
  const [currentStep, setCurrentStep] = useState<FlowStep>("upload")
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>([])
  const [selectedFormat, setSelectedFormat] = useState<TranscriptionFormat>("txt")
  const [loadingFormat, setLoadingFormat] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }, [])

  const handleFiles = async (files: File[]) => {
    const audioFiles = files.filter(
      (file) => file.type.startsWith("audio/") || file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i),
    )

    if (audioFiles.length === 0) {
      alert("Please select valid audio files")
      return
    }

    for (const file of audioFiles) {
      await processFile(file)
    }
  }

  const processFile = async (file: File) => {
    try {
      setProgress(0)
      setError(null)

      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        setError(`File too large for portfolio demo. Max ${MAX_UPLOAD_MB} MB.`)
        return
      }

      // Create FormData for file upload
      const formData = new FormData()
      formData.append("audio", file)

      // Simulate upload progress while the file is being sent
      const uploadInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(uploadInterval)
            return 90
          }
          return prev + Math.random() * 20
        })
      }, 150)

      // Call the upload API
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      clearInterval(uploadInterval)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || "Upload failed")
      }

      const data = await response.json()
      setProgress(100)

      // Store the uploaded file data with actual duration and pricing from backend
      const pricing = data.charge // Convert paise to rupees
      const uploadedData: UploadedFile = {
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        filename: data.file,
        duration: data.duration,
        pricing: pricing,
        uploadProgress: 100,
      }

      setUploadedFile(uploadedData)
      setCurrentStep("pricing")
      setProgress(0)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed"
      setError(errorMessage)
      console.error("Upload error:", err)
      setProgress(0)
    }
  }

  const initiateRazorpayPayment = async () => {
    if (!uploadedFile) return

    try {
      setError(null)

      // Call process-payment API to create Razorpay order
      const response = await fetch("/api/process-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: uploadedFile.filename,
          charge: uploadedFile.pricing,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to create payment order")
      }

      const data = await response.json()

      // Create Razorpay options
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: data.amount, // Amount in paise
        currency: "INR",
        name: "Transcription Service",
        description: `Transcription of ${uploadedFile.filename}`,
        order_id: data.orderId,
        handler: async (response: any) => {
          // Verify payment on backend
          await verifyPayment(response)
        },
        prefill: {
          name: "User",
          email: "user@example.com",
          contact: "9999999999",
        },
        theme: {
          color: "#000000",
        },
      }

      // Load Razorpay script and open checkout
      const script = document.createElement("script")
      script.src = "https://checkout.razorpay.com/v1/checkout.js"
      script.onload = () => {
        const rzp = new (window as any).Razorpay(options)
        rzp.open()
      }
      document.body.appendChild(script)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Payment initiation failed"
      setError(errorMessage)
      console.error("Payment error:", err)
    }
  }

  const verifyPayment = async (paymentResponse: any) => {
    if (!uploadedFile) return

    try {
      setCurrentStep("processing")
      setProgress(0)
      setIsProcessing(true)

      const response = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_signature: paymentResponse.razorpay_signature,
          file: uploadedFile.filename,
          charge: uploadedFile.pricing,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Payment verification failed")
      }

      const data = await response.json()

      if (!data.jobId) {
        throw new Error("No job ID returned from server")
      }

      // Poll using the real jobId the backend created
      await pollTranscriptionStatus(data.jobId, uploadedFile.filename)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Payment verification failed"
      setError(errorMessage)
      setIsProcessing(false)
      setCurrentStep("payment")
      console.error("Verification error:", err)
    }
  }

  const pollTranscriptionStatus = async (jobId: string, filename: string) => {
    const maxAttempts = 120 // 10 minutes at 5s intervals
    let attempts = 0

    return new Promise<void>((resolve, reject) => {
      const poll = setInterval(async () => {
        try {
          attempts++
          setProgress(Math.min(90, (attempts / maxAttempts) * 90))

          const response = await fetch(`/api/job-status?jobId=${encodeURIComponent(jobId)}`)
          if (!response.ok) throw new Error("Failed to fetch job status")

          const data = await response.json()

          if (data.status === "completed") {
            clearInterval(poll)

            let transcriptionText = ""
            let availableFormats: TranscriptionFormat[] = ["txt"]

            try {
              const formatsRes = await fetch(
                `/api/formats?file=${encodeURIComponent(filename)}`
              )
              if (formatsRes.ok) {
                const formatsData = await formatsRes.json()
                if (Array.isArray(formatsData.formats) && formatsData.formats.length > 0) {
                  availableFormats = formatsData.formats
                }
              }

              const initialFormat = availableFormats.includes("txt") ? "txt" : availableFormats[0]
              setSelectedFormat(initialFormat)
              transcriptionText = await fetchTranscriptionPreview(filename, initialFormat)
            } catch {
              transcriptionText = "Transcription complete but preview could not be loaded. Try downloading below."
            }

            const result: TranscriptionResult = {
              id: uploadedFile?.id || jobId,
              filename,
              text: transcriptionText,
              duration: uploadedFile?.duration || "",
              timestamp: new Date(),
              availableFormats,
            }

            setTranscriptions([result])
            setProgress(100)
            setIsProcessing(false)
            setCurrentStep("success")
            resolve()

          } else if (data.status === "failed") {
            clearInterval(poll)
            reject(new Error(data.error || "Transcription failed on the server"))

          } else if (attempts >= maxAttempts) {
            clearInterval(poll)
            reject(new Error("Transcription timed out — please contact support with your order ID"))
          }

        } catch (err) {
          clearInterval(poll)
          reject(err)
        }
      }, 5000) // poll every 5 seconds
    })
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error("Failed to copy text:", err)
    }
  }

  const deleteTranscription = (id: string) => {
    setTranscriptions((prev) => prev.filter((t) => t.id !== id))
  }

  const handleFormatChange = async (transcription: TranscriptionResult, format: TranscriptionFormat) => {
    if (format === selectedFormat) return

    setSelectedFormat(format)
    setLoadingFormat(true)
    try {
      const text = await fetchTranscriptionPreview(transcription.filename, format)
      setTranscriptions((prev) =>
        prev.map((t) => (t.id === transcription.id ? { ...t, text } : t))
      )
    } catch (err) {
      console.error("Format load error:", err)
      setError(`Could not load .${format} format`)
    } finally {
      setLoadingFormat(false)
    }
  }

  const downloadTranscription = (filename: string, format: TranscriptionFormat | "zip") => {
    const url = `/api/download?file=${encodeURIComponent(filename)}&format=${format}`
    const baseName = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename
    const downloadName = format === "zip" ? `${baseName}_transcriptions.zip` : `${baseName}.${format}`
    const a = document.createElement("a")
    a.href = url
    a.download = downloadName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <>
      <DynamicBackground />
      <div className="min-h-screen bg-transparent relative z-10">
        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-light tracking-tight text-black mb-4">Transcription</h1>
            <p className="text-gray-600 text-lg font-light">Convert your audio files to text with precision</p>
          </div>

          <DemoBanner />

          {/* Step Indicator */}
          <div className="mb-12">
            <div className="flex items-center justify-between">
              {["upload", "pricing", "payment", "processing", "success", "download"].map((step, idx) => (
                <div key={step} className="flex items-center flex-1">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-light transition-all",
                      ["upload", "pricing", "payment", "processing", "success", "download"].indexOf(currentStep) >=
                        idx
                        ? "bg-black text-white"
                        : "bg-gray-200 text-gray-600",
                    )}
                  >
                    {idx + 1}
                  </div>
                  {idx < 5 && (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mx-2 transition-all",
                        ["upload", "pricing", "payment", "processing", "success", "download"].indexOf(currentStep) >
                          idx
                          ? "bg-black"
                          : "bg-gray-200",
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Card className="mb-8 border border-red-200 bg-red-50">
              <div className="p-4 flex items-start gap-3">
                <div className="text-red-600 font-light">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-600 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            </Card>
          )}

          {/* Upload Step */}
          {currentStep === "upload" && (
            <>
              <Card className="mb-12 border-2 border-dashed border-gray-200 bg-transparent">
                <div
                  className={cn("p-12 text-center transition-all duration-200", isDragging && "border-black bg-gray-50")}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center space-y-6">
                    <div className="p-4 rounded-full bg-black">
                      <Upload className="w-8 h-8 text-white" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl font-light text-black">Drop your audio files here</h3>
                      <p className="text-gray-500 font-light">
                        or click to browse • MP3, WAV, M4A, OGG, FLAC • max {MAX_UPLOAD_MB} MB
                      </p>
                    </div>

                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload">
                      <Button
                        variant="outline"
                        className="border-black text-black hover:bg-black hover:text-white transition-colors"
                        asChild
                      >
                        <span className="cursor-pointer">Select Files</span>
                      </Button>
                    </label>
                  </div>
                </div>
              </Card>

              {/* Upload Progress - Transforms to Next Button */}
              {uploadedFile && progress > 0 && progress < 100 && (
                <Card className="mb-8 border border-gray-200">
                  <div className="p-6">
                    <div className="flex items-center space-x-4 mb-4">
                      <Loader2 className="w-5 h-5 animate-spin text-black" />
                      <span className="font-light text-black">Uploading {uploadedFile.file.name}...</span>
                    </div>
                    <Progress value={progress} className="h-1" />
                  </div>
                </Card>
              )}

              {/* Next Button After Upload Complete */}
              {uploadedFile && progress === 100 && (
                <div className="flex justify-center">
                  <Button
                    onClick={() => setCurrentStep("pricing")}
                    className="bg-black text-white hover:bg-gray-900 px-8 py-3 flex items-center gap-2"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Pricing Step */}
          {currentStep === "pricing" && uploadedFile && (
            <Card className="mb-8 border border-gray-200">
              <div className="p-8">
                <h2 className="text-2xl font-light text-black mb-6">Transcription Details</h2>

                <div className="space-y-6">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded">
                    <span className="font-light text-black">File Name</span>
                    <span className="text-gray-700">{uploadedFile.file.name}</span>
                  </div>

                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded">
                    <span className="font-light text-black">Estimated Duration</span>
                    <span className="text-gray-700">{uploadedFile.duration} minutes</span>
                  </div>

                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded">
                    <span className="font-light text-black">Price per Minute</span>
                    <span className="text-gray-700">$0.50</span>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex justify-between items-center p-4">
                      <span className="text-lg font-light text-black">Total Cost</span>
                      <span className="text-2xl font-light text-black">${uploadedFile.pricing.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex gap-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUploadedFile(null)
                      setCurrentStep("upload")
                      setProgress(0)
                    }}
                    className="flex-1 border-black text-black hover:bg-gray-100"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => setCurrentStep("payment")}
                    className="flex-1 bg-black text-white hover:bg-gray-900 flex items-center justify-center gap-2"
                  >
                    Proceed to Payment <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Payment Step */}
          {currentStep === "payment" && uploadedFile && (
            <Card className="mb-8 border border-gray-200">
              <div className="p-8">
                <h2 className="text-2xl font-light text-black mb-6">Payment</h2>

                <div className="space-y-6">
                  <div className="p-4 bg-gray-50 rounded">
                    <p className="text-sm text-gray-600 mb-4">Amount to Pay</p>
                    <p className="text-3xl font-light text-black">${uploadedFile.pricing.toFixed(2)}</p>
                  </div>

                  <div className="p-4 border border-gray-200 rounded">
                    <p className="text-sm font-light text-gray-700 mb-4">
                      Razorpay checkout opens in test mode — no real charges. Transcription runs on my PC via GPU.
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep("pricing")}
                    className="flex-1 border-black text-black hover:bg-gray-100"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={initiateRazorpayPayment}
                    className="flex-1 bg-black text-white hover:bg-gray-900 flex items-center justify-center gap-2"
                  >
                    Pay Now <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Processing Step */}
          {currentStep === "processing" && isProcessing && (
            <Card className="mb-8 border border-gray-200">
              <div className="p-8">
                <h2 className="text-2xl font-light text-black mb-6">Processing Transcription</h2>

                <div className="text-center space-y-6">
                  <Loader2 className="w-12 h-12 animate-spin text-black mx-auto" />
                  <div>
                    <p className="font-light text-black text-lg mb-2">Converting audio to text...</p>
                    <p className="text-gray-500 font-light">{Math.round(progress)}% complete</p>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </div>
            </Card>
          )}

          {/* Success Step */}
          {currentStep === "success" && transcriptions.length > 0 && (
            <>
              <Card className="mb-8 border border-gray-200 bg-gradient-to-r from-gray-50 to-transparent">
                <div className="p-8">
                  <h2 className="text-2xl font-light text-black mb-2">Transcription Complete</h2>
                  <p className="text-gray-600 font-light mb-6">Your audio file has been successfully transcribed.</p>

                  {transcriptions.map((transcription) => (
                    <div key={transcription.id} className="space-y-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <FileAudio className="w-5 h-5 text-gray-600" />
                          <div>
                            <h3 className="font-medium text-black">{transcription.filename}</h3>
                            <p className="text-sm text-gray-500">
                              {transcription.duration} • {transcription.timestamp.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(transcription.text, transcription.id)}
                          className="text-gray-600 hover:text-black"
                        >
                          {copiedId === transcription.id ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {TRANSCRIPTION_FORMATS.map((format) => {
                          const isAvailable = transcription.availableFormats.includes(format)
                          return (
                            <Button
                              key={format}
                              type="button"
                              size="sm"
                              variant={selectedFormat === format ? "default" : "outline"}
                              disabled={!isAvailable || loadingFormat}
                              onClick={() => handleFormatChange(transcription, format)}
                              className={cn(
                                "font-light uppercase text-xs tracking-wide",
                                selectedFormat === format
                                  ? "bg-black text-white hover:bg-gray-900"
                                  : "border-gray-300 text-gray-700",
                                !isAvailable && "opacity-40"
                              )}
                            >
                              .{format}
                            </Button>
                          )
                        })}
                      </div>

                      <Textarea
                        value={loadingFormat ? "Loading..." : transcription.text}
                        readOnly
                        className="min-h-[280px] resize-none border-gray-200 bg-white text-black font-light leading-relaxed font-mono text-sm"
                      />

                      <div className="flex gap-4">
                        <Button
                          onClick={() => setCurrentStep("download")}
                          className="flex-1 bg-black text-white hover:bg-gray-900 flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download Results
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Download Step */}
          {currentStep === "download" && transcriptions.length > 0 && (
            <Card className="mb-8 border border-gray-200">
              <div className="p-8">
                <h2 className="text-2xl font-light text-black mb-6">Download Your Transcription</h2>

                {transcriptions.map((transcription) => (
                  <div key={transcription.id} className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {transcription.availableFormats.map((format) => (
                        <Button
                          key={format}
                          onClick={() => downloadTranscription(transcription.filename, format)}
                          variant="outline"
                          className="border-black text-black hover:bg-gray-50 py-5 flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          .{format.toUpperCase()}
                        </Button>
                      ))}
                    </div>

                    <Button
                      onClick={() => downloadTranscription(transcription.filename, "zip")}
                      className="w-full bg-black text-white hover:bg-gray-900 py-6 flex items-center justify-center gap-2 text-base"
                    >
                      <Package className="w-5 h-5" />
                      Download All Formats (ZIP)
                    </Button>
                  </div>
                ))}

                <div className="mt-8">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCurrentStep("upload")
                      setUploadedFile(null)
                      setProgress(0)
                      setTranscriptions([])
                      setSelectedFormat("txt")
                    }}
                    className="w-full border-black text-black hover:bg-gray-50"
                  >
                    Transcribe Another File
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}