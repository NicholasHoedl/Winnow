// Pure note-presentation logic. No DB, no framework — unit-testable directly.

/** Only the fields these helpers read; callers pass their richer rows. */
export type NoteShape = {
  title: string | null
  body: string
  entryDate: string | null
  pinned: boolean
}

/** Longest a body-derived display title gets before it's cut. */
export const TITLE_MAX = 80

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  // trimEnd so a cut landing on a space doesn't render as "word …".
  return `${value.slice(0, maxChars).trimEnd()}…`
}

/** First line with something on it, trimmed. Empty string if the body is blank. */
function firstLine(body: string): string {
  for (const line of body.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length > 0) return trimmed
  }
  return ""
}

/**
 * What to show as the note's heading.
 *
 * Falls back through title → first line of the body → the entry date → a placeholder.
 * The date sits below the body line rather than above it because journal entries are
 * already listed under their date, so repeating it as the heading says nothing.
 */
export function noteTitle(note: NoteShape): string {
  const title = note.title?.trim() ?? ""
  if (title.length > 0) return truncate(title, TITLE_MAX)

  const line = firstLine(note.body)
  if (line.length > 0) return truncate(line, TITLE_MAX)

  if (note.entryDate) return note.entryDate
  return "Untitled note"
}

/**
 * A one-line preview of the body for a card. Newlines collapse to spaces — the point is
 * to fill a fixed-height row, and a preview that honoured line breaks would render one
 * word per line for anything written as a list.
 */
export function excerpt(body: string, maxChars: number): string {
  const collapsed = body.replace(/\s+/g, " ").trim()
  return truncate(collapsed, maxChars)
}

export type GroupedNotes<T> = {
  journal: T[]
  pinned: T[]
  other: T[]
}

/**
 * Partition notes into the three display groups. Every note lands in exactly one:
 * having an `entryDate` makes it a journal entry regardless of `pinned`, so the editor
 * only offers the pin control on free-form notes.
 *
 * Journal entries sort newest-first here because `entryDate` is the only ordering that
 * makes sense for them and it's in the shape. The other two groups keep the caller's
 * order, which `getNotes` has already set to most-recently-updated first.
 */
export function groupNotes<T extends NoteShape>(notes: T[]): GroupedNotes<T> {
  const journal: T[] = []
  const pinned: T[] = []
  const other: T[] = []

  for (const note of notes) {
    if (note.entryDate) journal.push(note)
    else if (note.pinned) pinned.push(note)
    else other.push(note)
  }

  // Date strings compare lexicographically == chronologically.
  journal.sort((a, b) => (b.entryDate ?? "").localeCompare(a.entryDate ?? ""))
  return { journal, pinned, other }
}
