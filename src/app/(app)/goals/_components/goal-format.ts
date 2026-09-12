/**
 * Goal date and window wording, shared by the rail and the detail dialog.
 *
 * Both used to live inside the single goals-page component. Splitting that page into a
 * compact rail card and a detail dialog gave them two callers, so they moved here rather
 * than being copied — two copies of "the last week" is how the two surfaces end up
 * disagreeing about the same number.
 */

import type { GoalProgress } from "@/modules/goals/service"

/**
 * What a goal that has arrived says, or null while it is still running (T44).
 *
 * Shared for the reason everything else here is: the card and the detail dialog both have
 * to say it, and two spellings of "finished" is how one surface ends up congratulating you
 * while the other still reads as work outstanding. The percentage is deliberately
 * unclamped upstream, so at-or-past target is the test — overshooting is still arriving.
 *
 * A goal with nothing to measure is never complete: there is no target to have reached.
 */
export function goalEnding(progress: GoalProgress): string | null {
  if (progress.kind === "none" || progress.percent < 100) return null
  return progress.kind === "milestones"
    ? "All milestones done"
    : "Target reached"
}

/**
 * Reads inside a sentence, unlike the settings label ("2 weeks"), which reads as a
 * heading. Same number, different grammar.
 */
export function windowLabel(days: number): string {
  if (days === 7) return "the last week"
  if (days === 30) return "the last month"
  return `the last ${days} days`
}

/**
 * A plain `YYYY-MM-DD` rendered as "Aug 30, 2026" (or "30 Aug 2026"), read as a calendar
 * date, not an instant. `locale` is required for the reason `formatLongDate`'s is.
 */
export function formatGoalDate(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
