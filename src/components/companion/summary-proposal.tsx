"use client"

import { ScrollText } from "lucide-react"

import type { SummaryPayload } from "@/modules/companion/validation"
import { summaryObservations } from "@/modules/companion/service"
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
 * which is why the footer points at them: those cards are the arithmetic, this is the
 * reading of it.
 *
 * **That footer used to be a link to `/review`, and it stopped meaning anything at T13.**
 * It was written when this panel lived on `/companion`, where the figures genuinely were a
 * page away. T13 moved each tool onto the page of the artifact it produces, so the link
 * began pointing at the page it was already on — inert on the current week, and quietly
 * worse on any other, because bare `/review` drops the `?week=` you were reading. Reported
 * as a dead button, which is exactly what it was.
 *
 * A same-page anchor now, because the figures did not disappear — they moved BELOW this
 * panel, which can fill the viewport on a phone (`max-h-[55svh]`) and take the column on a
 * desktop (`lg:flex-1`). Getting to them is the thing the footer was always promising.
 */
/**
 * The id on the review page's figure grid, which the footer below scrolls to.
 *
 * Exported from HERE rather than from `review-view.tsx` so the two cannot drift: a plain
 * string in each file is two chances to rename one and not the other, and a fragment link
 * to an id nothing carries fails silently — exactly how the old `/review` link went dead
 * without anything noticing. The import direction is the only one allowed anyway, since a
 * component in `components/` may not reach into `app/`.
 */
export const WEEK_FIGURES_ID = "week-figures"

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
          {summaryObservations(payload).map((observation, index) => (
            <p key={index} className="text-sm leading-relaxed">
              {observation}
            </p>
          ))}
        </div>
      </div>

      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
        {/* A plain anchor, matching the shell's own "Skip to content" — it needs no
            JavaScript, stays keyboard- and right-click-friendly, and jumps rather than
            animating, which is the honest default with no reduced-motion handling here. */}
        <a
          href={`#${WEEK_FIGURES_ID}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
        >
          <ScrollText className="size-3.5 shrink-0" aria-hidden />
          See the figures behind this
        </a>
        <Button size="sm" onClick={onDone} disabled={pending}>
          Done
        </Button>
      </div>
    </div>
  )
}
