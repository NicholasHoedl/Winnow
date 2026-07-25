"use client"

// The once-a-day digest. Shown the first time the app is opened on a new local day,
// then not again that day on this device.
//
// Two pieces of state, deliberately kept apart:
//   • "seen"      — persisted per user in localStorage, keyed by the local date.
//                   Written as soon as the digest is fetched.
//   • "dismissed" — ephemeral React state driving visibility right now.
// Collapsing these into one (e.g. deriving visibility from the stored date) would
// hide the banner the instant it recorded itself as seen.

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Sun, X } from "lucide-react"

import { formatTime } from "@/lib/format"
import { getDigest } from "@/modules/digest/actions"
import { digestHeadline, type Digest } from "@/modules/digest/service"
import { Panel } from "@/components/shared/panel"

const KEY_PREFIX = "winnow:digest-seen:"
const MAX_EVENTS = 3

export function DigestBanner({
  userId,
  today,
  enabled,
  use24Hour,
}: {
  userId: string
  /** Today's date in the user's configured zone, computed on the server so this
   * never disagrees with the rest of the app (or with itself across hydration). */
  today: string
  enabled: boolean
  use24Hour: boolean
}) {
  const [digest, setDigest] = React.useState<Digest | null>(null)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) return
    const key = `${KEY_PREFIX}${userId}`

    let seen: string | null = null
    try {
      seen = window.localStorage.getItem(key)
    } catch {
      // Storage unavailable (private mode / blocked): fall through and just show it.
    }
    if (seen === today) return

    let cancelled = false
    void (async () => {
      let result: Digest | null = null
      try {
        result = await getDigest()
      } catch {
        return // a digest failure must never surface as an app error
      }
      if (cancelled) return
      // Record the day either way, so a quiet morning doesn't re-query on every
      // navigation.
      try {
        window.localStorage.setItem(key, today)
      } catch {
        /* nothing to do */
      }
      if (result) setDigest(result)
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, userId, today])

  if (!digest || dismissed) return null

  const counts: string[] = []
  if (digest.overdueCount > 0) counts.push(`${digest.overdueCount} overdue`)
  if (digest.dueTodayCount > 0) counts.push(`${digest.dueTodayCount} due today`)

  const events = digest.events.slice(0, MAX_EVENTS)
  const moreEvents = digest.events.length - events.length

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-6 lg:px-8">
      <Panel>
        <div role="status" className="flex items-start gap-4">
          <span className="bg-brand-accent/15 text-brand-accent flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Sun className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-brand-accent font-mono text-[0.7rem] font-medium tracking-widest uppercase">
              Daily digest
            </p>
            <h2 className="font-display mt-0.5 text-xl font-semibold tracking-tight">
              {digestHeadline(digest)}
            </h2>

            {counts.length > 0 && (
              <p className="text-muted-foreground mt-1 text-sm">
                {counts.join(" · ")}
              </p>
            )}

            {events.length > 0 && (
              <ul className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                {events.map((event, i) => (
                  <li key={i} className="truncate">
                    <span className="tabular-nums">
                      {event.time
                        ? formatTime(event.time, use24Hour)
                        : "all-day"}
                    </span>{" "}
                    {event.title}
                  </li>
                ))}
                {moreEvents > 0 && <li>+{moreEvents} more</li>}
              </ul>
            )}

            {digest.unmetMacros.length > 0 && (
              <p className="text-muted-foreground mt-1 text-sm">
                Still to hit:{" "}
                {digest.unmetMacros
                  .map((m) => `${m.remaining}${m.unit} ${m.label}`)
                  .join(" · ")}
              </p>
            )}

            <Link
              href="/today"
              className="text-foreground mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Open Today
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss digest"
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 shrink-0 rounded-md p-1 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </Panel>
    </div>
  )
}
