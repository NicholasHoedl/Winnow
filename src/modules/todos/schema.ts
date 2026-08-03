import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

// Relative imports (not "@/db/schema") so drizzle-kit resolves them without needing
// tsconfig path aliases. The goals/events imports (T2) let tasks link across modules;
// the dependency stays acyclic — goals + calendar schemas import only `users`.
import { users } from "../../db/schema"
import { events } from "../calendar/schema"
import { goals } from "../goals/schema"

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
    listId: uuid("list_id").references(() => lists.id, {
      onDelete: "set null",
    }),
    // The recurring series this task was generated from (null for one-off tasks).
    // Deleting the rule detaches completed instances into standalone history.
    seriesId: uuid("series_id").references(() => taskRecurrences.id, {
      onDelete: "set null",
    }),
    // Cycle key of a generated instance (occurrence date, or period-start for flexible);
    // null for one-off tasks.
    occurrenceDate: date("occurrence_date", { mode: "string" }),
    // Optional cross-module links (T2): a task can count toward a goal and/or be
    // associated with a calendar event (series-level). Deleting either detaches the
    // task (set null) rather than removing it.
    goalId: uuid("goal_id").references(() => goals.id, {
      onDelete: "set null",
    }),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    notes: text("notes"),
    // Date-only (no time-of-day). `mode: "string"` returns 'YYYY-MM-DD' and avoids
    // the UTC-midnight off-by-one that `mode: "date"` causes in negative offsets.
    dueDate: date("due_date", { mode: "string" }),
    priority: priorityEnum("priority").notNull().default("medium"),
    status: statusEnum("status").notNull().default("open"),
    // Manual position WITHIN a date section (overdue / today / upcoming / someday), not
    // across the whole list — dragging between sections would have to rewrite dueDate,
    // which is a different feature. Defaulting every existing row to 0 keeps ordering
    // inert until something writes it, at which point ties fall back to the previous
    // dueDate/createdAt order, so no backfill is needed.
    sortOrder: integer("sort_order").notNull().default(0),
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

/**
 * A one-level checklist under a task. Flat on purpose — no nesting — so `tasks` stays a
 * table every other module can join to rather than a tree. Same shape as `milestones`
 * under a goal, which is the existing in-repo pattern for a done-flagged child list, and
 * it is read the same way: one extra findMany grouped in memory, not a per-row join.
 */
export const subtasks = pgTable(
  "subtasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("subtasks_user_task").on(table.userId, table.taskId)],
)

/**
 * "Skip this one" for a recurring task. Same shape as the calendar's `event_exceptions`,
 * minus the override columns — a skipped task needs no per-occurrence edit, because the
 * materialized row already supports that.
 *
 * The WIRING differs from the calendar, and that's the whole design. Calendar occurrences
 * are expanded on read, so an overlay can simply drop one. Tasks are materialized by
 * `syncRuleInstances`, which runs on every render of /todos, the dashboard and the
 * digest — so deleting the instance is not a skip, it reappears on the next page load. The
 * exception has to suppress the INSERT instead. See todos/queries.ts.
 *
 * Row-absent rather than row-flagged on purpose: a `skipped` boolean on `tasks` would
 * leave an OPEN task that every list, count, digest and search has to remember to filter
 * out. With no row, nothing can leak.
 */
export const taskRecurrenceExceptions = pgTable(
  "task_recurrence_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => taskRecurrences.id, { onDelete: "cascade" }),
    // The cycle key being skipped — matches `tasks.occurrence_date`, which for a flexible
    // rule is the period start rather than the due date.
    occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("task_recurrence_exceptions_rule_occurrence").on(
      table.ruleId,
      table.occurrenceDate,
    ),
    // The generator loads every exception for a user in one query per render, so the
    // lookup is by user, not by rule.
    index("task_recurrence_exceptions_user").on(table.userId),
  ],
)
