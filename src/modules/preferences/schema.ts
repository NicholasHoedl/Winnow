import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// Relative import (not "@/db/schema") so drizzle-kit resolves it without aliases.
import { users } from "../../db/schema"
// Reuse the existing "priority" enum rather than declaring a second one.
import { priorityEnum } from "../todos/schema"

// One preferences row per user (singleton — same shape as macro_targets). Only
// settings the SERVER must read live here (date/money logic). Appearance
// (light/dark theme + colour palette) stays client-side via next-themes.
export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // IANA zone for date-only "today"/"overdue" math and time-of-day display.
  timeZone: text("time_zone").notNull().default("America/Chicago"),
  // 0 = Sunday, 1 = Monday. Drives the calendar month grid + week views.
  weekStartsOn: integer("week_starts_on").notNull().default(0),
  // ISO 4217 code; money is stored as integer cents regardless.
  currency: text("currency").notNull().default("USD"),
  // Render times as 24h when true, else 12h with am/pm.
  use24HourTime: boolean("use_24_hour_time").notNull().default(false),
  // Pre-selected priority when creating a new task.
  defaultTaskPriority: priorityEnum("default_task_priority")
    .notNull()
    .default("medium"),
  // Show the once-a-day digest banner on the first load of a new local day (T2).
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
