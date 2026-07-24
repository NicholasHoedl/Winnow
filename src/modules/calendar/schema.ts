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

// Relative import (not "@/db/schema") so drizzle-kit resolves it without aliases.
import { users } from "../../db/schema"

export const recurrenceFreqEnum = pgEnum("recurrence_freq", [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
])

// How a monthly series lands each month: on the same day-of-month as the start
// (legacy), or on the same Nth-weekday (e.g. "3rd Monday"), derived from the start.
export const recurrenceMonthlyModeEnum = pgEnum("recurrence_monthly_mode", [
  "day_of_month",
  "nth_weekday",
])

// Named calendars (Personal, Work, …). `color` is a palette slot (1–6) mapped
// to --cat-1..6 for colour-coding; no colour hex is stored.
export const calendars = pgTable("calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: integer("color").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Events store instants in `start_at`/`end_at` (timestamptz). Recurring
// occurrences are expanded on read in service.ts, never materialized as rows.
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Deleting a calendar removes its events (cascade).
  calendarId: uuid("calendar_id").references(() => calendars.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  notes: text("notes"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  // Nullable to allow open-ended / point-in-time events.
  endAt: timestamp("end_at", { withTimezone: true }),
  allDay: boolean("all_day").notNull().default(false),
  recurrenceFreq: recurrenceFreqEnum("recurrence_freq").notNull().default("none"),
  recurrenceInterval: integer("recurrence_interval").notNull().default(1),
  // Weekly BYDAY as a 7-bit mask (bit i = weekday i, getUTCDay 0=Sun). 0 = repeat
  // on the start date's weekday only (legacy behavior — valid for existing rows).
  recurrenceWeekdays: integer("recurrence_weekdays").notNull().default(0),
  // Monthly landing rule (see enum). Ignored unless recurrenceFreq = "monthly".
  recurrenceMonthlyMode: recurrenceMonthlyModeEnum("recurrence_monthly_mode")
    .notNull()
    .default("day_of_month"),
  // First-of-nothing: a date-only bound; the series is open-ended if null.
  recurrenceEndDate: date("recurrence_end_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// Per-occurrence overrides for a recurring event ("This event" edits/skips),
// keyed by the occurrence's natural date (RECURRENCE-ID). Applied as a read-time
// overlay in service.ts — the series row is never mutated. `canceled` skips the
// occurrence; the nullable columns replace that one occurrence's fields.
export const eventExceptions = pgTable(
  "event_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // The occurrence's natural (un-overridden) local date — the stable key.
    originalDate: date("original_date", { mode: "string" }).notNull(),
    canceled: boolean("canceled").notNull().default(false),
    // Overrides (null = inherit from the series).
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day"),
    title: text("title"),
    notes: text("notes"),
    calendarId: uuid("calendar_id").references(() => calendars.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("event_exceptions_event_date").on(table.eventId, table.originalDate),
  ],
)
