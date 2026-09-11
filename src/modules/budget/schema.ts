import {
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

// Relative import (not "@/db/schema") so drizzle-kit resolves it without aliases.
import { users } from "../../db/schema"

export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"])
export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
])

// Recurrence enums are declared per module (todos does the same) so budget doesn't
// depend on another module's schema. The shared date math lives in lib/recurrence.
export const transactionRecurrenceFreqEnum = pgEnum(
  "transaction_recurrence_freq",
  ["daily", "weekly", "monthly"],
)
export const transactionRecurrenceMonthlyModeEnum = pgEnum(
  "transaction_recurrence_monthly_mode",
  ["day_of_month", "nth_weekday"],
)

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: categoryKindEnum("kind").notNull(),
  /**
   * What the user keeps in this category, in their own words — "groceries and household
   * staples", "video games and trading cards". Read by the AI when it sorts a receipt's
   * lines (T33, ADR-0028): the names alone cannot say where a pack of cards goes, and the
   * categories are the user's to add, rename and merge, so the note has to live beside
   * the name. Nullable: most categories explain themselves.
   */
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// A recurring bill or income: the transaction template plus its schedule. Instances are
// materialized into `transactions` as real rows once their date arrives — they're facts
// about money, so unlike recurring tasks they are never deleted or rewritten by the
// generator.
export const transactionRecurrences = pgTable(
  "transaction_recurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // set null, NOT cascade: deleting a category must not silently delete the rent rule.
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    // Cents, never a major amount — a rule storing dollars would silently re-price
    // itself if the currency preference changed.
    amountCents: integer("amount_cents").notNull(),
    type: transactionTypeEnum("type").notNull(),
    payee: text("payee"),
    description: text("description"),
    // Schedule. `flexible` is deliberately absent: "sometime this week" is meaningful
    // for a chore, not for a payment. A toRule() adapter supplies false.
    freq: transactionRecurrenceFreqEnum("freq").notNull(),
    recurrenceInterval: integer("recurrence_interval").notNull().default(1),
    weekdays: integer("weekdays").notNull().default(0),
    monthlyMode: transactionRecurrenceMonthlyModeEnum("monthly_mode")
      .notNull()
      .default("day_of_month"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    // High-water mark: everything up to and including this date has been posted.
    // Catch-up reads it, inserts, then advances it — so materialization is monotonic
    // and re-deleting a posted transaction never resurrects it.
    postedThrough: date("posted_through", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("transaction_recurrences_user").on(table.userId)],
)

// All money is stored as integer cents. `type` is stored explicitly so a
// transaction's direction never depends on how its category is configured.
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    type: transactionTypeEnum("type").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    // Who the money went to / came from. Separate from `description` so it can be
    // the row's headline and a search target in its own right.
    payee: text("payee"),
    description: text("description"),
    // The rule that posted this row, if any. set null: cancelling a subscription
    // must leave every payment already made intact, just detached.
    seriesId: uuid("series_id").references(() => transactionRecurrences.id, {
      onDelete: "set null",
    }),
    // Cycle key of a posted instance; null for one-off transactions.
    occurrenceDate: date("occurrence_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Every read is "this user, this date range" — month views, multi-month trends,
    // filtered lists.
    index("transactions_user_date").on(table.userId, table.date),
    // One posted row per (rule, cycle). NULLs are DISTINCT in PG, so one-off
    // transactions never collide; this makes catch-up idempotent under concurrency.
    unique("transactions_series_occurrence").on(
      table.seriesId,
      table.occurrenceDate,
    ),
  ],
)

// One budget per category per month (period_month = first-of-month date).
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    periodMonth: date("period_month", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("budgets_user_category_month").on(
      table.userId,
      table.categoryId,
      table.periodMonth,
    ),
    index("budgets_user_period").on(table.userId, table.periodMonth),
  ],
)

// The total for a month, as ONE figure — for the person whose rent and utilities are what
// they are and who wants a ceiling on the rest, not a limit per category. Effective-dated
// like `macro_targets` (the note there says why there is no `effective_to`): the row in
// effect for month M is the latest with `effective_from <= M`, so it is set once and
// stands until it is changed, and a change starts a new row from its month while every
// earlier month keeps the figure it was measured against.
//
// A 0 is "no total from this month on". That is the app's idiom for an unset budget
// everywhere (`budgetedCents > 0`), and it is what lets the total be cleared from March
// without January's row going with it. Not a nullable `category_id` on `budgets`: NULLs
// are distinct in a unique key, and a per-month row cannot stand for the months after it.
export const monthlyBudgets = pgTable(
  "monthly_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // The unique doubles as the index the "latest not after M" lookup needs.
  (table) => [
    unique("monthly_budgets_user_effective").on(
      table.userId,
      table.effectiveFrom,
    ),
  ],
)
