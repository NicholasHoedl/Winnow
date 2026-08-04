"use client"

// Last-resort boundary: replaces the root layout (so globals.css is not loaded).
// Inline styles guarantee it renders even when everything else has failed.
//
// The five colours below are therefore hand-copied from globals.css and nothing enforces
// it. They are --foreground, --background, --muted-foreground, --primary and
// --primary-foreground, light theme only: a crash page that guesses at the OS theme is
// more machinery than a page this rare is worth.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#1c1d1f",
          background: "#fbf6f3",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h2>
        <p style={{ color: "#594b3a", margin: 0 }}>
          A critical error occurred. Please reload the app.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#577f67",
            color: "#fdfaf9",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
