// Client-safe display formatters keyed off user preferences.

/** A 'YYYY-MM-DD' → "Monday, July 21". Parsed as UTC so the wall date is shown
 * verbatim, never shifted by the viewer's own offset. */
export function formatLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** A stored "HH:MM" (24h) time → 24h as-is, or 12h "H:MM AM/PM". */
export function formatTime(hhmm: string, use24Hour: boolean): string {
  if (use24Hour) return hhmm
  const parts = hhmm.split(":")
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (parts.length < 2 || Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const period = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}
