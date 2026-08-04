import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

// Relative import (not "@/db/schema") so drizzle-kit resolves it without aliases.
import { users } from "../../db/schema"

/**
 * Notes and journal entries, in one table.
 *
 * Free-form notes and dated journal entries have an identical content shape and differ
 * only in whether they are anchored to a day — `entryDate` is that anchor and nothing
 * else. Two tables would fork the schema, the queries, the actions and the editor UI to
 * express one nullable column.
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Nullable: a journal entry is usually just its date. `noteTitle` in service.ts
    // falls back to the first line of the body, then to the date.
    title: text("title"),
    // Defaulted rather than nullable — "" and NULL would both mean "empty" and every
    // read would have to handle both.
    body: text("body").notNull().default(""),
    /** null = a free-form note; set = that day's journal entry. */
    entryDate: date("entry_date", { mode: "string" }),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One journal entry per day. Free-form notes are unaffected without needing a
    // partial index: Postgres treats NULLs as DISTINCT in a unique constraint, so any
    // number of (user, NULL) rows coexist — the same property
    // `transactions_series_occurrence` leans on to let one-off transactions past it.
    unique("notes_user_entry_date").on(table.userId, table.entryDate),
    // Every list read is "this user, most recently touched first".
    index("notes_user_updated").on(table.userId, table.updatedAt),
  ],
)
