import { describe, expect, it } from "vitest"

import { daysInMonth, dowOf, fmt, parse } from "@/lib/date"

import {
  escapeText,
  foldLine,
  icalDate,
  icalDateTime,
  icalStamp,
  rruleFor,
  toVCalendar,
  type IcalEvent,
  type IcalException,
} from "./ical"
import { expandOccurrences } from "./service"

const UTC = "UTC"
const STAMP = "2026-07-01T12:00:00.000Z"

function event(over: Partial<IcalEvent> = {}): IcalEvent {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Standup",
    notes: null,
    startAt: "2026-07-06T09:00:00.000Z", // a Monday
    endAt: "2026-07-06T09:30:00.000Z",
    allDay: false,
    recurrenceFreq: "none",
    recurrenceInterval: 1,
    recurrenceWeekdays: 0,
    recurrenceMonthlyMode: "day_of_month",
    recurrenceEndDate: null,
    updatedAt: STAMP,
    ...over,
  }
}

function exception(over: Partial<IcalException> = {}): IcalException {
  return {
    eventId: "11111111-1111-1111-1111-111111111111",
    originalDate: "2026-07-13",
    canceled: false,
    startAt: null,
    endAt: null,
    allDay: null,
    title: null,
    notes: null,
    updatedAt: STAMP,
    ...over,
  }
}

/** Reverse the folding, so a test can assert the content survived it. */
function unfold(text: string): string {
  return text.replace(/\r\n /g, "")
}

function bytesOf(s: string): number {
  return new TextEncoder().encode(s).length
}

describe("escaping", () => {
  it("escapes the four TEXT metacharacters and leaves the colon alone", () => {
    expect(escapeText("a,b;c\\d\ne: f")).toBe("a\\,b\\;c\\\\d\\ne: f")
  })

  it("normalises CRLF and CR to the same escape", () => {
    expect(escapeText("a\r\nb\rc")).toBe("a\\nb\\nc")
  })
})

describe("folding", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:hi")).toBe("SUMMARY:hi")
  })

  it("folds long ASCII to 75 octets with a leading space, losslessly", () => {
    const line = `SUMMARY:${"a".repeat(300)}`
    const folded = foldLine(line)

    for (const physical of folded.split("\r\n")) {
      expect(bytesOf(physical)).toBeLessThanOrEqual(75)
    }
    expect(
      folded
        .split("\r\n")
        .slice(1)
        .every((l) => l.startsWith(" ")),
    ).toBe(true)
    expect(unfold(folded)).toBe(line)
  })

  it("never splits a multi-byte character", () => {
    // 2-byte and 4-byte characters, deliberately straddling the 75-octet boundary.
    const line = `SUMMARY:${"é".repeat(60)}${"😀".repeat(20)}`
    const folded = foldLine(line)

    for (const physical of folded.split("\r\n")) {
      expect(bytesOf(physical)).toBeLessThanOrEqual(75)
    }
    // The real assertion: nothing was corrupted. A fold inside a UTF-8 sequence or an
    // astral pair would show up here as a replacement character or a lost codepoint.
    expect(unfold(folded)).toBe(line)
  })
})

describe("date formats", () => {
  it("formats dates, floating date-times, and the UTC stamp", () => {
    expect(icalDate("2026-07-28")).toBe("20260728")
    expect(icalDateTime("2026-07-28", "09:05")).toBe("20260728T090500")
    // No Z on the date-time — that is the floating-time decision, asserted.
    expect(icalDateTime("2026-07-28", "09:05")).not.toMatch(/Z$/)
    expect(icalStamp("2026-07-28T10:30:00.000Z")).toBe("20260728T103000Z")
  })
})

