import Link from "next/link"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

// Root 404 — renders inside the root layout (fonts + theme apply).
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-brand-accent font-mono text-sm tracking-widest uppercase">
        404
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="text-muted-foreground text-sm">
        That page doesn&apos;t exist or has moved.
      </p>
      <Link href="/" className={cn(buttonVariants())}>
        Back to dashboard
      </Link>
    </div>
  )
}
