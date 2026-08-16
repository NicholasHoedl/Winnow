"use client"

import Link from "next/link"
import { ArrowRight, ListChecks, Play } from "lucide-react"

import { cn } from "@/lib/utils"
import type { RoutineWithItems } from "@/modules/routines/queries"
import { Button } from "@/components/ui/button"

/**
 * Routines on `/activity`, and the rail that used to hold them.
 *
 * **There is no rail any more.** It was an `<aside>` carrying the goals block and this line,
 * and T13 moved goals to their own page — leaving an aside with one line in it, which is a
 * column, not a rail. `ActivityRail` is gone and this renders in the page flow at every
 * width, which is what it already did on a phone.
 *
 * The rule the rail was built on is worth keeping even though its surface is not, because it
 * is the same one that removed the goal card's linked-task list in T10a:
 *
 *   **never offer an action the task list beside it already offers.**
 *
 * Routines survive here by that rule: running one CREATES tasks, which the list cannot do
 * for you. Goals never had an action under it — every task a goal owns is already a row you
 * can tick — which is exactly why moving them off this page costs nothing but a glance, and
 * the glance is what `/goals` and the dashboard's `GoalsPracticeCard` are for.
 *
 * `HANDLE_GUTTER` went with the rail. It was `pl-7`, aligning this line with the goal cards'
 * drag handles; with no goal cards on the page there is nothing to align to, and the `pl-0`
 * override the mobile copy needed goes away with it.
 */

/**
 * Routines: a link to the page, and a Run control per routine.
 *
 * **The per-routine button is back, and T12d's comment argued against exactly this**, so the
 * disagreement is worth settling in writing rather than leaving the next reader to notice
 * the reversal. T12d collapsed a block of cards into one `Run…` picker and said: "if the
 * picker step proves annoying, the fix is to make the menu better, not to put a button back
 * on every routine."
 *
 * That was right about the CAUSE and its fix bound the wrong axis. The complaint was that
 * the rail "grew without bound — a rail of three goals, two routines and three habits
 * measured 724px" — vertical growth, in a 280px sticky column, competing with goals and
 * habits for the same scroll. The picker fixed it by removing the per-routine control
 * entirely, which also removed the one action T12d itself called "the rail rule's own
 * justifying example".
 *
 * There is no rail now. This is a horizontal scroller in the page flow, so length costs
 * nothing vertically and is contained by `overflow-x-auto` — the same mechanism
 * `habit-strip.tsx` already uses one row below, and for the same reason. The constraint the
 * old block violated is genuinely gone rather than merely relaxed, which is what makes this
 * a re-decision rather than a regression.
 *
 * Kept from T12d: the link to the page and the count, so the empty case still says nothing
 * here and explains itself where there is room.
 */
export function RoutinesLine({
  routines,
  onRun,
  className,
}: {
  routines: RoutineWithItems[]
  onRun: (routine: RoutineWithItems) => void
  className?: string
}) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      data-testid="routines-line"
    >
      <Link
        href="/activity/routines"
        className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm"
      >
        <ListChecks className="size-4 shrink-0" />
        <span className="font-medium">Routines</span>
        <span className="tabular-nums">· {routines.length}</span>
        <ArrowRight className="size-3.5 shrink-0" />
      </Link>

      {/* Nothing rather than an empty scroller at zero: the sentence explaining what a
          routine IS lives on the page the link goes to, where there is room to say it
          properly. */}
      {routines.length > 0 && (
        // `flex-1 min-w-0` so the row shrinks to whatever is left beside the link, and NO
        // negative margin. Copying `-mx-1 px-1` from the habit strip cost 4px of overflow
        // here — and it turned out to be costing it there too, latently, so that pattern is
        // now gone from both. `mobile-layout.spec.ts` caught each at 393px.
        <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-1">
          {routines.map((routine) => (
            <Button
              key={routine.id}
              variant="outline"
              size="sm"
              className="shrink-0 snap-start"
              // The name is the visible text, so the accessible name has to say what the
              // press DOES — otherwise a screen reader announces a bare routine title and
              // the button is indistinguishable from a link to it.
              aria-label={`Run ${routine.name}`}
              onClick={() => onRun(routine)}
            >
              <Play className="size-3.5" />
              {routine.name}
              <span className="text-muted-foreground pl-1 text-xs tabular-nums">
                {routine.items.length}
              </span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
