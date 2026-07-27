// Pure goal-progress logic. No DB, no framework — unit-testable directly.

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
