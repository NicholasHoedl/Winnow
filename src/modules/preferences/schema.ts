import {
  boolean,
  integer,
  jsonb,
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

  /**
   * Which way round a date reads: `mdy` → "Aug 17, 2026", `dmy` → "17 Aug 2026".
   *
   * Currency has been configurable since T0 and dates never were — `"en-US"` was hardcoded
   * at 22 call sites — so an account could be set to GBP in Europe/London and still read
   * American dates. This closes that, and nothing else: it is a FORMAT, not a locale.
   * Month names stay English, because a real locale picker means translated month names,
   * translated weekday headers in the calendar grid, and a list of locales to maintain —
   * a different job with a different scope.
   *
   * Two values rather than three. An ISO option was considered and dropped: nearly every
   * date in this app is rendered with `month: "short"`, where `en-CA` and `en-US` produce
   * identical output, so it would have been a setting that visibly did nothing on all but a
   * couple of screens.
   *
   * **Defaults to `mdy`, which is exactly the behaviour before this column existed.** That
   * is what makes the 22-file sweep provably behaviour-preserving — the e2e suite asserts on
   * rendered date strings, so a green run is the proof that none of them moved.
   */
  dateFormat: text("date_format").notNull().default("mdy"),

  /**
   * Units for the two figures that carry one.
   *
   * `body_weights.weight_lb` and `water_logs.amount_fl_oz` bake the unit into the COLUMN
   * name, so the stored figure is always pounds and always fluid ounces. These convert at
   * the display layer rather than migrating the data — a stored unit that changes meaning
   * when a preference flips is how a weight history silently becomes wrong.
   */
  weightUnit: text("weight_unit").notNull().default("lb"),
  volumeUnit: text("volume_unit").notNull().default("floz"),

  /**
   * Which view the dashboard's calendar card opens on.
   *
   * The third time this pattern has appeared — `defaultCalendarView` for `/calendar` (T14)
   * and `dashboardCollapsed` for which cards are folded (T17). The card's month/week toggle
   * lives in the URL so the server renders the right one with no flash; this is what the URL
   * falls back to.
   */
  dashboardCalendarView: text("dashboard_calendar_view")
    .notNull()
    .default("month"),

  /**
   * Where signing in lands you.
   *
   * A path, validated against the nav on the way in, so a route that is later deleted cannot
   * strand the account on a 404 — the same degrade-quietly reasoning `parseCollapsedCards`
   * uses for a card key that no longer exists.
   */
  landingPage: text("landing_page").notNull().default("/"),

  /**
   * Which meal the quick-add files an entry under. Null means Other, which is what every
   * quick-added entry has always been — so null is both the default and a real choice.
   */
  defaultMealType: text("default_meal_type"),
  // Pre-selected priority when creating a new task.
  defaultTaskPriority: priorityEnum("default_task_priority")
    .notNull()
    .default("medium"),
  // Show the once-a-day digest banner on the first load of a new local day (T2).
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  /**
   * How many days of no movement before a goal reads as stalled — and the same window
   * the "moved N times" count is taken over.
   *
   * Deliberately ONE number doing both jobs. Two (a count window and a longer stall
   * threshold) would be more expressive and considerably harder to reason about later,
   * and the whole point of the reading is that you can trust it at a glance.
   */
  goalMomentumDays: integer("goal_momentum_days").notNull().default(14),
  // "light" | "dark" | "system" — next-themes' own vocabulary, stored as text so the
  // set can change without a migration. Validated by Zod on the way in.
  theme: text("theme").notNull().default("system"),

  /**
   * Whether saving macro targets derives carbs from the other three so the grams account
   * for the calories (`calories = 4·protein + 4·carbs + 9·fat`).
   *
   * A preference rather than a column on `macro_targets`, because it governs how a target
   * is AUTHORED, not what a stored target means. Rows written before it existed, restored
   * by undo, or brought in by an account import are all left exactly as they are — see
   * `setMacroTargets`, which is the only place the rule applies.
   *
   * Defaults ON: it was asked for as "automatically enforce, with the option to disable".
   * It stays inert for anyone who leaves a macro at 0, which this app reads as untracked,
   * so it cannot quietly take over a partial target.
   */
  balanceMacroTargets: boolean("balance_macro_targets").notNull().default(true),

  /**
   * Which view `/calendar` opens on when the URL does not say.
   *
   * Stored as text and narrowed by Zod, the same as `theme` above — the set of views is a
   * UI concern that should be able to grow without a migration. An explicit `?view=` still
   * wins, so every existing link keeps working.
   */
  defaultCalendarView: text("default_calendar_view").notNull().default("month"),

  /**
   * How far ahead the dashboard's Slate reaches for HIGHLIGHTED events.
   *
   * Only highlighted ones. Today and tomorrow show everything regardless, so no setting of
   * this can hide a row you can see now — it only decides how early a flagged event starts
   * appearing. Widen it and the card grows a day band per flagged event; narrow it and they
   * arrive later.
   */
  slateHorizonDays: integer("slate_horizon_days").notNull().default(7),

  /**
   * Which dashboard cards are folded to their header.
   *
   * ONE column holding a list, not a boolean per card, and that is a deliberate break from
   * the shape of every other preference here. The dashboard's card set churns: T13 deleted
   * three cards, T15 merged two into one, T16 merged three more into one. A
   * `slate_collapsed` / `goals_collapsed` scheme means a migration every time that happens
   * and a dead column left behind on every deletion. A list costs nothing when a card is
   * added and degrades silently when one is removed — `preferencesFor` filters against
   * `DASHBOARD_CARDS`, so a key for a card that no longer exists simply stops matching.
   *
   * Collapsed is not hidden: the card keeps its header and one click brings it back. There
   * is deliberately no settings UI — the chevron on the card is the whole control.
   */
  dashboardCollapsed: jsonb("dashboard_collapsed")
    .$type<string[]>()
    .notNull()
    .default([]),

  /**
   * The AI companion's whole configuration (T11). Settings, not environment.
   *
   * These replaced `AI_*` env vars outright rather than layering over them: two sources
   * for one setting means a precedence rule, and a precedence rule means a settings page
   * that sometimes silently does nothing. One home, one answer.
   *
   * Defaults keep the feature OFF on a fresh install and after a restore, which is what
   * the env vars were doing before — ADR-0011's opt-in property survives the move.
   */
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  // "openai" | "anthropic" — two genuinely different wire protocols, not a dialect.
  // Text rather than an enum so a third can be added without a migration, narrowed by Zod.
  aiProvider: text("ai_provider").notNull().default("openai"),
  aiBaseUrl: text("ai_base_url").notNull().default(""),
  aiModel: text("ai_model").notNull().default(""),
  /**
   * **The one secret in this table.** Plaintext, deliberately: on a single-user box
   * whoever can read this row can generally read the machine, and encrypting it would add
   * an AUTH_SECRET-rotation failure mode that surfaces as a puzzling 401.
   *
   * Two rules it depends on, both enforced elsewhere and both easy to break by accident:
   *   1. `preferencesFor` lists its fields BY NAME and must never spread the row — that
   *      list is what keeps this column out of the client-side PreferencesProvider.
   *   2. `account/queries.ts` strips it from the JSON export, so a backup file cannot
   *      spend money.
   */
  aiApiKey: text("ai_api_key").notNull().default(""),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
