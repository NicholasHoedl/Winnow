// Pure goal-progress logic. No DB, no framework — unit-testable directly.

import { addDays, todayInZone } from "@/lib/date"

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
  /** Linked tasks completed + milestones ticked whose LOCAL date falls in the window. */
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
   * How many linked tasks and milestones exist at all. Zero means there is nothing this
   * measure can see, which is NOT the same as stalled — see the null return below.
   */
  trackableCount: number
  windowDays: number
  /** Today as a local wall date, so the window is in the user's days, not UTC's. */
  today: string
  timeZone: string
}

/**
 * Null when the goal has nothing to track — no linked tasks and no milestones.
 *
 * That case is a numeric goal ("12 of 30 books") or an empty one, and it must not render
 * as stalled. `goals.currentValue` is overwritten in place with no history, so a goal you
 * updated an hour ago is indistinguishable from one you last touched in March: there is
 * genuinely nothing to measure, and a stalled badge would be an outright lie about a goal
 * you are actively working. Showing nothing is the honest answer.
 *
 * Window is inclusive of today and the `windowDays - 1` days before it, so "1 week" means
 * today plus six, not today plus seven.
 */
export function goalMomentum(input: MomentumInput): GoalMomentum | null {
  const { completedAt, trackableCount, windowDays, today, timeZone } = input
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

  return { moved, stalled: moved === 0, windowDays }
}
