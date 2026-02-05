import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/toaster"
import { GlobalErrorReporter } from "@/components/global-error-reporter"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "HackMate AI - Turn Hackathon Ideas into Execution",
  description:
    "AI-powered collaboration platform that helps hackathon teams clarify ideas, distribute tasks, manage time, and receive real-time mentorship.",


}

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-y-scroll">
      <body className={`font-sans antialiased`}>
        <GlobalErrorReporter />
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}


// import type React from "react"
// import type { Metadata, Viewport } from "next"
// import { Geist, Geist_Mono } from "next/font/google"
// import { Analytics } from "@vercel/analytics/next"
// import { AuthProvider } from "@/lib/auth-context"
// import { Toaster } from "@/components/ui/toaster"
// import { Providers } from "./providers"
// import "./globals.css"

// const geist = Geist({ subsets: ["latin"] })
// const geistMono = Geist_Mono({ subsets: ["latin"] })

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode
// }) {
//   return (
//     <html lang="en" suppressHydrationWarning>
//       <body className="app-root">
//         <Providers>
//           <AuthProvider>
//             {children}
//             <Toaster />
//           </AuthProvider>
//         </Providers>
//         <Analytics />
//       </body>
//     </html>
//   )
// }


