import { describe, expect, it } from "vitest"

import { dueStatus, summarizeTasks } from "./service"

const TZ = "America/Chicago"

describe("dueStatus", () => {
  const now = new Date("2026-07-21T12:00:00Z") // Chicago today = 2026-07-21

  it("treats null/undefined as none", () => {
    expect(dueStatus(null, now, TZ)).toBe("none")
    expect(dueStatus(undefined, now, TZ)).toBe("none")
  })

  it("classifies past/today/future", () => {
    expect(dueStatus("2026-07-20", now, TZ)).toBe("overdue")
    expect(dueStatus("2026-07-21", now, TZ)).toBe("due-today")
    expect(dueStatus("2026-07-22", now, TZ)).toBe("upcoming")
  })

  it("uses the configured zone, not UTC (late-evening Chicago)", () => {
    // 2026-07-22T02:00Z: UTC date is 07-22, but Chicago is still 07-21.
    const lateNow = new Date("2026-07-22T02:00:00Z")
    expect(dueStatus("2026-07-21", lateNow, TZ)).toBe("due-today") // not overdue
    expect(dueStatus("2026-07-22", lateNow, TZ)).toBe("upcoming")
  })

  it("crosses the year boundary correctly", () => {
    const newYear = new Date("2027-01-01T12:00:00Z") // Chicago 2027-01-01
    expect(dueStatus("2026-12-31", newYear, TZ)).toBe("overdue")
    expect(dueStatus("2027-01-01", newYear, TZ)).toBe("due-today")
  })
})

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
