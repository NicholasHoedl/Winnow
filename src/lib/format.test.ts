import { describe, expect, it } from "vitest"

import { formatTime } from "./format"

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
