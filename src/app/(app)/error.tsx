"use client"

import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

// Error boundary for the (app) route group — recoverable via reset().
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-brand-accent font-mono text-xs tracking-widest uppercase">
        Error
      </p>
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        Something went wrong
      </h2>
      <p className="text-muted-foreground text-sm">
        An unexpected error occurred while loading this page.
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
