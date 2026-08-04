import {
  boolean,
  date,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// Relative import (not "@/db/schema") so drizzle-kit resolves it without aliases.
import { users } from "../../db/schema"

/**
 * Long-term goals. Progress comes from milestones where they exist, and otherwise from the
 * numeric pair below — see `goalProgress` in service.ts for the precedence.
 */
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  targetDate: date("target_date", { mode: "string" }),
  /**
   * Numeric progress for a goal that isn't broken into milestones — "12 of 30 books",
   * "8 of 20 lbs". `real` rather than integer because plenty of goals are measured in
   * fractions (miles, kilos, hours), matching the meals module's choice for nutrition.
   *
   * All three are nullable and travel together: a goal is measured numerically only when
   * `targetValue` is set and positive. `unit` is free text and purely a display suffix —
   * no conversion, no canonical list, the same call the app makes elsewhere by being
   * imperial in the column name rather than storing a unit at all.
   */
  targetValue: real("target_value"),
  currentValue: real("current_value"),
  unit: text("unit"),
  // Manual position. Existing rows all default to 0, so ordering stays inert until a
  // reorder writes it and ties fall back to createdAt — no backfill needed.
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  // Nullable: most milestones are just "the next thing", not a dated commitment.
  dueDate: date("due_date", { mode: "string" }),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * When it was ticked. Mirrors `tasks.completed_at`, and added in T7d because "goal
   * movement" had no temporal data at all: `done` is a bare boolean and `goals.
   * currentValue` is overwritten in place, so nothing could say what changed in a week.
   *
   * Forward-only by construction. Milestones ticked before this column existed have no
   * timestamp and can never get an honest one, so the weekly review under-reports its
   * first week rather than inventing dates for them.
   */
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
