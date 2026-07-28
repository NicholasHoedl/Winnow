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

// One preferences row per user (singleton — same shape as macro_targets).
//
// Mostly settings the SERVER must read (date/money logic). Appearance is the exception
// and was deliberately excluded until T6a: theme and palette are applied before first
// paint by blocking scripts in the ROOT layout, above any session lookup, so the server
// cannot know them in time and localStorage remains where they are read from.
//
// They are MIRRORED here rather than moved. The point is durability, not authority — a
// device that has never seen this account adopts these, and everything else lands in the
// JSON export, which is where they were conspicuously missing before.
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
  // "light" | "dark" | "system" — next-themes' own vocabulary, stored as text so the
  // set can change without a migration. Validated by Zod on the way in.
  theme: text("theme").notNull().default("system"),
  // A palette id from `@/lib/palettes`; the colour values themselves live in CSS.
  palette: text("palette").notNull().default("indigo"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
