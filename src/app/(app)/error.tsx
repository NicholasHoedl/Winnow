"use client"

import { RouteError } from "@/components/shared/route-error"

// Error boundary for the (app) route group — the catch-all when a page has no boundary
// of its own. It predates `RouteError` and duplicated its markup inline; the defaults
// are identical, so delegating loses nothing and leaves one place to restyle.
export default function AppError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError {...props} />
}
