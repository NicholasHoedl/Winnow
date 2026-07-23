// Deterministic category-accent colors, drawn from the --cat-1..6 palette in
// globals.css. The class strings are spelled out in full so Tailwind's JIT
// compiles them — a dynamic `bg-cat-${n}` would never be detected.

export type CategoryAccent = {
  /** solid fill — progress bars, dots */
  bar: string
  /** faint tinted surface — chips, blocks */
  tint: string
  /** accent-colored text */
  text: string
  /** accent border */
  border: string
}

const ACCENTS: CategoryAccent[] = [
  { bar: "bg-cat-1", tint: "bg-cat-1/12", text: "text-cat-1", border: "border-cat-1/30" },
  { bar: "bg-cat-2", tint: "bg-cat-2/12", text: "text-cat-2", border: "border-cat-2/30" },
  { bar: "bg-cat-3", tint: "bg-cat-3/12", text: "text-cat-3", border: "border-cat-3/30" },
  { bar: "bg-cat-4", tint: "bg-cat-4/12", text: "text-cat-4", border: "border-cat-4/30" },
  { bar: "bg-cat-5", tint: "bg-cat-5/12", text: "text-cat-5", border: "border-cat-5/30" },
  { bar: "bg-cat-6", tint: "bg-cat-6/12", text: "text-cat-6", border: "border-cat-6/30" },
]

export const CATEGORY_ACCENT_COUNT = ACCENTS.length

/** Stable accent for an index (e.g. a category's position in a sorted list). */
export function categoryAccent(index: number): CategoryAccent {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length]
}

/** Accent for a 1-based palette slot (1–6), as stored on a calendar's `color`. */
export function accentForSlot(slot: number): CategoryAccent {
  return categoryAccent((slot || 1) - 1)
}

export const COLOR_SLOTS = [1, 2, 3, 4, 5, 6]

/** Accent for an event: its calendar's colour, or a hashed fallback when the
 *  event has no calendar. Used at every event-chip render site. */
export function accentForCalendar(
  calendarId: string | null,
  calendars: readonly { id: string; color: number }[],
  fallbackKey: string,
): CategoryAccent {
  const cal = calendarId
    ? calendars.find((c) => c.id === calendarId)
    : undefined
  return cal ? accentForSlot(cal.color) : accentForKey(fallbackKey)
}

/** Stable accent derived from a string key, so the same id always maps to the
 *  same color regardless of ordering. */
export function accentForKey(key: string): CategoryAccent {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return categoryAccent(Math.abs(hash))
}
