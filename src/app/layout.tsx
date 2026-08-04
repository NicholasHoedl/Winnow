import type { Metadata, Viewport } from "next"
import { Bricolage_Grotesque, Fraunces, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

// Variable fonts — full weight range loaded so we can use the extremes
// (extralight display numerals ↔ extrabold headings) per the type system.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
})

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Winnow",
  description: "Your life, organized in one place.",
  // Installable PWA — manifest + icons live in app/manifest.ts and app/apple-icon.
  // The service worker (public/sw.js, registered below) caches static assets and serves
  // an offline page; it caches no user data. See ADR-0007.
  appleWebApp: {
    capable: true,
    title: "Winnow",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  viewportFit: "cover",
  // Must track --background in globals.css; these are read by the OS chrome, which
  // cannot see a CSS variable.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1d1f" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <RegisterServiceWorker />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
