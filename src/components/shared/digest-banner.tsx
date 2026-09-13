"use client"

// The once-a-day digest. Shown the first time the app is opened on a new local day,
// then not again that day on this device.
//
// The digest itself is computed during the app shell's SERVER render and handed here as a
// prop (T45). It used to be fetched from an effect, which made this heading the largest
// contentful paint on six of eight routes — it could not appear until a Server Action POST
// (676–825ms on a 5G profile) had landed, so the page's LCP was pinned 30–70ms behind it.
// Whether it belongs on screen is still a client decision — only this device knows what it
// has already been shown today — so it renders nothing until that answer is in.
//
// Two pieces of state, deliberately kept apart:
//   • "seen"      — persisted per user in localStorage, keyed by the local date.
//                   Written as soon as the banner decides to show itself.
//   • "dismissed" — ephemeral React state driving visibility right now.
// Collapsing these into one (e.g. deriving visibility from the stored date) would
// hide the banner the instant it recorded itself as seen.

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Sun, X } from "lucide-react"

import { formatTime } from "@/lib/format"
import { digestHeadline, type Digest } from "@/modules/digest/service"
import { Panel } from "@/components/shared/panel"
import { useHydrated } from "@/components/shared/use-hydrated"

const KEY_PREFIX = "winnow:digest-seen:"
const MAX_EVENTS = 3

/** The day this device last had a digest, or null — including when storage is blocked
 *  (private mode), where the honest answer is "no record", so it shows. */
function readSeen(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function DigestBanner({
  userId,
  today,
  digest,
  use24Hour,
}: {
  userId: string
  /** Today's date in the user's configured zone, computed on the server so this
   * never disagrees with the rest of the app (or with itself across hydration). */
  today: string
  /** Today's digest, or null when there is nothing worth interrupting for — which
   * includes the digest preference being off (see `computeDigest`). */
  digest: Digest | null
  use24Hour: boolean
}) {
  const key = `${KEY_PREFIX}${userId}`

  /**
   * False through the server render AND the first client render, so hydration matches by
   * construction. Whether this device has already had today's digest lives in localStorage,
   * which the server cannot see, and anything read from storage DURING render mismatches in
   * a way React "won't patch up" (see `use-hydrated.ts`).
   *
   * The hydration flag is safe here, unlike in `AppearanceSync`: this sits BESIDE
   * `{children}` in the (app) layout rather than above it, so the re-render it forces
   * reaches this banner and nothing else — no page body, no Suspense boundary.
   */
  const hydrated = useHydrated()

  /**
   * Latched at mount, and that is the whole reason it is state rather than a read.
   *
   * The effect below records the day as soon as the banner shows, so a later render that
   * re-read storage would answer "already seen" and hide the banner it had just recorded —
   * exactly the collapse the note at the top of this file warns about. The initializer runs
   * on the server too (returning null); nothing renders from it until `hydrated`, so the
   * first client render still matches.
   */
  const [seenAtMount] = React.useState<string | null>(() => readSeen(key))
  const [dismissed, setDismissed] = React.useState(false)

  const shown = hydrated && seenAtMount !== today && !dismissed

  React.useEffect(() => {
    if (seenAtMount === today) return
    // Recorded whether or not there was anything to say, which is what this key has always
    // meant: this device has had its digest for today. A quiet morning that recorded
    // nothing would otherwise put the banner back on the next page of the same day.
    try {
      window.localStorage.setItem(key, today)
    } catch {
      /* storage blocked; the banner simply shows again next page */
    }
  }, [seenAtMount, key, today])

  // Nothing in the document until it is actually shown.
  //
  // It rendered its markup `hidden` at first, so the reveal would be one attribute rather
  // than a DOM to build. That bought nothing measurable and cost two real things: ~1.5KB of
  // markup in EVERY authenticated document, on all thirteen routes, for the one load a day
  // that uses it; and a copy of "N overdue · N due today" sitting invisibly above
  // `{children}`, which is earlier in DOM order than the task list's own Overdue heading and
  // so became the first hit for any loose `getByText` (it broke `goals-linked-tasks`).
  //
  // There is no flash either way and no layout jump either way: `hidden` is `display: none`,
  // so revealing it moved the page down exactly as mounting it does.
  if (!digest || !shown) return null

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

            {/* Pointed at /today until that page's agenda was folded into the
                dashboard. The banner renders on every authenticated route, so the link
                still earns its place from /activity or /meals — it is only redundant on the
                dashboard itself, where the agenda it promises is already on screen. */}
            <Link
              href="/"
              className="text-foreground mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Open dashboard
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
