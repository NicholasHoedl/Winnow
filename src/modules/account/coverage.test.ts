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

import { exportKeyFor } from "./payload"
import { INSERT_ORDER } from "./tables"

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

const MODULES_DIR = join(import.meta.dirname, "..")

function readAccountSource(file: string) {
  return readFileSync(join(import.meta.dirname, file), "utf8")
}

/**
 * One exported function's source, bounded at the next top-level `export`.
 *
 * The bound is the whole point. These slices used to run to end-of-file, which was
 * harmless only because the function being checked happened to be the last one in its
 * file. It stops being harmless the moment anything below it mentions the same tables —
 * and an import that clears before inserting does exactly that. It would have satisfied
 * the `clearAllData` assertion on `clearAllData`'s behalf while `clearAllData` itself had
 * quietly stopped deleting something, which is precisely the bug this file exists for.
 *
 * `export` at column zero is unambiguous: nothing inside a function body can start a line
 * that way.
 */
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  expect(
    start,
    `${name} is not in this file — the guard is looking at the wrong thing`,
  ).toBeGreaterThanOrEqual(0)
  const rest = source.slice(start)
  const end = rest.indexOf("\nexport ")
  return end === -1 ? rest : rest.slice(0, end)
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
    expect(tables.length).toBeGreaterThanOrEqual(20)
    expect(tables.map(([, table]) => table)).toContain("water_logs")
  })

  it("deleteAllUserRows deletes from each one", () => {
    // The list moved out of `clearAllData` when a restore needed the same twenty deletes
    // inside its own transaction. This test moved with it — and noticed on its own that
    // it had, by failing the moment the deletes left the file it was reading.
    const clearAll = functionSource(
      readAccountSource("clear.ts"),
      "deleteAllUserRows",
    )
    for (const [exportName, table] of userOwnedTables()) {
      expect(
        clearAll.includes(`delete(${exportName})`),
        `deleteAllUserRows never deletes ${table} — it would survive "clear all data"`,
      ).toBe(true)
    }
  })

  it("importUserData restores each one", () => {
    // No source scan here, because the importer has no hand-written list to fall behind:
    // it walks INSERT_ORDER, which `tables.ts` derives from the same schemas. So the
    // thing worth checking is that the two independent derivations agree — this file
    // discovers tables by looking for a `user_id` column, `tables.ts` does its own walk,
    // and a restore that quietly covered nineteen of twenty tables would show up as a
    // disagreement rather than as data missing after a restore.
    expect(INSERT_ORDER.map((t) => t.key).sort()).toEqual(
      userOwnedTables()
        .map(([exportName]) => exportKeyFor(exportName))
        .sort(),
    )
  })

  it("exportUserData reads each one AND returns it", () => {
    const source = functionSource(
      readAccountSource("queries.ts"),
      "exportUserData",
    )
    for (const [exportName, table] of userOwnedTables()) {
      // Both halves: T3-S8 found a table that was queried but dropped from the
      // returned object, which loses the data just as completely.
      expect(
        source.includes(`db.query.${exportName}.findMany`),
        `exportUserData never reads ${table} — backups would omit it`,
      ).toBe(true)
      const key = exportKeyFor(exportName)
      expect(
        new RegExp(`^\\s*${key}: `, "m").test(source),
        `exportUserData reads ${table} but never returns it`,
      ).toBe(true)
    }
  })
})
