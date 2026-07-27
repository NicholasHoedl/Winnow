import { describe, expect, it } from "vitest"

import {
  DAY_MINUTES,
  DEFAULT_MINUTES,
  MIN_MINUTES,
  daySpan,
  dstNotes,
  layoutLanes,
  minutesOf,
  spanFractions,
  type Span,
} from "./grid-geometry"

// Chicago, because it is the app's default zone and both of its 2026 transitions land
// on dates worth pinning: 8 March springs forward (no 02:00 at all) and 1 November
// falls back (01:00 twice).
const TZ = "America/Chicago"
const PLAIN = "2026-07-15"
const SPRING = "2026-03-08"
const FALL = "2026-11-01"

/** The minimum an occurrence needs for daySpan. */
function occ(over: Partial<Parameters<typeof daySpan>[0]> = {}) {
  return {
    date: PLAIN,
    endDate: PLAIN,
    time: "09:00",
    endTime: "10:30",
    ...over,
  }
}

const span = (start: number, end: number): Span => ({ start, end })

describe("minutesOf", () => {
  it("reads a wall clock as minutes past midnight", () => {
    expect(minutesOf("00:00")).toBe(0)
    expect(minutesOf("09:30")).toBe(570)
    expect(minutesOf("23:59")).toBe(1439)
  })
})

describe("daySpan", () => {
  it("places a same-day timed occurrence", () => {
    expect(daySpan(occ(), PLAIN)).toEqual({ start: 540, end: 630 })
  })

  it("returns null for an all-day occurrence (it belongs in the gutter)", () => {
    expect(daySpan(occ({ time: null, endTime: null }), PLAIN)).toBeNull()
  })

  it("returns null for a day the occurrence does not touch", () => {
    expect(daySpan(occ(), "2026-07-16")).toBeNull()
    expect(daySpan(occ(), "2026-07-14")).toBeNull()
  })

  it("gives an occurrence with no end time a default height", () => {
    expect(daySpan(occ({ endTime: null }), PLAIN)).toEqual({
      start: 540,
      end: 540 + DEFAULT_MINUTES,
    })
  })

  it("floors a zero-length occurrence so it stays hittable", () => {
    expect(daySpan(occ({ endTime: "09:00" }), PLAIN)).toEqual({
      start: 540,
      end: 540 + MIN_MINUTES,
    })
  })

  it("floors an occurrence whose end precedes its start", () => {
    expect(daySpan(occ({ time: "09:00", endTime: "08:00" }), PLAIN)).toEqual({
      start: 540,
      end: 540 + MIN_MINUTES,
    })
  })

  it("slides a late-night block up rather than clipping it away", () => {
    // 23:55 with no end would run five minutes past midnight and clip to nothing.
    expect(daySpan(occ({ time: "23:55", endTime: null }), PLAIN)).toEqual({
      start: DAY_MINUTES - MIN_MINUTES,
      end: DAY_MINUTES,
    })
  })

  it("clamps a multi-day span to each column it crosses", () => {
    const three = occ({ date: PLAIN, endDate: "2026-07-17", endTime: "11:00" })
    // First day: starts at its own time, runs off the bottom.
    expect(daySpan(three, PLAIN)).toEqual({ start: 540, end: DAY_MINUTES })
    // Middle day: fills the column.
    expect(daySpan(three, "2026-07-16")).toEqual({ start: 0, end: DAY_MINUTES })
    // Last day: starts at midnight, ends at its own time.
    expect(daySpan(three, "2026-07-17")).toEqual({ start: 0, end: 660 })
  })

  it("keeps a DST day on the same rows as every other column", () => {
    // The axis is wall clock, so 09:00 is 09:00 in all three — a week containing a
    // transition still lines up across its seven columns.
    for (const date of [PLAIN, SPRING, FALL]) {
      expect(
        daySpan(occ({ date, endDate: date, endTime: "10:00" }), date),
      ).toEqual({ start: 540, end: 600 })
    }
  })
})

