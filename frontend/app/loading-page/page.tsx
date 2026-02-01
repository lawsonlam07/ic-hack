"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { getVideoFile, clearVideoFile } from "@/lib/videoStorage"

export default function LoadingPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("Uploading video...")
  const [error, setError] = useState<string | null>(null)
  const hasSubmittedRef = useRef(false)

  const steps = [
    "Uploading video...",
    "Generating commentary...",
    "Converting to speech...",
    "Finalizing your experience..."
  ]

  useEffect(() => {
    // Prevent duplicate submissions in React Strict Mode
    console.log("🔍 useEffect running, hasSubmittedRef.current:", hasSubmittedRef.current)
    if (hasSubmittedRef.current) {
      console.log("⚠️ Already submitted, returning early")
      return
    }
    hasSubmittedRef.current = true
    console.log("✅ Setting hasSubmittedRef to true, proceeding with submission")

    const submitToBackend = async () => {
      try {
        console.log("🚀 submitToBackend() function called")
        // Get form data from sessionStorage
        const formDataStr = sessionStorage.getItem("videoFormData")
        const videoFile = getVideoFile()
        console.log("📋 Form data string:", formDataStr)
        console.log("📹 Video file:", videoFile)

        if (!formDataStr) {
          console.error("❌ No form data found in sessionStorage")
          setError("No form data found. Please go back and try again.")
          return
        }

        const formData = JSON.parse(formDataStr)
        console.log("📝 Parsed form data:", formData)

        setCurrentStep("Uploading video...")
        setProgress(10)

        // Handle YouTube URL download first if needed
        let videoFileName = formData.videoFileName
        console.log("📂 Upload method:", formData.uploadMethod)
        if (formData.uploadMethod === "url" && formData.videoUrl) {
          console.log("🔗 URL upload detected, downloading from:", formData.videoUrl)
          setCurrentStep("Downloading video from YouTube...")
          setProgress(15)

          console.log("📡 Fetching: http://localhost:5000/api/download-youtube")
          const downloadResponse = await fetch("http://localhost:5000/api/download-youtube", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: formData.videoUrl }),
          })

          if (!downloadResponse.ok) {
            const errorData = await downloadResponse.json()
            throw new Error(errorData.error || "Failed to download YouTube video")
          }

          const downloadResult = await downloadResponse.json()
          videoFileName = downloadResult.filename

          console.log("✅ YouTube video downloaded:", videoFileName)
        }

        // Create FormData for the API request
        console.log("📦 Creating FormData for backend request")
        const apiFormData = new FormData()

        // Add video file if it's a file upload
        if (formData.uploadMethod === "file" && videoFile) {
          console.log("📤 Adding video file to FormData:", videoFile.name)
          apiFormData.append("video", videoFile)
        } else if (formData.uploadMethod === "file" && !videoFile) {
          console.error("❌ Video file not found for file upload")
          setError("Video file not found. Please go back and try again.")
          return
        } else if (formData.uploadMethod === "url") {
          console.log("📂 Adding video_filename to FormData:", videoFileName)
          // For URL downloads, we need to tell the backend to use the downloaded file
          apiFormData.append("video_filename", videoFileName)
        }

        // Map frontend preferences to backend format
        const styleMap: Record<string, string> = {
          "play-by-play": "professional",
          "analytical": "professional",
          "entertaining": "enthusiastic",
          "educational": "professional",
          "emotional": "dramatic"
        }

        const energyMap: Record<string, string> = {
          "beginner": "medium",
          "intermediate": "medium",
          "advanced": "high",
          "expert": "high"
        }

        // Map voice selections to ElevenLabs voice IDs
        const voiceMap: Record<string, string> = {
          "professional-male": "93nuHbke4dTER9x2pDwE",      // Deep, confident male
          "professional-female": "or4EV8aZq78KWcXw48wd",    // Calm, professional female
          "enthusiastic-male": "Rsz5u2Huh1hPlPr0oxRQ",      // Young, enthusiastic male
          "enthusiastic-female": "4RZ84U1b4WCqpu57LvIq",    // Soft, pleasant female (closest)
          "british-male": "htFfPSZGJwjBv1CL0aMD",           // Well-rounded male (closest)
          "british-female": "4RZ84U1b4WCqpu57LvIq"          // Soft, pleasant female (closest)
        }

        apiFormData.append("style", styleMap[formData.commentaryStyle] || "professional")
        apiFormData.append("energy", energyMap[formData.expertiseLevel] || "medium")
        apiFormData.append("voice", voiceMap[formData.voice] || "93nuHbke4dTER9x2pDwE")
        apiFormData.append("duration", "60")

        console.log("⚙️ Added preferences to FormData")
        setProgress(20)
        setCurrentStep("Generating AI commentary...")

        // Make request to Flask backend
        const backendUrl = "http://localhost:5000/api/generate-full-commentary"
        console.log("🚀 MAKING FETCH REQUEST TO:", backendUrl)
        console.log("📦 FormData contents:", Array.from(apiFormData.entries()))

        const backendResponse = await fetch(backendUrl, {
          method: "POST",
          body: apiFormData,
        })

        console.log("✅ Fetch request completed, status:", backendResponse.status)

        setProgress(70)
        setCurrentStep("Converting to speech...")

        if (!backendResponse.ok) {
          const errorData = await backendResponse.json()
          throw new Error(errorData.error || "Failed to generate commentary")
        }

        const result = await backendResponse.json()

        setProgress(90)
        setCurrentStep("Finalizing your experience...")

        // Store result for viewer page
        sessionStorage.setItem("commentaryResult", JSON.stringify(result))

        // Clear video file from memory
        clearVideoFile()

        setProgress(100)

        // Navigate to viewer page
        setTimeout(() => {
          router.push("/viewer")
        }, 500)

      } catch (err) {
        console.error("❌ ERROR CAUGHT:", err)
        console.error("Error stack:", err instanceof Error ? err.stack : "No stack trace")
        setError(err instanceof Error ? err.message : "An error occurred")
        setCurrentStep("Error occurred")
      }
    }

    console.log("🏃 Calling submitToBackend()...")
    submitToBackend()
  }, [router])

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Bouncing Tennis Ball Animation */}
        <div className="flex justify-center h-32 relative items-end">
          <style jsx>{`
            @keyframes bounce {
              0%, 100% {
                transform: translateY(0);
                animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
              }
              50% {
                transform: translateY(-80px);
                animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
              }
            }
            @keyframes spin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }
            .bounce-animation {
              animation: bounce 1s infinite;
            }
            .spin-animation {
              animation: spin 2s linear infinite;
            }
          `}</style>
          <div className="bounce-animation">
            <div className="spin-animation">
              <Image
                src="/tennis-ball.svg"
                alt="Loading"
                width={80}
                height={80}
              />
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-3">
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-base font-medium text-slate-700 dark:text-slate-300">
            {currentStep}
          </p>
          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-center text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
              <button
                onClick={() => router.push("/")}
                className="mt-2 w-full text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Go back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
