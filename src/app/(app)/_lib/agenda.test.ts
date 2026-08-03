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
