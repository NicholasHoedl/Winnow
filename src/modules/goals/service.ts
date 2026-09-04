// Pure goal-progress logic. No DB, no framework — unit-testable directly.

import { addDays, dayDiff, todayInZone } from "@/lib/date"

/** The measurable columns on a goal. Taken as a shape, not a row, so tests stay literals. */
export type GoalMeasure = {
  targetValue: number | null
  currentValue: number | null
  unit: string | null
}

/**
 * How a goal's progress should be read — discriminated so a caller can't accidentally
 * render an unmeasurable goal as 0%.
 *
 * `none` exists because the previous shape had no way to express it: a goal with no
 * milestones returned `{done: 0, total: 0, percent: 0}`, which is indistinguishable from
 * a goal whose milestones are all incomplete. The dashboard rail rendered that as "0/0"
 * beside a 2%-wide bar — a number that means nothing next to progress that doesn't exist.
 */
export type GoalProgress =
  | { kind: "milestones"; done: number; total: number; percent: number }
  | {
      kind: "numeric"
      current: number
      target: number
      unit: string | null
      percent: number
    }
  | { kind: "none" }

/**
 * Precedence: milestones → numeric → none.
 *
 * Milestones win when both are set. They're the more specific statement of intent, and
 * combining the two into a single bar would be arithmetic nobody asked for.
 *
 * The percentage is NOT clamped. A goal can be overshot ("12 of 10 lbs"), and the honest
 * number is what gets announced — it's the bar's width that has to be clamped, the same
 * split T4-S9 settled on for over-target macros.
 */
export function goalProgress(
  milestones: { done: boolean }[],
  goal: GoalMeasure,
): GoalProgress {
  if (milestones.length > 0) {
    const total = milestones.length
    const done = milestones.filter((mile) => mile.done).length
    return {
      kind: "milestones",
      done,
      total,
      percent: Math.round((done / total) * 100),
    }
  }

  // A target of 0 (or less) isn't "instantly complete", it's not a target — and it would
  // divide by zero on the way to saying so.
  const target = goal.targetValue
  if (target != null && target > 0) {
    const current = goal.currentValue ?? 0
    return {
      kind: "numeric",
      current,
      target,
      unit: goal.unit,
      percent: Math.round((current / target) * 100),
    }
  }

  return { kind: "none" }
}

/**
 * Whether a goal is *moving*, as distinct from how far along it is.
 *
 * `goalProgress` above answers "how far", and it is deliberately untouched by this. The
 * two measure different things and conflating them loses both: a goal three-quarters done
 * that you abandoned last month and a goal three-quarters done that you worked yesterday
 * report the same progress, and that gap is the whole reason this exists. Milestones are
 * lumpy and hand-maintained; finished work accumulates on its own as you use the app.
 */
export type GoalMomentum = {
  /**
   * Linked tasks completed, milestones ticked, and habit sessions logged whose LOCAL date
   * falls in the window.
   */
  moved: number
  /** Nothing at all finished in the window. */
  stalled: boolean
  /** Echoed so a caller can label the reading without re-deriving the setting. */
  windowDays: number
}

export type MomentumInput = {
  /** `completedAt` of every linked task and milestone on this goal. Nulls are ignored. */
  completedAt: (Date | null | undefined)[]
  /**
   * `on_date` of every entry logged against this goal's habits (T12b).
   *
   * A separate input rather than more `completedAt` because these are already LOCAL wall
   * dates — a habit entry records the day you say it happened, not an instant — so they are
   * compared directly and must not go through `todayInZone` a second time. Converting a
   * date-only string as if it were an instant is how a 10pm session ends up on tomorrow.
   */
  loggedOn?: readonly string[]
  /**
   * How many linked tasks, milestones and habits exist at all. Zero means there is nothing
   * this measure can see, which is NOT the same as stalled — see the null return below.
   */
  trackableCount: number
  /**
   * When the goal was made, so a brand-new one is not accused of having stalled.
   *
   * An instant rather than a wall date because that is what the column holds; it is
   * converted with `timeZone` below, for the same reason every other date here is.
   */
  createdAt: Date
  windowDays: number
  /** Today as a local wall date, so the window is in the user's days, not UTC's. */
  today: string
  timeZone: string
}

