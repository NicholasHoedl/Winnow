"use client"

import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

// Shared body for per-segment error boundaries (the modules' error.tsx files).
// Recoverable via reset(); mirrors the (app) group boundary's look.
export function RouteError({
  error,
  reset,
  title = "Something went wrong",
  message = "An unexpected error occurred while loading this page.",
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-brand-accent font-mono text-xs tracking-widest uppercase">
        Error
      </p>
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="text-muted-foreground text-sm">
        {message}
        {error.digest && (
          <span className="mt-1 block font-mono text-xs">({error.digest})</span>
        )}
      </p>
      <Button onClick={reset}>
        <RotateCw className="size-4" />
        Try again
      </Button>
    </div>
  )
}
