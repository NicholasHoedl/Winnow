import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

// Relative import (not "@/db/schema") so drizzle-kit resolves it without needing
// tsconfig path aliases.
import { users } from "../../db/schema"

export const priorityEnum = pgEnum("priority", ["low", "medium", "high"])
export const statusEnum = pgEnum("status", ["open", "done"])

// Recurring-task enums. Kept task-local (not shared with the calendar module) so todos
// stays independent of calendar; tasks only ever repeat daily/weekly/monthly.
export const taskRecurrenceFreqEnum = pgEnum("task_recurrence_freq", [
  "daily",
  "weekly",
  "monthly",
])
export const taskRecurrenceMonthlyModeEnum = pgEnum(
  "task_recurrence_monthly_mode",
  ["day_of_month", "nth_weekday"],
)

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

// A recurring-task template + its recurrence rule. The generator (todos/queries.ts)
// materializes the current occurrence into `tasks`, keyed by (seriesId, occurrenceDate).
export const taskRecurrences = pgTable("task_recurrences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  listId: uuid("list_id").references(() => lists.id, { onDelete: "set null" }),
  // Template fields copied onto each generated instance.
  title: text("title").notNull(),
  notes: text("notes"),
  priority: priorityEnum("priority").notNull().default("medium"),
  // Recurrence definition.
  freq: taskRecurrenceFreqEnum("freq").notNull(),
  recurrenceInterval: integer("recurrence_interval").notNull().default(1),
  // Weekly BYDAY as a 7-bit mask (bit i = weekday i, 0=Sun). 0 = anchor weekday only.
  weekdays: integer("weekdays").notNull().default(0),
  monthlyMode: taskRecurrenceMonthlyModeEnum("monthly_mode")
    .notNull()
    .default("day_of_month"),
  // "Once per period, any day within it" — meaningful only for weekly/monthly.
  flexible: boolean("flexible").notNull().default(false),
  // Anchor the recurrence is computed from; open-ended unless endDate is set (inclusive).
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // A task belongs to at most one list; deleting a list orphans its tasks.
    listId: uuid("list_id").references(() => lists.id, { onDelete: "set null" }),
    // The recurring series this task was generated from (null for one-off tasks).
    // Deleting the rule detaches completed instances into standalone history.
    seriesId: uuid("series_id").references(() => taskRecurrences.id, {
      onDelete: "set null",
    }),
    // Cycle key of a generated instance (occurrence date, or period-start for flexible);
    // null for one-off tasks.
    occurrenceDate: date("occurrence_date", { mode: "string" }),
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
  },
  // One materialized instance per (series, occurrence). NULLs are DISTINCT in PG17, so
  // one-off tasks (both null) never collide — the constraint only binds generated rows.
  (table) => [
    unique("tasks_series_occurrence").on(table.seriesId, table.occurrenceDate),
  ],
)
