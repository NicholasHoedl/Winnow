// The user-owned table graph, derived from the schemas rather than written down.
//
// Three lists could have lived here — which tables a backup covers, which columns point
// at which other table, and what order they have to be inserted in. All three are already
// stated in the schema files, and a hand-copied second statement of a fact is exactly what
// `coverage.test.ts` exists to catch: that list has fallen behind the schema three times.
// So none of them are written down. They are computed.
//
// Pure: no `server-only`, no DB connection. It reads drizzle's table metadata, which is
// plain data available anywhere.

import { getTableColumns, is } from "drizzle-orm"
import { PgTable, getTableConfig } from "drizzle-orm/pg-core"

import * as budgetSchema from "@/modules/budget/schema"
import * as calendarSchema from "@/modules/calendar/schema"
import * as companionSchema from "@/modules/companion/schema"
import * as goalsSchema from "@/modules/goals/schema"
import * as habitsSchema from "@/modules/habits/schema"
import * as mealsSchema from "@/modules/meals/schema"
import * as notesSchema from "@/modules/notes/schema"
import * as preferencesSchema from "@/modules/preferences/schema"
import * as routinesSchema from "@/modules/routines/schema"
import * as todosSchema from "@/modules/todos/schema"

import { exportKeyFor } from "./payload"

const SCHEMAS = [
  budgetSchema,
  calendarSchema,
  companionSchema,
  goalsSchema,
  habitsSchema,
  mealsSchema,
  notesSchema,
  preferencesSchema,
  routinesSchema,
  todosSchema,
]

/** A column pointing at another user-owned table, in the terms the JSON uses. */
export type Reference = {
  /** The property name on an exported row, e.g. `listId`. */
  column: string
  /** The JSON key of the table it points at, e.g. `lists`. */
  to: string
}

export type UserTable = {
  /** The drizzle export name, e.g. `taskRecurrenceExceptions`. */
  name: string
  /** The key this table appears under in the export JSON. */
  key: string
  table: PgTable
  references: Reference[]
  /** Every column, by row property name. */
  columns: string[]
  /**
   * The columns JSON.stringify flattened into strings on the way out and that have to be
   * turned back into `Date` on the way in.
   *
   * Only `timestamp` columns: a `date({ mode: "string" })` column is a string on both
   * sides and must be left alone, or a plain `YYYY-MM-DD` would come back as an instant
   * at UTC midnight and shift a day in any negative-offset zone.
   */
  dateColumns: string[]
}

/**
 * The one table whose JSON value is a single object rather than an array.
 *
 * `user_preferences` has a unique `user_id`, so the exporter emits `rows[0] ?? null`. It
 * predates all of this and is the same exception `EXPORT_KEY` encodes.
 */
export const SINGLETON_KEYS: ReadonlySet<string> = new Set(["preferences"])

function hasUserId(table: PgTable): boolean {
  return getTableConfig(table).columns.some((c) => c.name === "user_id")
}

/**
 * Foreign keys that exist in the DATABASE but not in the drizzle schema, keyed by export
 * key. Every reference below is derived from `getTableConfig().foreignKeys`, which is the
 * point — a new link is checked with no list to update. These are the exceptions.
 *
 * `tasks.routine_id` is one because declaring `.references(() => routines.id)` would make
 * `todos/schema.ts` and `routines/schema.ts` circular: routines already imports
 * `priorityEnum` back from todos and reads it eagerly, so one of the two would evaluate
 * against an undefined enum. The constraint is real — migration 0033 writes it by hand —
 * but drizzle cannot see it, and without this entry the importer would stop checking that
 * a restored task's routine is one the file actually contains. That is precisely the
 * cross-account hole `findDanglingReference` exists to close.
 */
const UNDECLARED_REFERENCES: Record<string, Reference[]> = {
  tasks: [{ column: "routineId", to: "routines" }],
}

function build(): UserTable[] {
  // SQL table name → the entry, so a foreign key's target can be named in JSON terms.
  const bySqlName = new Map<
    string,
    { name: string; key: string; table: PgTable }
  >()
  const found: { name: string; key: string; table: PgTable }[] = []

  for (const schema of SCHEMAS) {
    for (const [name, value] of Object.entries(schema)) {
      if (!is(value, PgTable)) continue
      if (!hasUserId(value)) continue
      const entry = { name, key: exportKeyFor(name), table: value }
      // A schema may be imported by two modules (todos re-exports events/goals for its
      // FKs), so the same table can be seen twice.
      if (bySqlName.has(getTableConfig(value).name)) continue
      bySqlName.set(getTableConfig(value).name, entry)
      found.push(entry)
    }
  }

  return found
    .map((entry) => {
      const columns = getTableColumns(entry.table)
      const references: Reference[] = []
      for (const fk of getTableConfig(entry.table).foreignKeys) {
        const ref = fk.reference()
        const target = bySqlName.get(getTableConfig(ref.foreignTable).name)
        // `users` is not user-owned, so every row's owner is the session's and there is
        // nothing in the payload to point at.
        if (!target) continue
        const sqlName = ref.columns[0]?.name
        const property = Object.entries(columns).find(
          ([, column]) => (column as { name: string }).name === sqlName,
        )?.[0]
        if (property) references.push({ column: property, to: target.key })
      }
      const dateColumns = Object.entries(columns)
        .filter(
          ([, column]) => (column as { dataType: string }).dataType === "date",
        )
        .map(([property]) => property)
      return {
        ...entry,
        references: [
          ...references,
          ...(UNDECLARED_REFERENCES[entry.key] ?? []),
        ],
        columns: Object.keys(columns),
        dateColumns,
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}

export const USER_TABLES: UserTable[] = build()

/** Every JSON key a complete export carries, sorted. */
export const EXPORT_KEYS: string[] = USER_TABLES.map((t) => t.key).sort()

/**
 * The order rows have to be inserted in, so a foreign key's target always exists first.
 *
 * Deliberately not "the reverse of `clearAllData`'s delete order" — that order is
 * child-before-parent for deletes but is not a topological sort (it deletes `budgets`
 * after `transactionRecurrences`, which is FK-irrelevant), so reversing it would be right
 * by luck rather than by construction.
 */
export const INSERT_ORDER: UserTable[] = topological(USER_TABLES)

function topological(tables: UserTable[]): UserTable[] {
  const byKey = new Map(tables.map((t) => [t.key, t]))
  const out: UserTable[] = []
  const state = new Map<string, "visiting" | "done">()

  function visit(table: UserTable) {
    const seen = state.get(table.key)
    if (seen === "done") return
    // A self-reference is fine (nothing does this today, but it would be legal); a real
    // cycle between two tables cannot be inserted in any order and is worth saying so.
    if (seen === "visiting") {
      throw new Error(`Cyclic foreign keys involving "${table.key}"`)
    }
    state.set(table.key, "visiting")
    for (const ref of table.references) {
      const target = byKey.get(ref.to)
      if (target && target.key !== table.key) visit(target)
    }
    state.set(table.key, "done")
    out.push(table)
  }

  for (const table of tables) visit(table)
  return out
}