describe("rruleFor", () => {
  it("returns null for a one-off", () => {
    expect(rruleFor(event(), "2026-07-06")).toBeNull()
  })

  it("emits daily, with INTERVAL only when it is not 1", () => {
    expect(rruleFor(event({ recurrenceFreq: "daily" }), "2026-07-06")).toBe(
      "RRULE:FREQ=DAILY",
    )
    expect(
      rruleFor(
        event({ recurrenceFreq: "daily", recurrenceInterval: 3 }),
        "2026-07-06",
      ),
    ).toBe("RRULE:FREQ=DAILY;INTERVAL=3")
  })

  it("expands the weekday mask into BYDAY", () => {
    // Mon + Wed + Fri = bits 1, 3, 5
    const mask = (1 << 1) | (1 << 3) | (1 << 5)
    expect(
      rruleFor(
        event({ recurrenceFreq: "weekly", recurrenceWeekdays: mask }),
        "2026-07-06",
      ),
    ).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR")
  })

  it("derives BYDAY from the anchor when the mask is 0 (the implicit-BYDAY gap)", () => {
    // 2026-07-06 is a Monday; the schema's 0 means "the anchor's weekday", which RRULE
    // has no implicit form for.
    expect(
      rruleFor(
        event({ recurrenceFreq: "weekly", recurrenceWeekdays: 0 }),
        "2026-07-06",
      ),
    ).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO")
  })

  it("emits BYMONTHDAY for a day-of-month series", () => {
    expect(
      rruleFor(
        event({
          recurrenceFreq: "monthly",
          recurrenceMonthlyMode: "day_of_month",
        }),
        "2026-07-06",
      ),
    ).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=6")
  })

  it("emits an ordinal BYDAY for an nth-weekday series", () => {
    // 2026-07-20 is the 3rd Monday of July 2026, and not the last.
    expect(
      rruleFor(
        event({
          recurrenceFreq: "monthly",
          recurrenceMonthlyMode: "nth_weekday",
        }),
        "2026-07-20",
      ),
    ).toBe("RRULE:FREQ=MONTHLY;BYDAY=3MO")
  })

  it("gets the ordinal right on a day-7 boundary", () => {
    // 2026-07-14 is the 2nd Tuesday. Deliberately a multiple of 7: that is the only
    // place `ceil(day/7)` and `floor(day/7)+1` disagree, so every other anchor in this
    // file would pass with the arithmetic subtly wrong.
    expect(
      rruleFor(
        event({
          recurrenceFreq: "monthly",
          recurrenceMonthlyMode: "nth_weekday",
        }),
        "2026-07-14",
      ),
    ).toBe("RRULE:FREQ=MONTHLY;BYDAY=2TU")
  })

  it("emits -1 when the anchor was the month's LAST such weekday", () => {
    // 2026-07-27 is the last Monday of July 2026 (the 4th).
    expect(
      rruleFor(
        event({
          recurrenceFreq: "monthly",
          recurrenceMonthlyMode: "nth_weekday",
        }),
        "2026-07-27",
      ),
    ).toBe("RRULE:FREQ=MONTHLY;BYDAY=-1MO")
  })

  it("maps the inclusive end date onto a floating UNTIL", () => {
    // The column is date-only and INCLUSIVE; UNTIL is inclusive too, and must be
    // floating because DTSTART is.
    expect(
      rruleFor(
        event({ recurrenceFreq: "daily", recurrenceEndDate: "2026-08-31" }),
        "2026-07-06",
      ),
    ).toBe("RRULE:FREQ=DAILY;UNTIL=20260831T235959")
  })
})

describe("the RRULE describes the dates the app actually draws", () => {
  // The closest thing to a round-trip that is achievable without taking an RRULE
  // evaluator as a dependency: expand the series with the real engine, then check each
  // date it produced against the ordinal the RRULE claims — computed here by a
  // deliberately different method (enumerate the month, filter to the weekday, index it)
  // so it cannot agree with `nthWeekdayOf` by construction.
  function nthWeekdayDatesOf(
    year: number,
    month: number,
    weekday: number,
  ): string[] {
    const out: string[] = []
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      const date = fmt(year, month, day)
      if (dowOf(date) === weekday) out.push(date)
    }
    return out
  }

  const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

  it.each([
    ["a 3rd Monday", "2026-07-20T09:00:00.000Z"],
    ["a last Monday", "2026-07-27T09:00:00.000Z"],
    ["a 1st Wednesday", "2026-07-01T09:00:00.000Z"],
  ])("agrees with the expander for %s series", (_label, startAt) => {
    const series = event({
      startAt,
      endAt: null,
      recurrenceFreq: "monthly",
      recurrenceMonthlyMode: "nth_weekday",
    })
    const anchor = startAt.slice(0, 10)

    const rrule = rruleFor(series, anchor)!
    const [, sign, code] = rrule.match(/BYDAY=(-?\d+)([A-Z]{2})/)!
    const weekday = CODES.indexOf(code)
    const ordinal = Number(sign)

    const occurrences = expandOccurrences(
      series,
      "2026-07-01",
      "2027-07-01",
      UTC,
    )
    expect(occurrences.length).toBeGreaterThan(10)

    for (const occ of occurrences) {
      const [y, m] = parse(occ.date)
      const candidates = nthWeekdayDatesOf(y, m, weekday)
      const expected =
        ordinal === -1
          ? candidates[candidates.length - 1]
          : candidates[ordinal - 1]
      expect(occ.date).toBe(expected)
    }
  })
})

