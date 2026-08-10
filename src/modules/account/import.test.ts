import { describe, expect, it } from "vitest"

import { parseImport, toInsertRow } from "./import"
import { EXPORT_VERSION } from "./payload"
import { EXPORT_KEYS, SINGLETON_KEYS, USER_TABLES } from "./tables"

// Import REPLACES everything. Whatever this function waves through is what the account
// becomes, and whatever it rejects is rejected before a single row is deleted — so the
// interesting cases are all the ones where a file is subtly wrong rather than obviously.

/** A complete, empty, valid backup — the baseline every case below perturbs. */
function emptyBackup(): Record<string, unknown> {
  const payload: Record<string, unknown> = { version: EXPORT_VERSION }
  for (const key of EXPORT_KEYS) {
    payload[key] = SINGLETON_KEYS.has(key) ? null : []
  }
  return payload
}

/** A backup with one task on one list, which is the smallest thing with a link in it. */
function linkedBackup() {
  return {
    ...emptyBackup(),
    lists: [{ id: "list-1", name: "Home" }],
    tasks: [{ id: "task-1", title: "Sweep", listId: "list-1" }],
  }
}

describe("parseImport — shape", () => {
  it("accepts a complete empty backup", () => {
    const result = parseImport(emptyBackup())
    expect(result.ok).toBe(true)
  })

  it("accepts a backup with linked rows", () => {
    expect(parseImport(linkedBackup()).ok).toBe(true)
  })

  it("normalises the singleton into a list so callers have one shape", () => {
    const result = parseImport({
      ...emptyBackup(),
      preferences: { id: "pref-1", timeZone: "UTC" },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.tables.preferences).toHaveLength(1)

    const absent = parseImport(emptyBackup())
    if (absent.ok) expect(absent.data.tables.preferences).toEqual([])
  })

  it("REJECTS anything that isn't an object", () => {
    for (const input of [null, "backup", 42, [], undefined]) {
      expect(parseImport(input).ok).toBe(false)
    }
  })

  it("REJECTS a version it does not understand", () => {
    // A newer file half-applied is the worst outcome available, since the import has
    // already cleared everything by the time a row fails.
    const future = parseImport({
      ...emptyBackup(),
      version: EXPORT_VERSION + 1,
    })
    expect(future.ok).toBe(false)
    if (!future.ok) expect(future.error).toContain(String(EXPORT_VERSION + 1))

    expect(parseImport({ ...emptyBackup(), version: undefined }).ok).toBe(false)
    expect(parseImport({ ...emptyBackup(), version: "1" }).ok).toBe(false)
  })

  /**
   * This assertion was inverted in T12a, deliberately, and the reasoning belongs with it.
   *
   * It used to REJECT a backup missing any table, on the grounds that a dropped table is a
   * table the import silently empties. The cost turned out to be worse than the risk: every
   * tranche that adds a table invalidates every backup taken before it. T9a did it with
   * `ai_proposals` and T12a would have done it again with `habits`/`habit_entries` — and on
   * a self-hosted app whose whole recovery story is one JSON file, "your backup from
   * yesterday no longer opens" beats anything this was catching.
   *
   * The guards that actually identify a Winnow backup are unchanged and still tested above
   * and below: an exact `version`, the right shape for a key that IS present, and ids on
   * every row. What is accepted now is only "this file predates a table", which restores
   * correctly because an absent table simply has nothing to insert.
   */
  it("accepts a backup that predates a table, treating it as empty", () => {
    for (const key of EXPORT_KEYS) {
      const payload = emptyBackup()
      delete payload[key]
      const result = parseImport(payload)
      expect(result.ok, `a backup with no "${key}" was rejected`).toBe(true)
      if (result.ok) expect(result.data.tables[key]).toEqual([])
    }
  })

  it("REJECTS a table that is the wrong kind of value", () => {
    expect(parseImport({ ...emptyBackup(), tasks: {} }).ok).toBe(false)
    expect(parseImport({ ...emptyBackup(), tasks: null }).ok).toBe(false)
    expect(parseImport({ ...emptyBackup(), preferences: [] }).ok).toBe(false)
  })

  it("REJECTS a row with no usable id", () => {
    // Ids are preserved on import, and they are what every link resolves against.
    for (const bad of [{}, { id: 1 }, { id: "" }, { id: null }, "row"]) {
      expect(parseImport({ ...emptyBackup(), lists: [bad] }).ok).toBe(false)
    }
  })
})

describe("toInsertRow", () => {
  const tasks = () => USER_TABLES.find((t) => t.key === "tasks")!
  const ME = "11111111-1111-1111-1111-111111111111"

  it("keeps the id and the original timestamps", () => {
    // The whole difference between a restore and an undo. `restore.ts` drops these on
    // purpose; a backup that re-stamps every row is not a backup.
    const row = toInsertRow(
      tasks(),
      {
        id: "task-1",
        title: "Sweep",
        createdAt: "2026-01-02T03:04:05.000Z",
        updatedAt: "2026-05-06T07:08:09.000Z",
      },
      ME,
    )
    expect(row.id).toBe("task-1")
    expect(row.createdAt).toEqual(new Date("2026-01-02T03:04:05.000Z"))
    expect(row.updatedAt).toEqual(new Date("2026-05-06T07:08:09.000Z"))
  })

  it("leaves a date-only column as the string it was", () => {
    // Converting `2026-03-01` to a Date would make it midnight UTC — the last day of
    // February in every negative-offset zone, shifting the whole app's dates west.
    const row = toInsertRow(tasks(), { id: "t", dueDate: "2026-03-01" }, ME)
    expect(row.dueDate).toBe("2026-03-01")
  })

  it("takes the session's owner, never the file's", () => {
    const row = toInsertRow(
      tasks(),
      { id: "t", userId: "22222222-2222-2222-2222-222222222222" },
      ME,
    )
    expect(row.userId).toBe(ME)
  })

  it("drops anything that isn't a column on that table", () => {
    const row = toInsertRow(
      tasks(),
      { id: "t", title: "Sweep", nonsense: "x", __proto__: "y" },
      ME,
    )
    expect(row).not.toHaveProperty("nonsense")
    expect(
      Object.keys(row).every(
        (k) => tasks().columns.includes(k) || k === "userId",
      ),
    ).toBe(true)
  })

  it("omits a column the file doesn't mention rather than nulling it", () => {
    // So the database's own default applies, which is what an older backup needs when a
    // column has been added since.
    const row = toInsertRow(tasks(), { id: "t" }, ME)
    expect(row).not.toHaveProperty("priority")
  })
})

describe("parseImport — referential integrity", () => {
  it("REJECTS a link to a row that isn't in the file", () => {
    const result = parseImport({
      ...emptyBackup(),
      tasks: [{ id: "task-1", title: "Sweep", listId: "list-missing" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("lists")
  })

  it("REJECTS a link that points at another user's row", () => {
    // The security case, and the reason this is a whole-payload check. A real uuid
    // belonging to someone else satisfies the database's foreign key perfectly well; it
    // is only wrong relative to the file, which is the one place worth checking.
    const result = parseImport({
      ...linkedBackup(),
      tasks: [
        {
          id: "task-1",
          title: "Sweep",
          goalId: "8f14e45f-ceea-467a-9575-3d0d4f0f1e3b",
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("goals")
  })

  it("allows a null link, which is a real state nearly everywhere", () => {
    const result = parseImport({
      ...emptyBackup(),
      tasks: [
        { id: "task-1", title: "Sweep", listId: null, goalId: null },
        { id: "task-2", title: "Mop" }, // absent entirely
      ],
    })
    expect(result.ok).toBe(true)
  })

  it("REJECTS a link whose value isn't even an id", () => {
    expect(
      parseImport({
        ...emptyBackup(),
        tasks: [{ id: "task-1", listId: 7 }],
      }).ok,
    ).toBe(false)
  })

  it("checks links that cross module boundaries", () => {
    // tasks → goals and tasks → events are the two edges that leave the todos module,
    // and the reason import order can't be worked out per module.
    const withGoal = parseImport({
      ...emptyBackup(),
      goals: [{ id: "goal-1", title: "Fitness" }],
      tasks: [{ id: "task-1", title: "Run", goalId: "goal-1" }],
    })
    expect(withGoal.ok).toBe(true)

    const withEvent = parseImport({
      ...emptyBackup(),
      tasks: [{ id: "task-1", title: "Run", eventId: "event-1" }],
    })
    expect(withEvent.ok).toBe(false)
  })

  it("checks a chain end to end", () => {
    // calendars → events → eventExceptions. Breaking the middle link must fail even
    // though both ends are present and internally consistent.
    const base = {
      ...emptyBackup(),
      calendars: [{ id: "cal-1", name: "Personal" }],
      events: [{ id: "event-1", title: "Standup", calendarId: "cal-1" }],
      eventExceptions: [
        { id: "exc-1", eventId: "event-1", calendarId: "cal-1" },
      ],
    }
    expect(parseImport(base).ok).toBe(true)
    expect(
      parseImport({
        ...base,
        events: [{ id: "event-1", title: "Standup", calendarId: "cal-gone" }],
      }).ok,
    ).toBe(false)
  })
})
