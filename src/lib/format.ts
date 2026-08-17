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
