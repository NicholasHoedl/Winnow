import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { is } from "drizzle-orm"
import { PgTable, getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import * as budgetSchema from "@/modules/budget/schema"
import * as calendarSchema from "@/modules/calendar/schema"
import * as goalsSchema from "@/modules/goals/schema"
import * as mealsSchema from "@/modules/meals/schema"
import * as preferencesSchema from "@/modules/preferences/schema"
import * as todosSchema from "@/modules/todos/schema"

// `clearAllData` and `exportUserData` enumerate tables by hand, and that hand-written
// list has now fallen behind the schema three times: `842f420` (tasks), T3-S8
// (task_recurrences left behind by clear-all, then immediately regenerating tasks into
// the "empty" account), and T4-S11 (calendars surviving clear-all; calendars AND
// event_exceptions missing from the backup, so a restore silently reverted every
// per-occurrence edit). Nothing catches it: a forgotten table is not a type error, and
// neither function has e2e coverage — running clear-all in a spec would wipe the
// persistent dev database.
//
// So the check is derived rather than written down. It discovers every module schema on
// disk, finds every table carrying a `user_id` column — the definition of "user-owned",
// per ARCHITECTURE.md §3 — and asserts both functions name it. A new module or a new
// table is picked up with no list to update here.
//
// Asserting against source text is unusual, and it is deliberate: both functions are
// `server-only` and open a database connection, so a unit test cannot call them. The
// text is only ever used to answer "is this table mentioned at all?", which is precisely
// the question that was missed each time.

// Statically imported rather than globbed: `import.meta.glob` needs vite/client ambient
// types, which this project's tsconfig deliberately doesn't pull in (they also declare
// modules for .css/.svg that could collide with Next's). The cost is a list that can go
// stale, so the first test compares it against the schema files actually on disk.
const SCHEMAS = {
  budget: budgetSchema,
  calendar: calendarSchema,
  goals: goalsSchema,
  meals: mealsSchema,
  preferences: preferencesSchema,
  todos: todosSchema,
} satisfies Record<string, Record<string, unknown>>

/**
 * The key each table appears under in the export JSON, where it differs from the
 * drizzle export name. Only one does, and it predates this test.
 */
const EXPORT_KEY: Record<string, string> = { userPreferences: "preferences" }

const MODULES_DIR = join(import.meta.dirname, "..")

function readAccountSource(file: string) {
  return readFileSync(join(import.meta.dirname, file), "utf8")
}

/** Every `[exportName, sqlName]` pair, across every module, that has a userId column. */
function userOwnedTables(): [string, string][] {
  const found: [string, string][] = []
  for (const schema of Object.values(SCHEMAS)) {
    for (const [exportName, value] of Object.entries(schema)) {
      if (!is(value, PgTable)) continue
      const config = getTableConfig(value)
      if (!config.columns.some((column) => column.name === "user_id")) continue
      found.push([exportName, config.name])
    }
  }
  return found.sort(([a], [b]) => a.localeCompare(b))
}

describe("account data tools cover every user-owned table", () => {
  it("checks every module that has a schema", () => {
    // Without this, adding a module and forgetting to import it above would make the
    // guard quietly stop covering it — the exact failure mode it exists to prevent.
    const onDisk = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(MODULES_DIR, name, "schema.ts")))
      .sort()
    expect(Object.keys(SCHEMAS).sort()).toEqual(onDisk)
  })

  it("discovers the tables to check", () => {
    const tables = userOwnedTables()
    // A sanity floor: if discovery silently broke, every assertion below would pass
    // vacuously and the guard would be worse than useless.
    expect(tables.length).toBeGreaterThanOrEqual(18)
    expect(tables.map(([, table]) => table)).toContain("water_logs")
  })

  it("clearAllData deletes from each one", () => {
    const source = readAccountSource("actions.ts")
    const clearAll = source.slice(
      source.indexOf("export async function clearAllData"),
    )
    for (const [exportName, table] of userOwnedTables()) {
      expect(
        clearAll.includes(`delete(${exportName})`),
        `clearAllData never deletes ${table} — it would survive "clear all data"`,
      ).toBe(true)
    }
  })

  it("exportUserData reads each one AND returns it", () => {
    const source = readAccountSource("queries.ts")
    for (const [exportName, table] of userOwnedTables()) {
      // Both halves: T3-S8 found a table that was queried but dropped from the
      // returned object, which loses the data just as completely.
      expect(
        source.includes(`db.query.${exportName}.findMany`),
        `exportUserData never reads ${table} — backups would omit it`,
      ).toBe(true)
      const key = EXPORT_KEY[exportName] ?? exportName
      expect(
        new RegExp(`^\\s*${key}: `, "m").test(source),
        `exportUserData reads ${table} but never returns it`,
      ).toBe(true)
    }
  })
})