/**
 * How long a goal is left alone before it can be called stalled.
 *
 * **A goal is not stalled the moment it is made.** Reported from real use: creating one and
 * being told immediately that it had stalled, about work nobody had yet had a chance to do.
 * The badge exists to notice neglect, and there is no neglect on day one.
 *
 * A week, fixed, rather than following `goalMomentumDays`. The two are different questions —
 * the window is how far back to look, this is how long before looking is fair — and tying
 * them would mean a 30-day setting bought a month of silence, which is longer than the nudge
 * is worth waiting for.
 */
export const MOMENTUM_GRACE_DAYS = 7

/**
 * Null when the goal has nothing to track — no linked tasks, no milestones, no habits.
 *
 * That case is a numeric goal ("12 of 30 books") or an empty one, and it must not render
 * as stalled. `goals.currentValue` is overwritten in place with no history, so a goal you
 * updated an hour ago is indistinguishable from one you last touched in March: there is
 * genuinely nothing to measure, and a stalled badge would be an outright lie about a goal
 * you are actively working. Showing nothing is the honest answer.
 *
 * **Habit sessions count as movement (T12b), and that is the point of the primitive.**
 * Before it, a goal whose work was "attend 3 classes a week" produced no completed tasks and
 * no ticked milestones, so it read *Stalled* forever while being worked hard — the badge
 * crying wolf on precisely the goals it should stay quiet about. Adherence is deliberately
 * NOT surfaced here: the rail already shows each habit's own `2/3` beside this, and momentum
 * answers "is this alive", which is a different question from "how well".
 *
 * Window is inclusive of today and the `windowDays - 1` days before it, so "1 week" means
 * today plus six, not today plus seven.
 */
export function goalMomentum(input: MomentumInput): GoalMomentum | null {
  const {
    completedAt,
    loggedOn,
    trackableCount,
    createdAt,
    windowDays,
    today,
    timeZone,
  } = input
  if (trackableCount === 0) return null

  const start = addDays(today, -(windowDays - 1))
  let moved = 0
  for (const at of completedAt) {
    if (!at) continue
    const on = todayInZone(at, timeZone)
    // The upper bound is not paranoia: account import accepts arbitrary timestamps, and
    // one future-dated row would otherwise inflate this count forever.
    if (on >= start && on <= today) moved += 1
  }
  for (const on of loggedOn ?? []) {
    // Already a local wall date — no conversion, same bounds. `logEntry` allows a backfill
    // up to ±370 days, so the upper bound earns its keep here too.
    if (on >= start && on <= today) moved += 1
  }

  // Nothing has moved AND the goal is younger than the grace period: withhold the reading
  // rather than make an accusation nobody has had time to deserve.
  //
  // **Only the false half is suppressed.** `moved > 0` falls straight through to the reading
  // below, so a goal created and worked on the same day still says Moving — hiding that
  // would trade one wrong answer for another.
  //
  // Null, not a third state, and that is what keeps this to one function: it is the same
  // answer a goal with nothing trackable already gets, so the card renders no badge and the
  // detail dialog omits its line without either of them learning a new case.
  //
  // Local wall dates on both sides, matching the window above. `createdAt` is an instant, and
  // 23:00 on the 28th in Chicago is 04:00Z on the 29th — a day either way is exactly the
  // difference between a reading and none.
  if (
    moved === 0 &&
    dayDiff(todayInZone(createdAt, timeZone), today) < MOMENTUM_GRACE_DAYS
  ) {
    return null
  }

  return { moved, stalled: moved === 0, windowDays }
}
