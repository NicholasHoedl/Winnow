import { describe, expect, it } from "vitest"

import { buildSlate, buildTodayAgenda, type AgendaItem } from "./agenda"

const TZ = "America/Chicago"
const now = new Date("2026-07-21T12:00:00Z") // Chicago today = 2026-07-21
// Two instants either side of the Chicago day boundary, for `completedAt`. Both are the
// same wall-day in Chicago as their names say — which is the only thing that matters here.
const earlierToday = new Date("2026-07-21T15:00:00Z") // 10:00 on the 21st
const yesterday = new Date("2026-07-20T15:00:00Z") // 10:00 on the 20th

// Terse builders so the tables below stay readable. The extra `label` proves the
// generics hand the caller's own richer objects back.
function task(
  dueDate: string | null,
  status: "open" | "done" = "open",
  label = `task ${dueDate}`,
  completedAt: Date | null = null,
) {
  return { dueDate, status, label, completedAt }
}
function occ(time: string | null, label = `event ${time ?? "all-day"}`) {
  return { time, label }
}

// What ended up in the agenda, in order, as "kind:label".
function shape<T extends { label: string }, E extends { label: string }>(
  items: AgendaItem<T, E>[],
): string[] {
  return items.map((item) =>
    item.kind === "task"
      ? `task:${item.task.label}`
      : `event:${item.occurrence.label}`,
  )
}

describe("buildTodayAgenda", () => {
  it("merges today's tasks and events: untimed first, then timed ascending", () => {
    const { items } = buildTodayAgenda(
      [task("2026-07-21", "open", "water plants")],
      [occ("14:00", "gym"), occ(null, "birthday"), occ("09:00", "standup")],
      now,
      TZ,
    )
    expect(shape(items)).toEqual([
      "event:birthday", // all-day leads
      "task:water plants", // then today's untimed tasks
      "event:standup", // then timed, ascending
      "event:gym",
    ])
  })

  it("keeps overdue tasks out of the agenda, in their own group", () => {
    const { overdue, items } = buildTodayAgenda(
      [
        task("2026-07-19", "open", "old"),
        task("2026-07-20", "open", "older"),
        task("2026-07-21", "open", "today"),
      ],
      [],
      now,
      TZ,
    )
    expect(overdue.map((t) => t.label)).toEqual(["old", "older"])
    expect(shape(items)).toEqual(["task:today"])
  })

  it("ignores upcoming, undated, and tasks completed before today", () => {
    const { overdue, items } = buildTodayAgenda(
      [
        task("2026-07-19", "done", "overdue, ticked yesterday", yesterday),
        task("2026-07-21", "done", "due today, ticked yesterday", yesterday),
        task("2026-07-25", "open", "upcoming"),
        task(null, "open", "someday"),
      ],
      [],
      now,
      TZ,
    )
    expect(overdue).toEqual([])
    expect(items).toEqual([])
  })

  it("returns empty groups for empty input", () => {
    expect(buildTodayAgenda([], [], now, TZ)).toEqual({
      overdue: [],
      groups: [],
      items: [],
    })
  })

  it("classifies against the configured zone, not UTC", () => {
    // 02:00Z on the 22nd is still the 21st in Chicago, but already the 22nd in UTC.
    const lateNow = new Date("2026-07-22T02:00:00Z")
    const tasks = [task("2026-07-21", "open", "due the 21st")]

    const chicago = buildTodayAgenda(tasks, [], lateNow, TZ)
    expect(chicago.overdue).toEqual([])
    expect(shape(chicago.items)).toEqual(["task:due the 21st"])

    const utc = buildTodayAgenda(tasks, [], lateNow, "UTC")
    expect(utc.overdue.map((t) => t.label)).toEqual(["due the 21st"])
    expect(utc.items).toEqual([])
  })

  it("preserves input order among items sharing a time", () => {
    const { items } = buildTodayAgenda(
      [],
      [occ("09:00", "first"), occ("09:00", "second"), occ("09:00", "third")],
      now,
      TZ,
    )
    expect(shape(items)).toEqual(["event:first", "event:second", "event:third"])
  })

  it("carries the occurrence's own time onto the agenda item", () => {
    const { items } = buildTodayAgenda([], [occ("09:30"), occ(null)], now, TZ)
    expect(items.map((i) => i.time)).toEqual([null, "09:30"])
  })
})

