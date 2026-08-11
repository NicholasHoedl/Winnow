import { describe, expect, it } from "vitest"

import {
  escapeLike,
  normalizeQuery,
  rankAndCap,
  scoreMatch,
  scoreResult,
  snippet,
} from "./service"
import type { SearchResult } from "./types"

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape char, leaving plain text alone", () => {
    expect(escapeLike("50%")).toBe("50\\%")
    expect(escapeLike("a_b")).toBe("a\\_b")
    expect(escapeLike("c\\d")).toBe("c\\\\d")
    expect(escapeLike("groceries")).toBe("groceries")
  })
})

describe("normalizeQuery", () => {
  it("trims and rejects queries shorter than the minimum", () => {
    expect(normalizeQuery("  gym  ")).toBe("gym")
    expect(normalizeQuery("ab")).toBe("ab")
    expect(normalizeQuery("a")).toBeNull()
    expect(normalizeQuery("   ")).toBeNull()
  })
})

describe("scoreMatch", () => {
  it("ranks prefix > word-boundary > mid-word > none", () => {
    expect(scoreMatch("Groceries", "gro")).toBe(3)
    expect(scoreMatch("Buy groceries", "gro")).toBe(2)
    expect(scoreMatch("Overgrown", "gro")).toBe(1)
    expect(scoreMatch("Nothing here", "xyz")).toBe(0)
  })

  it("is case-insensitive and treats punctuation as a boundary", () => {
    expect(scoreMatch("TAXES", "tax")).toBe(3)
    expect(scoreMatch("Rent/utilities", "util")).toBe(2)
  })
})

describe("scoreResult", () => {
  it("prefers a primary match and discounts a secondary-only match", () => {
    expect(scoreResult("tax", "Taxes", "some notes")).toBe(3)
    expect(scoreResult("note", "Taxes", "a note here")).toBeCloseTo(2 * 0.4)
    expect(scoreResult("zzz", "Taxes", null)).toBe(0)
  })
})

describe("snippet", () => {
  it("collapses whitespace and truncates with an ellipsis", () => {
    expect(snippet("  a\n  b   c ")).toBe("a b c")
    expect(snippet("abcdef", 4)).toBe("abc…")
    expect(snippet("short", 100)).toBe("short")
  })
})

describe("rankAndCap", () => {
  it("sorts by score desc, then title, and caps the total", () => {
    const mk = (title: string, score: number): SearchResult => ({
      type: "task",
      id: title,
      title,
      href: "/activity",
      score,
    })
    const out = rankAndCap(
      [mk("low", 1), mk("high", 3), mk("bmid", 2), mk("amid", 2)],
      3,
    )
    expect(out.map((r) => r.title)).toEqual(["high", "amid", "bmid"])
  })

  // The ranker is blind to `type` and must stay that way — a module's results compete on
  // score alone, not on which module they came from. A habit carries neither a subtitle nor
  // a date, which makes it the sparsest shape in the union and the one worth exercising.
  it("ranks a habit against other types on score alone", () => {
    const out = rankAndCap([
      { type: "task", id: "t", title: "Drill", href: "/activity", score: 1 },
      {
        type: "habit",
        id: "h",
        title: "Drill",
        href: "/activity/habits",
        score: 5,
      },
    ])
    expect(out.map((r) => r.type)).toEqual(["habit", "task"])
  })
})
