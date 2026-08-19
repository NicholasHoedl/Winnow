"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import type { HabitStripCard } from "@/modules/habits/queries"
import { periodPhrase } from "@/modules/habits/service"
import { LogHabitButton } from "@/components/habits/log-habit-button"
import { QuotaMeter } from "@/components/ui/quota-meter"

/**
 * Today's practice, above the list of today's tasks.
 *
 * Habits lived in the rail until T12d, which meant they lived on desktop only — the rail is
 * `lg:flex`, and below that a phone got a link reading "Habits 3" and no way to log
 * anything. Logging a practice is the most phone-shaped action in the app and it was the one
 * action the page could not do. So this is ONE component at every width: the grid places the
 * column, the strip does not care how wide it is, and there is no second presentation to
 * drift from the first. That drift is what put habits in an `lg:`-only rail to begin with.
 *
 * It sits below the quick-add rather than above it. On a phone the goal chips are already a
 * horizontal scroller, and two of them back to back is unusable — the quick-add row between
 * them is what keeps this readable at 375px.
 *
 * **The guard that travelled here from the rail: a habit still gets no checkbox.** A quota
 * is not done-or-not-done (ADR-0014), and the moment one appears it is either duplicating
 * the `+1` or lying about what "done" means for a rate. The rail's rule — that it never
 * offers an action the task list beside it already offers — is unchanged; habits were simply
 * the wrong illustration of it, because nothing in that list can log one.
 *
 * A scroller rather than a wrapping grid, and that is the point of the change: wrapping
 * makes the page's height a function of how many habits you keep, which is exactly the
 * failure being fixed. One row is one row at three habits and at thirty.
 */
export function HabitStrip({
  habits,
  pendingId,
  onLog,
}: {
  habits: HabitStripCard[]
  /** The habit whose write is in flight — only that chip's control disables. */
  pendingId: string | null
  onLog: (habit: HabitStripCard, amount?: number) => void
}) {
  if (habits.length === 0) {
    return (
      <Link
        href="/activity/habits"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        Track a habit
        <ArrowRight className="size-3.5" />
      </Link>
    )
  }

  return (
    <section aria-label="Habits" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Habits
        </h2>
        {/* The only way out of the strip. Deliberately here and not on each chip: one
            interactive element per chip is what keeps a tap unambiguous on a phone. */}
        <Link
          href="/activity/habits"
          aria-label="Open habits"
          className="text-muted-foreground hover:text-foreground rounded p-1"
        >
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* `px-1` for the focus ring, and NO `-mx-1` to cancel it out.
          
          The pair came from `GoalChips`, which is deleted now — the margin pulled the
          scroller 4px past its parent on each side so the row sat flush while the padding
          kept a focused chip's ring from clipping. The bleed is a real overflow, and it was
          latent until T13 changed what contains this: it used to sit in a grid item and now
          sits in a plain block, which is enough for `mobile-layout.spec.ts` to see it as a
          spill at 393px ("needs 365px, has 361px").
          
          Keeping only the padding costs 4px of inset at each end and buys back a page that
          does not overflow. The ring still has its room, because the padding is inside the
          scroll container. `routines-line.tsx` hit the identical trap on the way in. */}
      <div className="flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {habits.map((habit) => (
          <div
            key={habit.id}
            data-testid="habit-chip"
            // Excludes this from `visibleCard` in the e2e helpers, which is
            // `div.bg-card:not([data-rail])`. Without it a habit and a task sharing a title
            // collide and the spec hangs on a "Task actions" button this chip does not have
            // — it has bitten twice. The attribute no longer means "in the rail"; what it
            // has always meant to that selector is "not a row in the task list", and the
            // rail was simply the only place that was true. `activity.spec.ts` asserts
            // `visibleCard(page, HABIT)` is 0, which is the only thing testing this.
            data-rail=""
            // `w-48`, up from `w-40`. T12d picked 160px against a page whose left 280px
            // belonged to the goal rail; T13 moved goals to their own page, so the 32px the
            // cadence line needs is now there to spend.
            className="bg-card w-48 shrink-0 snap-start rounded-lg border p-2.5"
          >
            <p className="truncate text-sm font-medium">{habit.title}</p>
            {/* The cadence used to be its own line above the bar, because `2/3` says
                nothing about whether you have the rest of today or the rest of the month to
                finish it — the difference between "fine" and "behind". It is the meter's
                caption now, which says the same thing in one row instead of two and buys
                back the vertical space T12d was short of. */}
            <QuotaMeter
              className="mt-1.5"
              name={habit.title}
              done={habit.now.done}
              target={habit.now.target}
              unit={habit.now.unit}
              measured={habit.now.measured}
              caption={periodPhrase(habit.period)}
            />
            {/* Full width rather than the rail's icon square: this is now the primary
                logging surface on a phone, and a 160px target is worth the row. Disabled
                only for ITS OWN habit — a shared flag would grey out the whole strip and
                imply the others were blocked. There is no unique constraint behind the
                write, so a double tap really is two rows. */}
            <LogHabitButton
              title={habit.title}
              unit={habit.now.unit}
              pending={pendingId === habit.id}
              className="mt-2 w-full"
              onLog={(amount) => onLog(habit, amount)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
