// Client-safe display formatters keyed off user preferences.
import { hourInZone } from "./date"

/**
 * A 'YYYY-MM-DD' → "Monday, July 21". Parsed as UTC so the wall date is shown verbatim,
 * never shifted by the viewer's own offset.
 *
 * `locale` is required rather than defaulted, and that is the point: a default would have
 * let the twenty-odd call sites that used to hardcode `"en-US"` keep doing so silently.
 * Client components get it from `useDateLocale()`; server ones from `dateLocale(dateFormat)`
 * on the preferences they already read.
 */
export function formatLongDate(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
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

// --- amounts ---

/**
 * Float dust, removed at the points an amount is summed or subtracted.
 *
 * `0.1 + 0.2` is 0.30000000000000004, and a habit reading "0.30000000000000004 of 1 L" is
 * a rendering bug with no upstream cause worth chasing. Three decimals is finer than any
 * unit a person logs by hand and coarse enough to absorb the error.
 */
export function roundAmount(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * An amount as a person would write it — "20", "5.5", "0.25".
 *
 * `real` columns come back as floats, so a whole target arrives as 20 and must not render
 * as "20.0", while a genuinely fractional one has to keep its decimals. `String(number)`
 * does exactly that; this exists so a badge, a meter and a prompt cannot drift into three
 * spellings of one number.
 */
export function formatAmount(value: number): string {
  return String(roundAmount(value))
}

// --- units ---

/**
 * Weight and volume are stored in ONE unit and displayed in whichever the account prefers.
 *
 * `body_weights.weight_lb` and `water_logs.amount_fl_oz` bake the unit into the column name,
 * and these convert on the way out rather than migrating the stored figure. That direction
 * is deliberate: a stored number whose meaning changes when a preference flips turns a
 * weight history silently wrong, and there is no way to tell afterwards which rows were
 * written under which setting.
 *
 * So the round trip is display → input → storage, and `fromDisplayWeight` is the exact
 * inverse of `toDisplayWeight`. Anything that writes must use it.
 */
const LB_PER_KG = 2.20462262
const ML_PER_FL_OZ = 29.5735296

export function toDisplayWeight(lb: number, unit: "lb" | "kg"): number {
  return unit === "kg" ? lb / LB_PER_KG : lb
}

export function fromDisplayWeight(value: number, unit: "lb" | "kg"): number {
  return unit === "kg" ? value * LB_PER_KG : value
}

export function weightUnitLabel(unit: "lb" | "kg"): string {
  return unit
}

export function toDisplayVolume(flOz: number, unit: "floz" | "ml"): number {
  return unit === "ml" ? flOz * ML_PER_FL_OZ : flOz
}

export function fromDisplayVolume(value: number, unit: "floz" | "ml"): number {
  return unit === "ml" ? value / ML_PER_FL_OZ : value
}

export function volumeUnitLabel(unit: "floz" | "ml"): string {
  return unit === "ml" ? "ml" : "fl oz"
}

/**
 * The quick-add presets, in the displayed unit.
 *
 * Round numbers in whichever unit you are actually looking at — 250/500/750 ml rather than
 * the 236.6/354.9/473.2 that converting 8/12/16 fl oz produces. A preset button exists to
 * be tapped without thinking, and a preset labelled 236.6 fails at that.
 */
export function volumePresets(unit: "floz" | "ml"): number[] {
  return unit === "ml" ? [250, 500, 750] : [8, 12, 16]
}

/**
 * "Good morning" / "Good afternoon" / "Good evening", by the account's own clock.
 *
 * The three boundaries are noon, 18:00 and midnight, and they are FIXED — there is
 * deliberately no preference for them. Every other time-shaped thing in this app is
 * configurable (`weekStartsOn`, `timeZone`, `use24HourTime`), so the omission is a
 * decision rather than an oversight: a greeting is a pleasantry, and a settings row asking
 * when your evening begins costs more attention than the answer is worth.
 *
 * Read in `timeZone`, not on the server's clock. The server runs in UTC, so a greeting
 * derived from `new Date().getHours()` would tell someone in Chicago good evening over
 * breakfast — the same fault `todayInZone` exists to prevent for dates.
 */
export function greeting(now: Date, timeZone: string): string {
  const hour = hourInZone(now, timeZone)
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}
