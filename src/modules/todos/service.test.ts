import { describe, expect, it } from "vitest"

import {
  bucketTasks,
  reopenWouldDestroy,
  repeatLabel,
  searchTasks,
  sortByCompletion,
  summarizeTasks,
} from "./service"

const TZ = "America/Chicago"

describe("summarizeTasks", () => {
  const now = new Date("2026-07-21T12:00:00Z")

  it("counts overdue + due-today among open tasks only", () => {
    const tasks = [
      { dueDate: "2026-07-19", status: "open" as const }, // overdue
      { dueDate: "2026-07-20", status: "open" as const }, // overdue
      { dueDate: "2026-07-21", status: "open" as const }, // due today
      { dueDate: "2026-07-25", status: "open" as const }, // upcoming
      { dueDate: null, status: "open" as const }, // no due date
      { dueDate: "2026-07-19", status: "done" as const }, // ignored (done)
      { dueDate: "2026-07-21", status: "done" as const }, // ignored (done)
    ]
    const summary = summarizeTasks(tasks, now, TZ)
    expect(summary.overdueCount).toBe(2)
    expect(summary.dueTodayCount).toBe(1)
    expect(summary.dueToday).toHaveLength(1)
    expect(summary.dueToday[0].dueDate).toBe("2026-07-21")
  })
})

describe("bucketTasks", () => {
  const now = new Date("2026-07-21T12:00:00Z") // Chicago today = 2026-07-21
  const task = (
    id: string,
    dueDate: string | null,
    status: "open" | "done" = "open",
  ) => ({ id, dueDate, status })
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

  it("splits open tasks into the four date buckets", () => {
    const buckets = bucketTasks(
      [
        task("late", "2026-07-19"),
        task("today", "2026-07-21"),
        task("soon", "2026-07-25"),
        task("someday", null),
      ],
      now,
      TZ,
    )
    expect(ids(buckets.overdue)).toEqual(["late"])
    expect(ids(buckets.today)).toEqual(["today"])
    expect(ids(buckets.upcoming)).toEqual(["soon"])
    expect(ids(buckets.someday)).toEqual(["someday"])
  })

  it("gives an undated task its own bucket rather than lumping it with overdue", () => {
    // The whole point of the Someday bucket: "no deadline" is not "missed a deadline".
    const buckets = bucketTasks([task("someday", null)], now, TZ)
    expect(buckets.overdue).toHaveLength(0)
    expect(ids(buckets.someday)).toEqual(["someday"])
  })

  it("keeps completed tasks out of every bucket", () => {
    const buckets = bucketTasks(
      [
        task("done-late", "2026-07-19", "done"),
        task("done-none", null, "done"),
      ],
      now,
      TZ,
    )
    expect(buckets.overdue).toHaveLength(0)
    expect(buckets.someday).toHaveLength(0)
  })

  it("preserves input order within a bucket", () => {
    // Manual position (sortOrder) is applied by the query's ORDER BY, so bucketing must
    // not re-sort — otherwise a drag-reorder would be silently undone on render.
    const buckets = bucketTasks(
      [
        task("c", "2026-07-25"),
        task("a", "2026-07-25"),
        task("b", "2026-07-25"),
      ],
      now,
      TZ,
    )
    expect(ids(buckets.upcoming)).toEqual(["c", "a", "b"])
  })

  it("uses the configured zone, not UTC, at the day boundary", () => {
    // 2026-07-22T02:00Z is already the 22nd in UTC but still the 21st in Chicago, so a
    // task due the 21st is due TODAY, not overdue.
    const lateNow = new Date("2026-07-22T02:00:00Z")
    const buckets = bucketTasks([task("t", "2026-07-21")], lateNow, TZ)
    expect(ids(buckets.today)).toEqual(["t"])
    expect(buckets.overdue).toHaveLength(0)
  })

  it("holds up on both sides of a DST transition", () => {
    // US DST ends 2026-11-01 at 02:00 local (07:00Z), Chicago going CDT (-5) → CST (-6).
    //
    // 05:30Z is BEFORE the change, so the offset is still -5 and it is 00:30 on Nov 1
    // locally. Code that assumed the standard -6 offset would compute Oct 31 23:30 and
    // wrongly mark the 1st as upcoming — which is what this asserts against.
    const beforeChange = new Date("2026-11-01T05:30:00Z")
    const before = bucketTasks(
      [task("halloween", "2026-10-31"), task("nov", "2026-11-01")],
      beforeChange,
      TZ,
    )
    expect(ids(before.today)).toEqual(["nov"])
    expect(ids(before.overdue)).toEqual(["halloween"])

    // 07:30Z is after it: offset -6, local 01:30 on Nov 1. Same local date, different
    // offset — the bucketing must not move.
    const afterChange = new Date("2026-11-01T07:30:00Z")
    const after = bucketTasks(
      [task("halloween", "2026-10-31"), task("nov", "2026-11-01")],
      afterChange,
      TZ,
    )
    expect(ids(after.today)).toEqual(["nov"])
    expect(ids(after.overdue)).toEqual(["halloween"])
  })
})

