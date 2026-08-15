/**
 * Goal date and window wording, shared by the rail and the detail dialog.
 *
 * Both used to live inside the single goals-page component. Splitting that page into a
 * compact rail card and a detail dialog gave them two callers, so they moved here rather
 * than being copied — two copies of "the last week" is how the two surfaces end up
 * disagreeing about the same number.
 */

/**
 * Reads inside a sentence, unlike the settings label ("2 weeks"), which reads as a
 * heading. Same number, different grammar.
 */
export function windowLabel(days: number): string {
  if (days === 7) return "the last week"
  if (days === 30) return "the last month"
  return `the last ${days} days`
}

/** A plain `YYYY-MM-DD` rendered as "Aug 30, 2026", read as a calendar date, not an instant. */
export function formatGoalDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
