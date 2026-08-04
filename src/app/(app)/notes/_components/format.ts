/**
 * A 'YYYY-MM-DD' entry date, formatted for display.
 *
 * Parsed as UTC and formatted in UTC — the string is a wall-date with no instant behind
 * it, so letting the browser interpret it in local time would shift it a day west of
 * Greenwich. Same approach as the goals card's date.
 */
export function formatEntryDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