describe("repeatLabel", () => {
  it("names a plain interval of one", () => {
    expect(repeatLabel({ freq: "daily", recurrenceInterval: 1 })).toBe("Daily")
    expect(repeatLabel({ freq: "weekly", recurrenceInterval: 1 })).toBe(
      "Weekly",
    )
    expect(repeatLabel({ freq: "monthly", recurrenceInterval: 1 })).toBe(
      "Monthly",
    )
  })

  it("pluralises a longer interval", () => {
    expect(repeatLabel({ freq: "weekly", recurrenceInterval: 2 })).toBe(
      "Every 2 weeks",
    )
    expect(repeatLabel({ freq: "monthly", recurrenceInterval: 3 })).toBe(
      "Every 3 months",
    )
    expect(repeatLabel({ freq: "daily", recurrenceInterval: 10 })).toBe(
      "Every 10 days",
    )
  })
})

// Moved here from `todos/habits.test.ts` in T12a, unchanged. The guard was never habit
// maths — it protects `toggleTaskStatus` from turning a durable completion into an open
// row that the next render deletes — so it outlived the habits view it shipped beside.
describe("reopenWouldDestroy", () => {
  const cycle = { occurrenceDate: "2026-07-22", date: "2026-07-22" }

  it("leaves a one-off task alone — nothing retires it", () => {
    expect(
      reopenWouldDestroy({ seriesId: null, occurrenceDate: null }, cycle),
    ).toBe(false)
  })

  it("allows re-opening the current cycle", () => {
    expect(
      reopenWouldDestroy(
        { seriesId: "rule", occurrenceDate: "2026-07-22" },
        cycle,
      ),
    ).toBe(false)
  })

  it("blocks re-opening an earlier cycle", () => {
    expect(
      reopenWouldDestroy(
        { seriesId: "rule", occurrenceDate: "2026-07-15" },
        cycle,
      ),
    ).toBe(true)
  })

  // A rule past its end date has no current cycle, so syncRuleInstances deletes every
  // open instance under it — re-opening any of them destroys it.
  it("blocks re-opening anything under an ended rule", () => {
    expect(
      reopenWouldDestroy(
        { seriesId: "rule", occurrenceDate: "2026-07-22" },
        null,
      ),
    ).toBe(true)
  })

  it("treats a series row with no occurrence key as a one-off", () => {
    expect(
      reopenWouldDestroy({ seriesId: "rule", occurrenceDate: null }, cycle),
    ).toBe(false)
  })
})

// /activity's own search box. Deliberately NOT the ⌘K palette's search, which is a
// server-side `ilike` across every module — this one narrows a list the page already holds
// in memory, so it costs no round trip and can run on every keystroke.
describe("searchTasks", () => {
  const rows = [
    { title: "Buy milk", notes: null },
    { title: "Call the dentist", notes: "ask about the crown" },
    { title: "File taxes", notes: null },
  ]

  it("matches on the title, ignoring case", () => {
    expect(searchTasks(rows, "MILK").map((t) => t.title)).toEqual(["Buy milk"])
  })

  it("matches on the notes as well as the title", () => {
    // The palette searches both, and a task whose detail is in its notes is exactly the one
    // you cannot remember the title of.
    expect(searchTasks(rows, "crown").map((t) => t.title)).toEqual([
      "Call the dentist",
    ])
  })

  it("matches a substring, not just a prefix", () => {
    expect(searchTasks(rows, "ent").map((t) => t.title)).toEqual([
      "Call the dentist",
    ])
  })

  it("returns everything for an empty or whitespace-only query", () => {
    expect(searchTasks(rows, "")).toEqual(rows)
    expect(searchTasks(rows, "   ")).toEqual(rows)
  })

  it("trims the query before matching", () => {
    expect(searchTasks(rows, "  milk  ").map((t) => t.title)).toEqual([
      "Buy milk",
    ])
  })

  it("survives a null notes without matching on it", () => {
    expect(searchTasks(rows, "null")).toEqual([])
  })

  it("preserves input order", () => {
    // Same contract as `bucketTasks`: the query's ORDER BY carries the manual drag order,
    // so re-sorting here would silently undo one.
    expect(searchTasks(rows, "l").map((t) => t.title)).toEqual([
      "Buy milk",
      "Call the dentist",
      "File taxes",
    ])
  })
})

describe("sortByCompletion", () => {
  const older = {
    title: "older",
    completedAt: new Date("2026-07-19T10:00:00Z"),
  }
  const newer = {
    title: "newer",
    completedAt: new Date("2026-07-21T10:00:00Z"),
  }
  const never = { title: "never", completedAt: null }

  it("puts the most recently completed first", () => {
    expect(sortByCompletion([older, newer]).map((t) => t.title)).toEqual([
      "newer",
      "older",
    ])
  })

  // `completed_at` is nullable, so a row finished before the column was written has no
  // instant to sort by. Bottom is the honest place for it, not the top.
  it("sends a row with no completion time to the end", () => {
    expect(sortByCompletion([never, older, newer]).map((t) => t.title)).toEqual(
      ["newer", "older", "never"],
    )
  })

  it("does not mutate its input", () => {
    // It is handed a React prop-derived array; sorting in place would be a side effect on
    // data the caller still holds.
    const input = [older, newer]
    sortByCompletion(input)
    expect(input.map((t) => t.title)).toEqual(["older", "newer"])
  })
})
