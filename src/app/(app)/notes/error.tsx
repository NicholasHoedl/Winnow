"use client"

import { RouteError } from "@/components/shared/route-error"

export default function NotesError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError {...props} title="Couldn't load your notes" />
}