describe("toVCalendar", () => {
  it("wraps the document and uses CRLF throughout", () => {
    const ics = toVCalendar([event()], [], UTC)

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(ics).toContain("VERSION:2.0")
    expect(ics).toContain("X-WR-CALNAME:Winnow")
    // No bare LF anywhere.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n")
  })

  it("emits a timed event as floating local time with no zone", () => {
    const ics = toVCalendar([event()], [], UTC)

    expect(ics).toContain("DTSTART:20260706T090000")
    expect(ics).toContain("DTEND:20260706T093000")
    expect(ics).not.toContain("TZID")
    expect(ics).not.toMatch(/DTSTART[^\r\n]*Z/)
  })

  it("renders wall-clock in the requested zone, not UTC", () => {
    // 09:00 UTC is 04:00 in Chicago (CDT) — the feed must show what the app shows.
    const ics = toVCalendar([event()], [], "America/Chicago")
    expect(ics).toContain("DTSTART:20260706T040000")
  })

  it("emits all-day events as DATE with an exclusive DTEND", () => {
    const ics = toVCalendar(
      [
        event({
          allDay: true,
          startAt: "2026-07-06T00:00:00.000Z",
          endAt: "2026-07-06T00:00:00.000Z",
        }),
      ],
      [],
      UTC,
    )

    expect(ics).toContain("DTSTART;VALUE=DATE:20260706")
    // One-day event ends on the FOLLOWING date.
    expect(ics).toContain("DTEND;VALUE=DATE:20260707")
  })

  it("omits DTEND for an open-ended event", () => {
    const ics = toVCalendar([event({ endAt: null })], [], UTC)
    expect(ics).not.toContain("DTEND")
  })

  it("turns a cancelled occurrence into EXDATE at the series' anchor time", () => {
    const ics = toVCalendar(
      [event({ recurrenceFreq: "weekly" })],
      [exception({ canceled: true })],
      UTC,
    )

    expect(ics).toContain("EXDATE:20260713T090000")
    // A cancellation produces no VEVENT of its own.
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })

  it("groups several cancellations onto one EXDATE line", () => {
    const ics = toVCalendar(
      [event({ recurrenceFreq: "weekly" })],
      [
        exception({ canceled: true, originalDate: "2026-07-13" }),
        exception({ canceled: true, originalDate: "2026-07-20" }),
      ],
      UTC,
    )

    expect(unfold(ics)).toContain("EXDATE:20260713T090000,20260720T090000")
  })

  it("turns an edited occurrence into a second VEVENT with RECURRENCE-ID", () => {
    const ics = toVCalendar(
      [event({ recurrenceFreq: "weekly" })],
      [
        exception({
          title: "Standup (moved)",
          startAt: "2026-07-13T14:00:00.000Z",
          endAt: "2026-07-13T15:00:00.000Z",
        }),
      ],
      UTC,
    )

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    // Same UID — it is the same series.
    expect(
      ics.match(/UID:11111111-1111-1111-1111-111111111111@winnow/g),
    ).toHaveLength(2)
    // Keyed on where the SERIES would have put it, not where it moved to.
    expect(ics).toContain("RECURRENCE-ID:20260713T090000")
    expect(ics).toContain("DTSTART:20260713T140000")
    expect(ics).toContain("SUMMARY:Standup (moved)")
  })

  it("an override inherits the series title when it does not change it", () => {
    const ics = toVCalendar(
      [event({ recurrenceFreq: "weekly" })],
      [exception({ startAt: "2026-07-13T14:00:00.000Z" })],
      UTC,
    )
    expect(ics.match(/SUMMARY:Standup/g)).toHaveLength(2)
  })

  it("escapes and folds a long, punctuated description", () => {
    const notes = `Bring: laptop, charger; and the "notes"\nSecond line ${"x".repeat(120)}`
    const ics = toVCalendar([event({ notes })], [], UTC)

    expect(unfold(ics)).toContain(`DESCRIPTION:${escapeText(notes)}`)
    for (const physical of ics.split("\r\n")) {
      expect(bytesOf(physical)).toBeLessThanOrEqual(75)
    }
  })

  it("emits nothing but the envelope for an empty calendar", () => {
    const ics = toVCalendar([], [], UTC)
    expect(ics).not.toContain("BEGIN:VEVENT")
    expect(ics).toContain("END:VCALENDAR")
  })
})
