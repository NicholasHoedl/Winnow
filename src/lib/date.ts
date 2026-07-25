// Pure, dependency-free date helpers shared across modules. Everything operates on
// 'YYYY-MM-DD' strings (which compare lexicographically == chronologically, so no DST
// hazard) plus a couple of timezone wall-date utilities. No DB, no `server-only` — so
// these are directly unit-testable and safe to import from anywhere (client or server).

// --- date-string helpers (YYYY-MM-DD) ---

export function parse(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number)
  return [y, m, d]
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Days in month m (1-12) of year y. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = parse(dateStr)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** b - a in whole days. */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parse(a)
  const [by, bm, bd] = parse(b)
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  )
}

/** Weekday of a YYYY-MM-DD (0 = Sunday). */
export function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

// --- timezone wall-date ---

/** Wall-date (YYYY-MM-DD) for an instant in a given IANA timezone. */
export function todayInZone(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/** True if `value` is a real calendar date in 'YYYY-MM-DD' form (rejects overflow
 *  like month 13 / Feb 30 that a bare regex would accept). */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

// --- local wall-clock Date <-> string (for date pickers) ---
// react-day-picker hands `onSelect` a LOCAL-midnight Date and expects local Dates for
// `selected`/`defaultMonth`. Convert with the local getters/constructor — NEVER
// `toISOString()` or `Date.UTC` on a wall-clock Date (that shifts the day by the tz offset).

/** A local Date → its 'YYYY-MM-DD' wall-date. */
export function localDateToString(date: Date): string {
  return fmt(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** A 'YYYY-MM-DD' string → a local-midnight Date (for a picker's selected/defaultMonth). */
export function localStringToDate(dateStr: string): Date {
  const [year, month, day] = parse(dateStr)
  return new Date(year, month - 1, day)
}
