// About this file: the root layout around every route, signed in or not. It sets up the
// fonts, page metadata, theme, toasts and the service worker registration.
//
// What you'll find here:
// - `bricolage`, `fraunces`, `jetbrainsMono`: the three `next/font` families, exposed as
//   CSS variables on `<html>`.
// - `metadata`: the title, description and home-screen web app settings.
// - `viewport`: edge-to-edge layout, and the browser chrome's light and dark colors.
// - `RootLayout`: `<html>` and `<body>`, with `RegisterServiceWorker`, and a
//   `ThemeProvider` around the page and the `Toaster`.
//
// Related: `src/app/(app)/layout.tsx`, the signed-in shell rendered inside this one.

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

// Not preloaded, unlike the two above (T45). `next/font` emits a `<link rel="preload">` for
// every family by default, so all three faces — 145KB — were fetched at the highest priority
// before first paint on every route, and the mono was measured as the last thing that paint
// waited on across five of them. It is the smallest job of the three: eyebrow labels, tabular
// figures and code. `display: "swap"` already covers the gap, so it loads on demand and the
// numbers it styles are laid out by the fallback for a frame rather than the page waiting.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
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
