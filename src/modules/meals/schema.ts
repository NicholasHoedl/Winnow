import {
  date,
  index,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

// Relative import (not "@/db/schema") so drizzle-kit resolves it without aliases.
import { users } from "../../db/schema"

export const mealTypeEnum = pgEnum("meal_type", [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
])

/**
 * Micronutrients, shared by `foods` and `meal_entries` so the two can't drift — a
 * meal entry snapshots them exactly like it snapshots the macros.
 *
 * These are NULLABLE, unlike the macros' NOT NULL DEFAULT 0, and the difference is
 * deliberate. All four macros are on screen whenever a food is entered by hand, so a
 * 0 there means "I typed zero". For micros "unknown" is the *normal* state: every food
 * already in the library predates these columns, and Open Food Facts products routinely
 * carry fiber but not saturated fat. Defaulting to 0 would report "412 mg sodium" for a
 * day where three of eight entries simply have no data — precise-looking and wrong.
 */
function microColumns() {
  return {
    fiberG: real("fiber_g"),
    sugarG: real("sugar_g"),
    satFatG: real("sat_fat_g"),
    // Milligrams, not grams: it's how packaging states it, and how OFF's grams are
    // converted on import (off-mapping.ts).
    sodiumMg: real("sodium_mg"),
  }
}

// Reusable food library. Macros are `real` (float) — nutrition doesn't need the
// integer-cents precision money does, and floats sum cleanly as JS numbers.
export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    servingLabel: text("serving_label").notNull(),
    calories: real("calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    ...microColumns(),
    // Set when a food was imported from Open Food Facts, so a later scan of the same
    // product can find it in the library instead of importing a duplicate.
    barcode: text("barcode"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The library is read in full on every /meals render, ordered by name.
    index("foods_user_name").on(t.userId, t.name),
    // Deliberately NOT unique. A unique constraint would change what restoreFood's
    // `onConflictDoNothing` silently swallows — undo would start no-op'ing whenever the
    // barcode collided rather than the id. Duplicates are deduped in the action instead.
    index("foods_user_barcode").on(t.userId, t.barcode),
  ],
)

// A logged item. Per-serving macros are SNAPSHOTTED from the food at log time so
// a food edited/deleted later never rewrites or breaks past days. `food_id` is a
// nullable reference kept only for "re-log this" convenience.
export const mealEntries = pgTable(
  "meal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    foodId: uuid("food_id").references(() => foods.id, {
      onDelete: "set null",
    }),
    date: date("date", { mode: "string" }).notNull(),
    mealType: mealTypeEnum("meal_type"),
    servings: real("servings").notNull().default(1),
    // snapshot
    name: text("name").notNull(),
    servingLabel: text("serving_label").notNull(),
    calories: real("calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    // Snapshotted too — otherwise editing a food's sodium would rewrite history for
    // micros while leaving the macros correct, which is worse than not having them.
    ...microColumns(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The module's hot path: one day's entries, on /meals and /.
    index("meal_entries_user_date").on(t.userId, t.date),
    // getRecentEntries scans newest-first across every date to build the quick picks.
    index("meal_entries_user_created").on(t.userId, t.createdAt),
  ],
)

/**
 * Water, ONE ROW PER LOG. Water is accumulated in +8/+16 taps through the day, so an
 * append-only log makes "+8 oz" a plain insert and undo a plain delete — both already
 * idiomatic here. A per-day running total would need a read-modify-write (racy against
 * a double tap) and an undo that remembers a delta.
 *
 * Contrast with body_weights directly below: the opposite shape, for the opposite reason.
 *
 * Fluid ounces, in the column name. Same idiom as amount_cents and protein_g — the unit
 * is part of the schema rather than a convention someone has to remember.
 */
export const waterLogs = pgTable(
  "water_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    amountFlOz: real("amount_fl_oz").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("water_logs_user_date").on(t.userId, t.date)],
)

/**
 * Body weight, ONE ROW PER DAY. Weight is measured once, so the unique makes the action
 * a clean upsert, makes a typo an edit rather than a second data point, and keeps the
 * trend chart's x-axis unambiguous.
 *
 * The unique constraint provides the index the day lookup needs — no separate index().
 */
export const bodyWeights = pgTable(
  "body_weights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    weightLb: real("weight_lb").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("body_weights_user_date").on(t.userId, t.date)],
)

/**
 * Effective-dated macro targets: one row per period, keyed by the day it starts on.
 * The row in effect on day D is the latest one with `effective_from <= D`.
 *
 * There is deliberately no `effective_to`. A closed interval needs two writes for every
 * change and can develop gaps or overlaps that no constraint catches, whereas
 * "greatest start not after D" is a single indexed lookup and the unique below makes it
 * unambiguous. Same shape as `budgets`' (user, category, period_month) key.
 *
 * Replaced a single row per user: changing a target used to silently re-score every day
 * already logged, which made the trends this tranche adds meaningless.
 */
export const macroTargets = pgTable(
  "macro_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    calories: real("calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // The unique provides the btree index the lookup needs — a separate index() on the
  // same columns would just be a duplicate.
  (t) => [unique("macro_targets_user_effective").on(t.userId, t.effectiveFrom)],
)
