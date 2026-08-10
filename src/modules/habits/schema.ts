import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// Relative imports (not "@/db/schema") so drizzle-kit resolves them without aliases.
// habits → goals is acyclic: goals imports only `users`, and nothing imports this.
import { users } from "../../db/schema"
import { goals } from "../goals/schema"

export const habitPeriodEnum = pgEnum("habit_period", ["day", "week", "month"])

/**
 * A habit: a rate you commit to. "Attend 3 classes a week", "20 new words a day".
 *
 * Deliberately NOT a `task_recurrence`, and the distinction is the whole reason this table
 * exists. A recurrence answers **which days** something falls on — it can say
 * Monday/Wednesday/Friday, and its `flexible` flag can say "once per period, any day". It
 * cannot say *three times, any three*, because its count is hard-wired at one. A habit
 * answers **how often**, which is the thing a person actually commits to.
 *
 * The consequence worth stating up front: a habit generates no tasks. It has no row in the
 * to-do list, nothing goes overdue, and "did you do it" is answered by counting rows in
 * `habit_entries` rather than by a checkbox. See ADR-0014.
 */
export const habits = pgTable("habits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /**
   * The goal this practice serves, if any.
   *
   * `set null`, not cascade: deleting a goal must not delete the practice that served it —
   * you gave up the target, not the running. The cost is that the habit silently loses its
   * attribution, which ADR-0014 records alongside the identical behaviour of
   * `tasks.series_id`.
   */
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  // No default, unlike almost every other enum here. The rate IS the commitment, so a row
  // that failed to state one is a bug — better a not-null violation than a silent "week".
  period: habitPeriodEnum("period").notNull(),
  targetCount: integer("target_count").notNull().default(1),
  /**
   * The measured variant: `unit` "words", `targetAmount` 20 — "20 new words a day" rather
   * than "one session a day".
   *
   * **Unread in T12a**, and deliberately kept out of `habitInputSchema` so that stays true
   * structurally rather than by good intentions: nothing can write a value that nothing
   * reads. They are here now because the alternative is a second migration later, and
   * because a primitive that can only count sessions is the same half-measure
   * `task_recurrences` already is.
   *
   * `real`, matching `goals.target_value` and the meals module — the app's existing answer
   * for a quantity that is legitimately fractional (5.5km, 1.5 hours).
   */
  unit: text("unit"),
  targetAmount: real("target_amount"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  // Inclusive. Null means open-ended, which is the normal case for a habit.
  endDate: date("end_date", { mode: "string" }),
  // Hidden from every read, but kept: a retired habit's history is still true, and
  // deleting it to stop seeing it would take the streak you earned with it.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * One completion. The log half of the primitive.
 *
 * **There is deliberately no unique constraint on (habit_id, on_date).** Two classes on
 * Tuesday is two rows, because it is two classes — and a quota of three a week is only
 * meaningful if the third can land on a day that already has one. This is the direct
 * opposite of `tasks.unique(series_id, occurrence_date)`, and the difference is exactly
 * what makes a log the right shape here and a materialized instance the wrong one.
 *
 * The price is that `+1` is not idempotent: a double-click writes two rows. There is no
 * schema fix that does not also break the legitimate case, so the mitigation lives in the
 * UI — the button is disabled in flight, and undo deletes the id the action returned.
 */
export const habitEntries = pgTable(
  "habit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    /**
     * The LOCAL day it happened, resolved server-side from the user's zone at log time.
     *
     * A date, not a timestamp, and that is the point: everything buckets on this column, so
     * it has to be the day the person would say it was. Deriving it later from a
     * `created_at` instant would push a 10pm session into tomorrow for anyone west of UTC.
     */
    onDate: date("on_date", { mode: "string" }).notNull(),
    // Null = "one session". Paired with `habits.target_amount`; unread in T12a.
    amount: real("amount"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("habit_entries_habit_date").on(table.habitId, table.onDate),
  ],
)
