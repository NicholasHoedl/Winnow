"use client"

import Link from "next/link"
import { ScrollText } from "lucide-react"

import type { SummaryPayload } from "@/modules/companion/validation"
import { Button } from "@/components/ui/button"

/**
 * The narrated week.
 *
 * The odd one out, and deliberately so: **no spine, no checkboxes, no Apply.** A paragraph
 * is not a row, so there is nothing to prune, nothing to renumber and nothing to create —
 * `applyProposalSchema` has no arm for this kind at all. One button, Done, which clears it
 * from the queue.
 *
 * It is also read-only. The other two renderers let you fix what the model got wrong
 * because their output becomes data you keep; this output IS the answer, and an edited
 * summary is just something you wrote yourself. Regenerate or refine instead.
 *
 * Every figure it narrates was computed by `buildWeeklyReview` before the model saw it,
 * which is why the link to `/review` sits in the footer: that page is the arithmetic, this
 * is the reading of it.
 */
export function SummaryProposal({
  payload,
  weekLabel,
  pending,
  onDone,
}: {
  payload: SummaryPayload
  weekLabel: string
  pending: boolean
  onDone: () => void
}) {
  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border lg:min-h-0">
      <div className="border-b p-4">
        <p className="text-brand-accent text-xs font-medium">Your week</p>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {payload.headline}
        </h2>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {weekLabel}
        </p>
      </div>

      <div className="max-h-[55svh] overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1">
        <div className="flex flex-col gap-3">
          {payload.observations.map((observation, index) => (
            <p key={index} className="text-sm leading-relaxed">
              {observation}
            </p>
          ))}
        </div>
      </div>

      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
        <Link
          href="/review"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
        >
          <ScrollText className="size-3.5 shrink-0" aria-hidden />
          See the figures behind this
        </Link>
        <Button size="sm" onClick={onDone} disabled={pending}>
          Done
        </Button>
      </div>
    </div>
  )
}
