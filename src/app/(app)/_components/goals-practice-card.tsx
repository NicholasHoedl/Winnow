"use client"

import Link from "next/link"

import type { HabitStripCard } from "@/modules/habits/queries"
import { periodPhrase } from "@/modules/habits/service"
import { useLogHabit } from "@/modules/habits/use-log-habit"
import { LogHabitButton } from "@/components/habits/log-habit-button"
import { QuotaMeter } from "@/components/ui/quota-meter"

import { DashboardCard } from "./dashboard-card"

import {
  groupPracticeByPeriod,
  type PracticePeriod,
} from "../_lib/goal-practice"

/**
 * A goal, reduced to the two fields this card still draws.
 *
 * It carried `progress` and `stalled` as well, for the per-goal headings this card used to
 * group by — bars, counts and a stalled badge. Those went with the grouping: habits are
 * organised by cadence now and the goal survives as an annotation on the row, so a title
 * and the id to match it by is the whole of what is read.
 *
 * The narrowing matters beyond tidiness. This is a client component — it has to be,
 * because a habit can be logged from here — so everything it receives is serialised into
 * the RSC payload and shipped to the browser. `GoalProgress` is a discriminated union with
 * up to five fields per goal and none of them are drawn any more.
 */
export type GoalPracticeRow = {
  id: string
  title: string
}

/** "Daily" over the day group, and so on. The heading a period gets. */
const PERIOD_HEADING: Record<PracticePeriod, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
}