describe("spanFractions", () => {
  it("divides by the 24-hour axis", () => {
    expect(spanFractions(span(0, 720))).toEqual({ top: 0, height: 0.5 })
    expect(spanFractions(span(1080, 1440))).toEqual({ top: 0.75, height: 0.25 })
  })
})

describe("dstNotes", () => {
  it("reports nothing for an ordinary day", () => {
    expect(dstNotes(PLAIN, TZ)).toEqual({ skipped: [], repeated: [] })
  })

  it("reports nothing at all in a zone that does not observe DST", () => {
    expect(dstNotes(SPRING, "UTC")).toEqual({ skipped: [], repeated: [] })
    expect(dstNotes(FALL, "America/Phoenix")).toEqual({
      skipped: [],
      repeated: [],
    })
  })

  it("names the hour a spring-forward day never reaches", () => {
    // 02:00 CST becomes 03:00 CDT, so the 02:00 row is an hour nothing can be in.
    expect(dstNotes(SPRING, TZ)).toEqual({ skipped: [2], repeated: [] })
  })

  it("names the hour a fall-back day lives through twice", () => {
    expect(dstNotes(FALL, TZ)).toEqual({ skipped: [], repeated: [1] })
  })

  it("finds a southern-hemisphere transition without being told about it", () => {
    // Sydney springs forward on the first Sunday in October and back on the first in
    // April — opposite months to Chicago, and derived rather than tabulated.
    expect(dstNotes("2026-10-04", "Australia/Sydney")).toEqual({
      skipped: [2],
      repeated: [],
    })
    expect(dstNotes("2026-04-05", "Australia/Sydney")).toEqual({
      skipped: [],
      repeated: [2],
    })
  })
})

describe("layoutLanes", () => {
  it("returns nothing for no spans", () => {
    expect(layoutLanes([])).toEqual([])
  })

  it("gives a lone span the full width", () => {
    expect(layoutLanes([span(540, 600)])).toEqual([{ left: 0, width: 1 }])
  })

  it("treats spans that merely touch as separate", () => {
    // 09:00–10:00 then 10:00–11:00 — back to back, not overlapping.
    expect(layoutLanes([span(540, 600), span(600, 660)])).toEqual([
      { left: 0, width: 1 },
      { left: 0, width: 1 },
    ])
  })

  it("splits two overlapping spans in half, in input order", () => {
    expect(layoutLanes([span(600, 660), span(540, 660)])).toEqual([
      { left: 0.5, width: 0.5 }, // the later start takes the right lane
      { left: 0, width: 0.5 },
    ])
  })

  it("splits a three-way overlap into thirds", () => {
    const lanes = layoutLanes([span(540, 660), span(540, 600), span(570, 720)])
    expect(lanes).toEqual([
      { left: 0, width: 1 / 3 },
      { left: 1 / 3, width: 1 / 3 },
      { left: 2 / 3, width: 1 / 3 },
    ])
  })

  it("keeps clusters independent so a busy morning does not narrow the afternoon", () => {
    const lanes = layoutLanes([span(540, 660), span(570, 630), span(900, 960)])
    expect(lanes).toEqual([
      { left: 0, width: 0.5 },
      { left: 0.5, width: 0.5 },
      { left: 0, width: 1 }, // its own cluster
    ])
  })

  it("widens a span across an adjacent column with nothing conflicting in it", () => {
    // 08:00–09:00 sits beside an 08:00–12:00 block; a 09:30–10:00 block forces a third
    // column later in the same cluster. The 08:00–09:00 one should stretch over that
    // third column rather than leave it blank for its whole hour.
    const lanes = layoutLanes([
      span(480, 720), // 08:00–12:00
      span(480, 540), // 08:00–09:00
      span(540, 600), // 09:00–10:00
      span(570, 600), // 09:30–10:00
    ])
    expect(lanes).toEqual([
      { left: 0, width: 1 / 3 },
      { left: 1 / 3, width: 2 / 3 }, // widened over the empty third column
      { left: 1 / 3, width: 1 / 3 },
      { left: 2 / 3, width: 1 / 3 },
    ])
  })
})
