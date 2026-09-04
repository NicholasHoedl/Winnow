import { describe, expect, it } from "vitest"

import { formatTime, greeting } from "./format"

describe("formatTime", () => {
  it("returns the 24h string unchanged when use24Hour is true", () => {
    expect(formatTime("09:05", true)).toBe("09:05")
    expect(formatTime("23:30", true)).toBe("23:30")
    expect(formatTime("00:00", true)).toBe("00:00")
  })

  it("converts to 12h with am/pm when use24Hour is false", () => {
    expect(formatTime("09:05", false)).toBe("9:05 AM")
    expect(formatTime("00:00", false)).toBe("12:00 AM")
    expect(formatTime("00:15", false)).toBe("12:15 AM")
    expect(formatTime("12:00", false)).toBe("12:00 PM")
    expect(formatTime("13:45", false)).toBe("1:45 PM")
    expect(formatTime("23:30", false)).toBe("11:30 PM")
  })

  it("passes malformed input through unchanged", () => {
    expect(formatTime("", false)).toBe("")
    expect(formatTime("all-day", false)).toBe("all-day")
  })
})

describe("greeting", () => {
  // Boundaries are the whole specification, so they are the whole test. UTC as the zone
  // keeps each case readable as the clock time it is about; `hourInZone` is what proves
  // the zone lookup itself, and it is tested separately in date.test.ts.
  const at = (hhmm: string) =>
    greeting(new Date(`2026-07-22T${hhmm}:00Z`), "UTC")

  it("says morning from midnight until noon", () => {
    expect(at("00:00")).toBe("Good morning")
    expect(at("06:30")).toBe("Good morning")
    expect(at("11:59")).toBe("Good morning")
  })

  it("says afternoon from noon until six", () => {
    expect(at("12:00")).toBe("Good afternoon")
    expect(at("15:00")).toBe("Good afternoon")
    expect(at("17:59")).toBe("Good afternoon")
  })

  it("says evening from six until midnight", () => {
    expect(at("18:00")).toBe("Good evening")
    expect(at("21:00")).toBe("Good evening")
    expect(at("23:59")).toBe("Good evening")
  })

  it("reads the clock in the account's zone, not the server's", () => {
    // 23:00Z is the next morning in Tokyo (UTC+9) and still the evening in Chicago. A
    // greeting derived from the server's own clock would give both the same answer.
    const instant = new Date("2026-07-22T23:00:00Z")
    expect(greeting(instant, "Asia/Tokyo")).toBe("Good morning")
    expect(greeting(instant, "America/Chicago")).toBe("Good evening")
  })
})