// T12e: a routine's steps stay together instead of scattering through the day.
describe("buildTodayAgenda — routine groups", () => {
  const MORNING = "11111111-1111-4111-8111-111111111111"
  const EVENING = "22222222-2222-4222-8222-222222222222"
  const NAMES = new Map([
    [MORNING, "Morning routine"],
    [EVENING, "Evening routine"],
  ])

  /** A due-today task, optionally stamped with the routine that created it. */
  function step(label: string, routineId: string | null = null) {
    return { dueDate: "2026-07-21", status: "open" as const, routineId, label }
  }

  it("collects a routine's tasks into one named block, out of the flat list", () => {
    const { groups, items } = buildTodayAgenda(
      [step("make bed", MORNING), step("call mom"), step("shower", MORNING)],
      [],
      now,
      TZ,
      NAMES,
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("Morning routine")
    // Contiguous even though a loose task sat between them in the input — which is the
    // whole point, and what leaving them in the time sort would have prevented.
    expect(groups[0].tasks.map((t) => t.label)).toEqual(["make bed", "shower"])
    expect(shape(items)).toEqual(["task:call mom"])
  })

  it("keeps one block per routine, ordered by where each first appears", () => {
    const { groups } = buildTodayAgenda(
      [
        step("wind down", EVENING),
        step("make bed", MORNING),
        step("brush", EVENING),
      ],
      [],
      now,
      TZ,
      NAMES,
    )
    expect(groups.map((g) => g.name)).toEqual([
      "Evening routine",
      "Morning routine",
    ])
    expect(groups[0].tasks.map((t) => t.label)).toEqual(["wind down", "brush"])
  })

  // The FK sets routine_id to null when a routine is deleted, so this is defensive —
  // but a nameless heading would be worse than no heading, and an ungrouped task is
  // exactly what the agenda showed before grouping existed.
  it("leaves a task loose when its routine cannot be named", () => {
    const { groups, items } = buildTodayAgenda(
      [step("orphan", "33333333-3333-4333-8333-333333333333")],
      [],
      now,
      TZ,
      NAMES,
    )
    expect(groups).toEqual([])
    expect(shape(items)).toEqual(["task:orphan"])
  })

  it("groups nothing when no names are supplied at all", () => {
    const { groups, items } = buildTodayAgenda(
      [step("make bed", MORNING)],
      [],
      now,
      TZ,
    )
    expect(groups).toEqual([])
    expect(shape(items)).toEqual(["task:make bed"])
  })

  // Overdue is judged before grouping, deliberately: a routine step you did not do
  // yesterday is overdue work, not part of today's sequence.
  it("does not group an overdue routine task", () => {
    const stale = {
      dueDate: "2026-07-19",
      status: "open" as const,
      routineId: MORNING,
      label: "yesterday's bed",
    }
    const { overdue, groups } = buildTodayAgenda([stale], [], now, TZ, NAMES)
    expect(overdue.map((t) => t.label)).toEqual(["yesterday's bed"])
    expect(groups).toEqual([])
  })

  it("still merges loose tasks with events by time", () => {
    const { items } = buildTodayAgenda(
      [step("make bed", MORNING), step("call mom")],
      [occ("09:00", "standup"), occ(null, "holiday")],
      now,
      TZ,
      NAMES,
    )
    expect(shape(items)).toEqual([
      "event:holiday",
      "task:call mom",
      "event:standup",
    ])
  })
})

// A task you tick stays on the board for the rest of the day, struck through, instead of
// vanishing under the tap. `completed_at` is what bounds that: status alone would leave
// every task ever finished late sitting in Overdue for good, since `getTasks` applies no
// status filter of its own and these three call sites are the only thing excluding done work.
describe("buildTodayAgenda — tasks completed today", () => {
  it("keeps a task completed today in today's items", () => {
    const { items } = buildTodayAgenda(
      [task("2026-07-21", "done", "water plants", earlierToday)],
      [],
      now,
      TZ,
    )
    expect(shape(items)).toEqual(["task:water plants"])
  })

  // Deliberate: ticking an overdue task must not make the row jump into Today under the
  // finger that just tapped it. It goes struck-through where it already was.
  it("keeps an overdue task completed today in the overdue block", () => {
    const { overdue, items } = buildTodayAgenda(
      [task("2026-07-19", "done", "old", earlierToday)],
      [],
      now,
      TZ,
    )
    expect(overdue.map((t) => t.label)).toEqual(["old"])
    expect(items).toEqual([])
  })

  it("drops a task completed on an earlier day", () => {
    const { overdue, items } = buildTodayAgenda(
      [task("2026-07-21", "done", "yesterday's win", yesterday)],
      [],
      now,
      TZ,
    )
    expect(overdue).toEqual([])
    expect(items).toEqual([])
  })

  // The column is nullable, so a row completed before it was written has no instant to
  // judge. Treated as old work rather than as today's.
  it("drops a done task carrying no completion time at all", () => {
    const { items } = buildTodayAgenda(
      [task("2026-07-21", "done", "no stamp", null)],
      [],
      now,
      TZ,
    )
    expect(items).toEqual([])
  })

  it("judges the completion against the configured zone, not UTC", () => {
    // 02:00Z on the 21st is 21:00 on the 20th in Chicago — yesterday's work, though UTC
    // calls it today. The same hazard `dueStatus` is careful about, one field over.
    const justAfterUtcMidnight = new Date("2026-07-21T02:00:00Z")
    const tasks = [task("2026-07-21", "done", "late tick", justAfterUtcMidnight)]

    expect(buildTodayAgenda(tasks, [], now, TZ).items).toEqual([])
    expect(shape(buildTodayAgenda(tasks, [], now, "UTC").items)).toEqual([
      "task:late tick",
    ])
  })

  it("keeps a completed routine step in its block and out of the flat list", () => {
    const MORNING = "11111111-1111-4111-8111-111111111111"
    const { groups, items } = buildTodayAgenda(
      [
        {
          dueDate: "2026-07-21",
          status: "done" as const,
          routineId: MORNING,
          completedAt: earlierToday,
          label: "make bed",
        },
      ],
      [],
      now,
      TZ,
      new Map([[MORNING, "Morning routine"]]),
    )
    // In the group and NOT also loose — the one-band invariant T16 exists to protect.
    expect(groups[0].tasks.map((t) => t.label)).toEqual(["make bed"])
    expect(items).toEqual([])
  })
})

// --- Slate -----------------------------------------------------------------------------

// Chicago today = 2026-07-21 (Tue). Tomorrow 07-22, +2 07-23 (Thu), +7 07-28.
function sOcc(
  date: string,
  time: string | null,
  highlighted = false,
  label = `event ${date}`,
) {
  return { date, time, event: { highlighted }, label }
}

/** Band labels in order, so the shape of the card is one assertion. */
function bandLabels(slate: { bands: { label: string }[] }): string[] {
  return slate.bands.map((band) => band.label)
}

describe("buildSlate", () => {
  it("keeps today's agenda exactly as buildTodayAgenda builds it", () => {
    // The today band IS that function's output — this pins the delegation rather than
    // re-testing the sort, which its own thirteen cases already cover.
    const tasks = [task("2026-07-21", "open", "today")]
    const occs = [sOcc("2026-07-21", "09:00", false, "standup")]
    const slate = buildSlate(tasks, occs, now, TZ, 7)
    const agenda = buildTodayAgenda(tasks, occs, now, TZ)

    expect(slate.overdue).toEqual(agenda.overdue)
    expect(slate.bands[0].label).toBe("Today")
    expect(slate.bands[0].items).toEqual(agenda.items)
  })

  it("shows every event tomorrow, highlighted or not", () => {
    // Tomorrow keeps what the old `Tomorrow` card showed. The horizon governs the days
    // AFTER it, so no setting can empty this band.
    const slate = buildSlate(
      [],
      [sOcc("2026-07-22", "09:00", false, "dull"), sOcc("2026-07-22", null, true, "flagged")],
      now,
      TZ,
      7,
    )
    expect(bandLabels(slate)).toEqual(["Today", "Tomorrow"])
    expect(shape(slate.bands[1].items)).toEqual(["event:flagged", "event:dull"])
  })

  it("shows only highlighted events beyond tomorrow", () => {
    const slate = buildSlate(
      [],
      [sOcc("2026-07-23", "09:00", false, "standup"), sOcc("2026-07-23", "14:00", true, "flight")],
      now,
      TZ,
      7,
    )
    expect(bandLabels(slate)).toEqual(["Today", "Thu 23"])
    expect(shape(slate.bands[1].items)).toEqual(["event:flight"])
  })

  it("drops a highlighted event beyond the horizon", () => {
    const occs = [sOcc("2026-07-28", null, true, "far")]
    expect(bandLabels(buildSlate([], occs, now, TZ, 7))).toEqual([
      "Today",
      "Tue 28",
    ])
    // Same event, tighter horizon: 07-28 is seven days out, so a 3-day horizon excludes it.
    expect(bandLabels(buildSlate([], occs, now, TZ, 3))).toEqual(["Today"])
  })

  it("reaches the horizon day itself, not one short of it", () => {
    // "Within 7 days" includes the seventh. Off-by-one here would silently hide the last
    // day at every setting.
    expect(
      bandLabels(buildSlate([], [sOcc("2026-07-24", null, true)], now, TZ, 3)),
    ).toEqual(["Today", "Fri 24"])
  })

  it("puts tasks due within the horizon on their own day", () => {
    const slate = buildSlate(
      [task("2026-07-23", "open", "draft")],
      [],
      now,
      TZ,
      7,
    )
    expect(bandLabels(slate)).toEqual(["Today", "Thu 23"])
    expect(shape(slate.bands[1].items)).toEqual(["task:draft"])
  })

  it("collects far-future and undated tasks into Later", () => {
    const slate = buildSlate(
      [task("2026-09-12", "open", "passport"), task(null, "open", "someday")],
      [],
      now,
      TZ,
      7,
    )
    expect(bandLabels(slate)).toEqual(["Today", "Later"])
    expect(shape(slate.bands[1].items)).toEqual([
      "task:passport",
      "task:someday",
    ])
  })

  it("omits a day with nothing on it", () => {
    // Most days between here and the horizon hold nothing flagged. A column of empty
    // dates would make the card look busy while saying nothing.
    const slate = buildSlate([], [sOcc("2026-07-25", null, true)], now, TZ, 7)
    expect(bandLabels(slate)).toEqual(["Today", "Sat 25"])
  })

  it("never labels a band with a year or a date range", () => {
    // `dashboard-calendar-view.spec.ts` finds the month heading as the one `main h2`
    // ending in four digits and the week heading as the one with an en-dash. A band label
    // carrying either makes those locators ambiguous and fails a spec about the calendar.
    const occs = ["2026-07-23", "2026-07-25", "2026-07-28"].map((d) =>
      sOcc(d, null, true),
    )
    for (const label of bandLabels(buildSlate([], occs, now, TZ, 7))) {
      expect(label).not.toMatch(/\d{4}$/)
      expect(label).not.toMatch(/[–-]/)
    }
  })

  it("still separates overdue, and keeps it out of every band", () => {
    const slate = buildSlate(
      [task("2026-07-01", "open", "old"), task("2026-07-21", "open", "today")],
      [],
      now,
      TZ,
      7,
    )
    expect(slate.overdue.map((t) => t.label)).toEqual(["old"])
    expect(slate.bands.flatMap((b) => shape(b.items))).toEqual(["task:today"])
  })

  it("ignores tasks completed before today, in every band", () => {
    const slate = buildSlate(
      [
        task("2026-07-19", "done", "old", yesterday),
        task("2026-07-21", "done", "today", yesterday),
        task("2026-07-23", "done", "done-soon", yesterday),
        task("2026-09-12", "done", "done-later", yesterday),
        task(null, "done", "someday", yesterday),
      ],
      [],
      now,
      TZ,
      7,
    )
    expect(slate.overdue).toEqual([])
    expect(bandLabels(slate)).toEqual(["Today"])
    expect(slate.bands[0].items).toEqual([])
  })

  // Ticked ahead of time from /activity: it stays where its due date puts it rather than
  // moving to the day it was done. The band is a statement about the deadline.
  it("keeps a task completed today in its future band", () => {
    const slate = buildSlate(
      [task("2026-07-22", "done", "packed bag", earlierToday)],
      [],
      now,
      TZ,
      7,
    )
    expect(bandLabels(slate)).toEqual(["Today", "Tomorrow"])
    expect(shape(slate.bands[1].items)).toEqual(["task:packed bag"])
  })

  it("keeps an undated task completed today in Later", () => {
    const slate = buildSlate(
      [task(null, "done", "someday, done", earlierToday)],
      [],
      now,
      TZ,
      7,
    )
    expect(bandLabels(slate)).toEqual(["Today", "Later"])
    expect(shape(slate.bands[1].items)).toEqual(["task:someday, done"])
  })
})
