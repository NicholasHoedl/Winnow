import { describe, expect, it } from "vitest"

import { DASHBOARD_CARDS, parseCollapsedCards } from "./preferences"

describe("parseCollapsedCards", () => {
  it("keeps the cards this build knows about", () => {
    expect(parseCollapsedCards(["slate", "budget"])).toEqual([
      "slate",
      "budget",
    ])
  })

  it("drops a key for a card that no longer exists", () => {
    // The whole reason this is one column holding a list rather than a boolean per card.
    // T13 deleted three dashboard cards, T15 merged two and T16 merged three more — a
    // `tomorrow_collapsed` column would have needed a migration to remove, where a stale
    // key just stops matching. Anyone deleting a card should be able to delete it and stop.
    expect(parseCollapsedCards(["slate", "tomorrow", "coming-up"])).toEqual([
      "slate",
    ])
  })

  it("survives a column holding something that is not a list at all", () => {
    // `jsonb` accepts any JSON, so this is reachable from an import, a restore written by an
    // older build, or a hand-edited row — not a theoretical defence. Returning [] renders an
    // ordinary dashboard; throwing would take the whole page down over a cosmetic setting.
    for (const junk of [null, undefined, 0, "slate", { slate: true }, true])
      expect(parseCollapsedCards(junk)).toEqual([])
  })

  it("deduplicates, so a double write cannot make one card ambiguous", () => {
    expect(parseCollapsedCards(["goals", "goals", "goals"])).toEqual(["goals"])
  })

  it("drops non-strings mixed in among valid keys", () => {
    expect(parseCollapsedCards(["slate", 7, null, "calendar"])).toEqual([
      "slate",
      "calendar",
    ])
  })

  it("accepts every card in the registry", () => {
    // A tripwire in both directions: adding a card to `DASHBOARD_CARDS` without teaching the
    // parser, or narrowing the parser without noticing what it now rejects, fails here.
    expect(parseCollapsedCards([...DASHBOARD_CARDS])).toEqual([
      ...DASHBOARD_CARDS,
    ])
  })

  it("returns nothing for an empty list, which is the default", () => {
    expect(parseCollapsedCards([])).toEqual([])
  })
})
