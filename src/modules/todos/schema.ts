import {
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// Relative import (not "@/db/schema") so drizzle-kit resolves it without needing
// tsconfig path aliases.
import { users } from "../../db/schema"

export const priorityEnum = pgEnum("priority", ["low", "medium", "high"])
export const statusEnum = pgEnum("status", ["open", "done"])

export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // A task belongs to at most one list; deleting a list orphans its tasks.
  listId: uuid("list_id").references(() => lists.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  notes: text("notes"),
  // Date-only (no time-of-day). `mode: "string"` returns 'YYYY-MM-DD' and avoids
  // the UTC-midnight off-by-one that `mode: "date"` causes in negative offsets.
  dueDate: date("due_date", { mode: "string" }),
  priority: priorityEnum("priority").notNull().default("medium"),
  status: statusEnum("status").notNull().default("open"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
