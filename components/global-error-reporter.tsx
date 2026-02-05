"use client"

import { useEffect } from "react"

export function GlobalErrorReporter() {
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            console.error("Global Error Caught:", event.error)
            // Only show alert in production (or for this debugging session) to help user report issue
            alert(`Runtime Error: ${event.message}\n\nPlease report this to the developer.`)
        }

        const handleRejection = (event: PromiseRejectionEvent) => {
            console.error("Unhandled Rejection:", event.reason)
            alert(`Unhandled Promise Rejection: ${event.reason?.message || event.reason}\n\nPlease report this.`)
        }

        window.addEventListener("error", handleError)
        window.addEventListener("unhandledrejection", handleRejection)

        return () => {
            window.removeEventListener("error", handleError)
            window.removeEventListener("unhandledrejection", handleRejection)
        }
    }, [])

    return null
}
