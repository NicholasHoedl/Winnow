import { describe, expect, it } from "vitest"

import { parseListTag, UNFILED } from "./service"

// The `#list` half of quick-add. The budget's `#category` parser has its own tests; this
// one shares the matcher (`lib/tags.ts`) and differs only in what a tag resolves against.

const LISTS = [
  { id: "l-home", name: "Home" },
  { id: "l-proj", name: "Home projects" },
]

describe("parseListTag", () => {
  it("files by a #tag and takes the tag out of the title", () => {
    expect(parseListTag("call the plumber #home", LISTS)).toEqual({
      listId: "l-home",
      cleaned: "call the plumber",
    })
  })

  it("matches case-insensitively, and a multi-word name as one word", () => {
    expect(parseListTag("#HOME buy filters", LISTS).listId).toBe("l-home")
    expect(parseListTag("paint the fence #home-projects", LISTS).listId).toBe(
      "l-proj",
    )
    expect(parseListTag("paint the fence #Home_Projects", LISTS).listId).toBe(
      "l-proj",
    )
  })

  // The budget's rule, chosen deliberately over keeping the word: a `#` is an instruction,
  // and one that sometimes stayed in the title would make it two things.
  it("strips a tag that names no list, and files nothing", () => {
    expect(parseListTag("buy filters #hvac", LISTS)).toEqual({
      listId: null,
      cleaned: "buy filters",
    })
  })

  it("reads only the first tag, and tidies the gap it leaves", () => {
    expect(parseListTag("one #home two #hvac", LISTS)).toEqual({
      listId: "l-home",
      cleaned: "one two #hvac",
    })
  })

  it("leaves a line with no tag alone, trimmed", () => {
    expect(parseListTag("  water the plants  ", LISTS)).toEqual({
      listId: null,
      cleaned: "water the plants",
    })
  })

  // The caller falls back to the raw text for the title in this case; the parser only
  // reports honestly that nothing was left.
  it("yields an empty title when the tag was all there was", () => {
    expect(parseListTag("#home", LISTS)).toEqual({
      listId: "l-home",
      cleaned: "",
    })
  })

  it("names the unfiled filter with a value no id can collide with", () => {
    expect(UNFILED).toBe("none")
  })
})
