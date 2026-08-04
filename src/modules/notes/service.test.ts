import { describe, expect, it } from "vitest"

import { TITLE_MAX, excerpt, groupNotes, noteTitle } from "./service"

function note(over: Partial<Parameters<typeof noteTitle>[0]> = {}) {
  return { title: null, body: "", entryDate: null, pinned: false, ...over }
}

describe("noteTitle", () => {
  it("prefers an explicit title", () => {
    expect(noteTitle(note({ title: "Groceries", body: "milk" }))).toBe(
      "Groceries",
    )
  })

  it("ignores a title that is only whitespace", () => {
    expect(noteTitle(note({ title: "   ", body: "milk" }))).toBe("milk")
  })

  it("falls back to the first non-empty line of the body", () => {
    expect(
      noteTitle(note({ body: "\n\n  Call the vet  \nand the bank" })),
    ).toBe("Call the vet")
  })

  it("falls back to the entry date when there is no text", () => {
    expect(noteTitle(note({ entryDate: "2026-07-22" }))).toBe("2026-07-22")
  })

  it("prefers body text over the entry date", () => {
    expect(
      noteTitle(note({ body: "Long day.", entryDate: "2026-07-22" })),
    ).toBe("Long day.")
  })

  it("has a placeholder for a note with nothing in it", () => {
    expect(noteTitle(note())).toBe("Untitled note")
  })

  it("truncates a long title with an ellipsis", () => {
    const long = "x".repeat(TITLE_MAX + 20)
    const result = noteTitle(note({ title: long }))
    expect(result).toHaveLength(TITLE_MAX + 1) // the ellipsis is one char
    expect(result.endsWith("…")).toBe(true)
  })

  it("does not leave a dangling space before the ellipsis", () => {
    // Cut lands on a space: 79 chars, then " tail".
    const body = `${"x".repeat(TITLE_MAX - 1)} tail`
    expect(noteTitle(note({ body }))).toBe(`${"x".repeat(TITLE_MAX - 1)}…`)
  })
})

describe("excerpt", () => {
  it("collapses newlines and runs of whitespace into single spaces", () => {
    expect(excerpt("one\n\ntwo   three\tfour", 100)).toBe("one two three four")
  })

  it("truncates past the limit", () => {
    expect(excerpt("abcdefghij", 4)).toBe("abcd…")
  })

  it("leaves a short body alone", () => {
    expect(excerpt("short", 100)).toBe("short")
  })

  it("returns empty for a blank body", () => {
    expect(excerpt("   \n\n  ", 100)).toBe("")
  })
})

describe("groupNotes", () => {
  const journalA = note({ entryDate: "2026-07-20", body: "a" })
  const journalB = note({ entryDate: "2026-07-22", body: "b" })
  const pinnedNote = note({ pinned: true, body: "p" })
  const plainA = note({ body: "1" })
  const plainB = note({ body: "2" })

  it("routes each note to exactly one group", () => {
    const grouped = groupNotes([journalA, pinnedNote, plainA])
    expect(grouped.journal).toEqual([journalA])
    expect(grouped.pinned).toEqual([pinnedNote])
    expect(grouped.other).toEqual([plainA])
  })

  it("sorts journal entries newest first", () => {
    expect(groupNotes([journalA, journalB]).journal).toEqual([
      journalB,
      journalA,
    ])
  })

  it("keeps the caller's order for pinned and other", () => {
    expect(groupNotes([plainA, plainB]).other).toEqual([plainA, plainB])
  })

  // A dated note is a journal entry whether or not it also carries the pin flag —
  // otherwise it would be dropped from the journal list and appear to vanish.
  it("keeps a pinned journal entry in the journal group", () => {
    const both = note({ entryDate: "2026-07-22", pinned: true })
    const grouped = groupNotes([both])
    expect(grouped.journal).toEqual([both])
    expect(grouped.pinned).toEqual([])
  })

  it("handles an empty list", () => {
    expect(groupNotes([])).toEqual({ journal: [], pinned: [], other: [] })
  })
})
