"use client"

import { RouteError } from "@/components/shared/route-error"

/**
 * The companion was the only route with no boundary of its own, which is backwards: it is
 * the only segment that makes an outbound HTTP call to a provider the user configured
 * themselves, so it is the one most likely to throw. Errors escaped to `(app)/error.tsx`
 * and read as "the whole app broke" rather than "the model did not answer".
 */
export default function CompanionError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError {...props} title="Couldn't reach the companion" />
}