function HabitRow({
  habit,
  goalTitle,
  pending,
  onLog,
}: {
  habit: HabitStripCard
  /** The goal this practice serves, or undefined when it serves none. */
  goalTitle?: string
  pending: boolean
  onLog: (amount?: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{habit.title}</p>
        {/* One box per log you owe, filled as you make them. This card showed "2/3 this
            week" as bare text and no bar at all — the only habit surface that did — so it
            gains a bar and loses a number in the same stroke. The cadence stays: boxes say
            how many are left, not whether you have the rest of today or the rest of the
            month to make them. */}
        <QuotaMeter
          className="mt-1"
          name={habit.title}
          done={habit.now.done}
          target={habit.now.target}
          unit={habit.now.unit}
          measured={habit.now.measured}
          caption={periodPhrase(habit.period)}
        />
        {/* Its own line, and NOT the meter's caption slot — which is where this started.
            That slot is free-looking now the group heading states the cadence, but
            `QuotaMeter` builds its `aria-valuetext` from the same string: putting the goal
            there turned "0 of 3 this week" into "0 of 3 Lose 15 pounds" and took the
            cadence out of the announcement. The meter IS the count for a screen reader —
            that is the whole reason `aria-valuetext` is set — so the caption stays the
            period and the goal costs a line.

            Only when there is one. A practice kept for its own sake, or one whose goal was
            deleted, simply has no annotation; it used to be sorted into a "not tied to a
            goal" group, and grouping by cadence retires that idea rather than relabelling
            it. */}
        {goalTitle && (
          <p className="text-muted-foreground mt-0.5 truncate text-[0.7rem]">
            {goalTitle}
          </p>
        )}
      </div>
      {/* A habit gets no checkbox, here or anywhere (ADR-0013's amendment). A quota is not
          done-or-not-done, and the moment a tick appears it is either duplicating this
          button or lying about what "done" means for a rate. */}
      <LogHabitButton
        title={habit.title}
        unit={habit.now.unit}
        pending={pending}
        size="sm"
        onLog={onLog}
      />
    </div>
  )
}

/**
 * The practice you keep, by how often you keep it.
 *
 * **It showed goals until now, and grouped the habits under them** — a heading per goal
 * with its progress bar, and its practice indented beneath. Reported from real use: with
 * four or five goals that arrangement answers "what is this for" at the cost of the
 * question a dashboard is opened to ask, which is what you have to do today. Habits are
 * grouped by cadence now and each row names its goal instead.
 *
 * **Two things left the dashboard with that change, and both were deliberate before.** A
 * goal's progress — the bar, the count and the stalled badge — is on `/goals` only; and a
 * goal with NO practice has nothing to render here at all, where it used to get a heading
 * of its own. That was the cost of the choice and it was made knowingly; the "Goals →"
 * link below is the way to what is no longer shown.
 *
 * The card key stays `goals` even though the title is "Practice". It is what the collapse
 * preference is stored under (`DASHBOARD_CARDS`), and renaming it would silently orphan a
 * fold the user had set — `preferencesFor` filters against that list, so an unknown key
 * degrades to "not collapsed" rather than failing loudly.
 *
 * **Nothing is truncated.** The habits card this descends from capped at three with a
 * `+N more`; that cap is gone and stays gone, which is also why the unmet-first re-sort
 * went — it existed only to make a cut safe.
 *
 * A client component, unlike most of this page, because it can be acted on: a habit is the
 * one thing here you can finish without going anywhere. It logs through `useLogHabit`, the
 * same hook `/activity`'s strip and the habits page use.
 */
export function GoalsPracticeCard({
  goals,
  habits,
  collapsed,
}: {
  goals: GoalPracticeRow[]
  habits: HabitStripCard[]
  collapsed: boolean
}) {
  const { pendingId, log } = useLogHabit()

  // Nothing at all when there is no practice, exactly as the cards this descends from did.
  // Someone who has made no habit should not find an empty box on their dashboard — and
  // `loading.tsx` deliberately reserves no space for this card because of it, so a
  // placeholder here would be a jump rather than a courtesy.
  //
  // Habits alone now, where it used to be habits OR goals: a goal with no practice has
  // nothing for this card to draw.
  if (habits.length === 0) return null

  const groups = groupPracticeByPeriod(habits)
  const short = habits.filter((habit) => !habit.now.met)
  // Titles by id, so a row can name its goal. A Map rather than a `find` per row: this
  // runs on every render of the dashboard's hottest card.
  const goalTitles = new Map(goals.map((goal) => [goal.id, goal.title]))

  return (
    <DashboardCard card="goals" title="Practice" collapsed={collapsed}>
      <div className="flex flex-col gap-4">
        {/* It answers "am I behind?" about the rows directly beneath it, so it belongs
            with the list rather than in the header — and folding the card should take it
            away along with them. */}
        <p className="text-muted-foreground -mt-1 text-xs">
          {short.length === 0
            ? "All met"
            : `${short.length} of ${habits.length} short`}
        </p>

        {groups.map((group) => (
          <div key={group.period}>
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {PERIOD_HEADING[group.period]}
            </h3>
            <div className="mt-2 flex flex-col gap-2 pl-3">
              {group.habits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  // `?? undefined` rather than the id: a habit whose goal is not in this
                  // list — deleted, or filtered out by the caller — draws no annotation
                  // instead of a uuid.
                  goalTitle={
                    habit.goalId
                      ? (goalTitles.get(habit.goalId) ?? undefined)
                      : undefined
                  }
                  pending={pendingId === habit.id}
                  onLog={(amount) => log(habit, amount)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* The two links, moved down out of the header.

            They were `actions`, and between them and the title the header wanted more room
            than the dashboard's left column has: "Goals & practice" rendered as
            "Goals & pr..." at 1280px. Shortening the words would have bought a dozen pixels
            and left the same fault one longer word away.

            Below the list is also where they belong. This card has two subjects, and these
            are the way out to each — a destination after the content, not a control that
            competes with the heading. Same move the "N short" line above made, and for the
            same reason: the header holds the name and the fold, and nothing else. */}
        <div className="flex items-center gap-4 border-t pt-3">
          <Link
            href="/goals"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Goals →
          </Link>
          <Link
            href="/activity/habits"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Habits →
          </Link>
        </div>
      </div>
    </DashboardCard>
  )
}
