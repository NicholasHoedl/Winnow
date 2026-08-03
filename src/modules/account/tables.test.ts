import { describe, expect, it } from "vitest"

import { EXPORT_KEYS, INSERT_ORDER, USER_TABLES } from "./tables"

// `tables.ts` derives the backup's table graph from drizzle metadata instead of restating
// it. That is only better than a hand-written list if the derivation is actually right —
// a walk that silently found nothing would make every consumer trivially "correct" while
// covering no tables at all. So this pins the shape it must find.

describe("USER_TABLES", () => {
  it("finds every user-owned table exactly once", () => {
    // 21 as of T5c-a, which added `calendar_feed_tokens`. An exact count rather than a
    // floor on purpose: it should be a deliberate edit to add a table to everyone's
    // backup, and this is the line that makes someone notice they did.
    expect(USER_TABLES.length).toBe(21)
    expect(new Set(EXPORT_KEYS).size).toBe(21)
  })

  it("uses the export's key for the one table whose name differs", () => {
    expect(EXPORT_KEYS).toContain("preferences")
    expect(EXPORT_KEYS).not.toContain("userPreferences")
  })

  it("does not treat users as a table to import", () => {
    // `users` has no `user_id` of its own and is not part of a backup: the importing
    // session supplies the owner.
    expect(EXPORT_KEYS).not.toContain("users")
  })
})

describe("references", () => {
  const refs = (key: string) =>
    USER_TABLES.find((t) => t.key === key)!.references.map(
      (r) => `${r.column}->${r.to}`,
    )

  it("names every cross-table link a task can carry", () => {
    // The busiest row in the app, and the one whose links reach outside its own module.
    expect(refs("tasks").sort()).toEqual([
      "eventId->events",
      "goalId->goals",
      "listId->lists",
      "seriesId->taskRecurrences",
    ])
  })

  it("uses the row's property name, not the SQL column name", () => {
    // Rows arrive as JSON with drizzle's camelCase keys; checking `list_id` would find
    // nothing on every row and quietly pass.
    expect(refs("subtasks")).toEqual(["taskId->tasks"])
    expect(refs("milestones")).toEqual(["goalId->goals"])
  })

  it("ignores the user_id link every table has", () => {
    // Otherwise every table would appear to depend on a table that is not in the payload.
    for (const table of USER_TABLES) {
      expect(table.references.map((r) => r.to)).not.toContain("users")
    }
  })

  it("finds the links across module boundaries", () => {
    expect(refs("events")).toEqual(["calendarId->calendars"])
    expect(refs("eventExceptions").sort()).toEqual([
      "calendarId->calendars",
      "eventId->events",
    ])
    expect(refs("transactions").sort()).toEqual([
      "categoryId->categories",
      "seriesId->transactionRecurrences",
    ])
  })

  it("leaves the standalone tables with no references", () => {
    for (const key of ["lists", "calendars", "categories", "goals", "foods"]) {
      expect(refs(key)).toEqual([])
    }
  })
})

describe("columns", () => {
  const of = (key: string) => USER_TABLES.find((t) => t.key === key)!

  it("lists a row's properties, not its SQL column names", () => {
    expect(of("tasks").columns).toContain("dueDate")
    expect(of("tasks").columns).not.toContain("due_date")
  })

  it("marks timestamps as needing conversion back from JSON", () => {
    expect(of("tasks").dateColumns).toContain("createdAt")
    expect(of("tasks").dateColumns).toContain("updatedAt")
  })

  it("leaves date-only columns alone", () => {
    // `due_date` is `date({ mode: "string" })` — a plain YYYY-MM-DD on both sides.
    // Converting it would produce an instant at UTC midnight, which is the previous
    // day in every negative-offset zone, silently shifting every due date west.
    expect(of("tasks").dateColumns).not.toContain("dueDate")
    expect(of("bodyWeights").dateColumns).not.toContain("date")
    expect(of("events").dateColumns).not.toContain("recurrenceEndDate")
    // …while the true instants on the same table are converted.
    expect(of("events").dateColumns).toContain("startAt")
  })
})

describe("INSERT_ORDER", () => {
  it("covers every table exactly once", () => {
    expect(INSERT_ORDER.map((t) => t.key).sort()).toEqual(EXPORT_KEYS)
  })

  it("puts every reference target before the table that points at it", () => {
    // The property the whole ordering exists for. Asserted over the derived graph rather
    // than against a written-down sequence, so it keeps holding when a table is added.
    const position = new Map(INSERT_ORDER.map((t, i) => [t.key, i]))
    for (const table of INSERT_ORDER) {
      for (const ref of table.references) {
        expect(
          position.get(ref.to)!,
          `${ref.to} must be inserted before ${table.key}`,
        ).toBeLessThan(position.get(table.key)!)
      }
    }
  })

  it("actually reorders rather than returning the input", () => {
    // The property above holds trivially for any order if the graph were empty, and
    // would also hold for the alphabetical input if that happened to be valid. It isn't:
    // `subtasks` sorts before `tasks` alphabetically and must come after it.
    expect(INSERT_ORDER.map((t) => t.key)).not.toEqual(EXPORT_KEYS)
  })

  it("orders the app's longest dependency chain correctly", () => {
    const at = (key: string) => INSERT_ORDER.findIndex((t) => t.key === key)
    // lists → taskRecurrences → tasks → subtasks, four deep and the only chain that long.
    expect(at("lists")).toBeLessThan(at("taskRecurrences"))
    expect(at("taskRecurrences")).toBeLessThan(at("tasks"))
    expect(at("tasks")).toBeLessThan(at("subtasks"))
    // And the cross-module edges that make `tasks` late.
    expect(at("goals")).toBeLessThan(at("tasks"))
    expect(at("events")).toBeLessThan(at("tasks"))
    expect(at("calendars")).toBeLessThan(at("events"))
  })
})
