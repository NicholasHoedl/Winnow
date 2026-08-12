import { describe, expect, it } from "vitest"

import { buildTodayAgenda, type AgendaItem } from "./agenda"

const TZ = "America/Chicago"
const now = new Date("2026-07-21T12:00:00Z") // Chicago today = 2026-07-21

// Terse builders so the tables below stay readable. The extra `label` proves the
// generics hand the caller's own richer objects back.
function task(
  dueDate: string | null,
  status: "open" | "done" = "open",
  label = `task ${dueDate}`,
) {
  return { dueDate, status, label }
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

  it("ignores done, upcoming, and undated tasks", () => {
    const { overdue, items } = buildTodayAgenda(
      [
        task("2026-07-19", "done", "done overdue"),
        task("2026-07-21", "done", "done today"),
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
