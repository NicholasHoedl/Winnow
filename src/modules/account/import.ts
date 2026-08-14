// Validation for an imported backup. Pure — no DB, no session — so the rules can be
// tested without a database, and so nothing reaches SQL until the whole file has been
// judged.

import { EXPORT_VERSION } from "./payload"
import { SINGLETON_KEYS, USER_TABLES, type UserTable } from "./tables"

/** A row as it arrives from JSON: keys are drizzle property names, values unparsed. */
export type ImportRow = Record<string, unknown>

export type ImportPayload = {
  version: number
  /** Every table's rows, by JSON key. The singleton is a one-or-zero-length array here,
   *  so callers have one shape to insert rather than two. */
  tables: Record<string, ImportRow[]>
}

export type ParseResult =
  { ok: true; data: ImportPayload } | { ok: false; error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Read a backup file, or say why it can't be read.
 *
 * Three jobs, in order of how much they matter:
 *
 * 1. **Version.** A file from a newer export is refused outright rather than
 *    half-applied — the import replaces everything, so a partial understanding of the
 *    file is the worst possible outcome.
 * 2. **Shape.** Every table present, arrays where arrays belong, every row an object
 *    with a string `id`.
 * 3. **Referential integrity, within the payload.** Every foreign key must resolve to a
 *    row in the same file.
 *
 * That third one is the security-relevant part, and it is why this is a whole-payload
 * check rather than a per-row schema. A crafted `tasks.goalId` naming *someone else's*
 * goal would satisfy the database's foreign key perfectly well and quietly link the
 * importer's task to a stranger's row — the same class of hole as `checkTaskLinks` (T5a)
 * and `checkCalendar` (T5b). Checking each id against the file instead of against the
 * database closes it for every column at once, and needs no queries to do it.
 */
export function parseImport(input: unknown): ParseResult {
  if (!isObject(input))
    return { ok: false, error: "That file isn't a Winnow backup." }

  if (input.version !== EXPORT_VERSION) {
    return {
      ok: false,
      error:
        typeof input.version === "number"
          ? `This backup is version ${input.version}; this app reads version ${EXPORT_VERSION}.`
          : "That file isn't a Winnow backup — it has no version.",
    }
  }

  const tables: Record<string, ImportRow[]> = {}

  for (const { key } of USER_TABLES) {
    const value = input[key]
    // An ABSENT key is treated as empty rather than rejected, and that is a deliberate
    // loosening. Every tranche that adds a table would otherwise invalidate every backup
    // file taken before it: T9a did exactly that with `ai_proposals`, and T12a would have
    // done it again with `habits` and `habit_entries`. On a self-hosted app whose entire
    // recovery story is one JSON file, silently breaking yesterday's backup is a worse
    // failure than the malformed-file case this branch was catching.
    //
    // What identifies a Winnow backup is unchanged: `version` must match exactly, and a key
    // that IS present must still hold the right shape and rows with ids. The only thing no
    // longer rejected is "this file predates a table", which is a normal thing for a backup
    // to be — and which restores correctly, because a table absent from the file simply has
    // nothing to insert.
    //
    // The OPPOSITE direction now exists too, and it is silent: this loop reads only the
    // keys in `USER_TABLES`, so a key in the file for a table that has since been REMOVED
    // is never looked at. T13 dropped `notes`, making that the first backup file in the
    // app's life to carry rows nothing will ever read — they are discarded without a
    // warning. That is the only available behaviour (there is no table to put them in) but
    // it is worth stating, because "the restore succeeded" and "everything in the file was
    // restored" stopped being the same sentence here.
    //
    // `EXPORT_VERSION` is deliberately NOT bumped for a removal. A bump refuses every
    // existing backup outright, which trades a silent partial restore for no restore at
    // all — the wrong way round for an app whose whole recovery story is one JSON file.
    if (value === undefined) {
      tables[key] = []
      continue
    }

    // The singleton is stored as an object-or-null; everything else as an array.
    let rows: unknown[]
    if (SINGLETON_KEYS.has(key)) {
      if (value !== null && !isObject(value)) {
        return { ok: false, error: `"${key}" should be a single record.` }
      }
      rows = value === null ? [] : [value]
    } else {
      if (!Array.isArray(value)) {
        return { ok: false, error: `"${key}" should be a list.` }
      }
      rows = value
    }

    for (const row of rows) {
      if (!isObject(row) || typeof row.id !== "string" || row.id === "") {
        return { ok: false, error: `A record in "${key}" has no id.` }
      }
    }
    tables[key] = rows as ImportRow[]
  }

  const dangling = findDanglingReference(tables)
  if (dangling) return { ok: false, error: dangling }

  return { ok: true, data: { version: EXPORT_VERSION, tables } }
}

/**
 * One validated row, in the shape an insert expects.
 *
 * Two things happen here and both matter:
 *
 * - **Only known columns survive.** The row is projected onto the table's own property
 *   list, so anything else in the file is dropped rather than handed to the database.
 * - **`userId` is the session's, always.** The file's is ignored — it is the exporter's,
 *   and on a restore into a different account it would be wrong; on a crafted file it
 *   would be someone else's.
 *
 * `id`, `createdAt` and `updatedAt` are deliberately KEPT. The `restore.ts` maps drop
 * them because an undo is re-creating a row now; a backup is putting back the row that
 * was, and a restore that silently re-stamps every timestamp is not a restore.
 */
export function toInsertRow(
  table: UserTable,
  row: ImportRow,
  userId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const column of table.columns) {
    const value = row[column]
    if (value === undefined) continue
    out[column] =
      table.dateColumns.includes(column) && typeof value === "string"
        ? new Date(value)
        : value
  }
  out.userId = userId
  return out
}

/** The first foreign key that points outside the file, described, or null. */
function findDanglingReference(
  tables: Record<string, ImportRow[]>,
): string | null {
  const ids = new Map<string, Set<string>>()
  for (const [key, rows] of Object.entries(tables)) {
    ids.set(key, new Set(rows.map((row) => row.id as string)))
  }

  for (const { key, references } of USER_TABLES) {
    for (const row of tables[key]) {
      for (const ref of references) {
        const value = row[ref.column]
        // A null link is a real state everywhere it is allowed — an undated task with no
        // list, a transaction with no category — so only a present one has to resolve.
        if (value === null || value === undefined) continue
        if (typeof value !== "string" || !ids.get(ref.to)?.has(value)) {
          return `A record in "${key}" points at a ${ref.to} record that isn't in this backup.`
        }
      }
    }
  }
  return null
}
