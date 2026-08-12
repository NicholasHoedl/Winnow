import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// Relative imports (not "@/db/schema") so drizzle-kit resolves them without aliases.
// routines → todos is acyclic in the SCHEMA layer: todos imports calendar + goals, and no
// schema file imports this one. `todos/queries.ts` does (T12f's sweep needs to read a
// routine's policy), and that is fine — a queries file is never imported by a schema.
//
// Note for anyone adding a link the other way: `tasks.routine_id` is deliberately declared
// WITHOUT `.references()` because this file imports `priorityEnum` below and reads it
// eagerly, so a reference back would make the pair circular. See HANDOFF §4.
import { users } from "../../db/schema"
import { lists, priorityEnum } from "../todos/schema"

/**
 * What becomes of a run's tasks that were never finished, once their due date is behind us.
 *
 * `keep` is the original behaviour and the default: the task goes overdue like any other,
 * because a task you did not do is a true thing about your day.
 *
 * `drop` is for the routines where that is noise rather than information — a morning
 * routine you half-finish most days accrues an overdue pile that means nothing except that
 * mornings are like that. It DELETES the row. Not hides, not completes: completing it would
 * claim you did something you did not and would inflate the weekly review, and hiding it
 * would grow an invisible heap the All filter slowly fills with.
 */
export const routineUnfinishedEnum = pgEnum("routine_unfinished", [
  "keep",
  "drop",
])

/**
 * A named set of tasks to spin up in one action — "Morning routine", "Trip prep".
 *
 * Deliberately NOT a recurrence. `task_recurrences` already covers "this happens every
 * Tuesday"; a routine is the other axis — several tasks at once, on demand, whenever the
 * occasion turns up. Running one twice is legitimate (two trips), so nothing here records
 * a run or guards against repeating one. The undo on the spin-up covers the misclick,
 * which is the case a guard would actually have been for.
 */
export const routines = pgTable("routines", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** See `routineUnfinishedEnum`. Defaulting to `keep` leaves every existing routine
   *  behaving exactly as it did — this option can only ever be opted INTO. */
  onUnfinished: routineUnfinishedEnum("on_unfinished")
    .notNull()
    .default("keep"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * One task template within a routine. Shaped like `subtasks` under a task and
 * `milestones` under a goal — a flat ordered child list, read with one extra findMany
 * grouped in memory rather than a per-row join.
 */
export const routineItems = pgTable(
  "routine_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    /**
     * Days from the run's anchor date to this task's due date.
     *
     * Null means "no due date at all", which is a different thing from 0 ("due the day
     * you run it") — so this is nullable rather than defaulted. Negative is allowed and
     * is the point of the column: "book the kennel" is 7 days BEFORE the trip, so a
     * "Trip prep" routine anchored on the departure date wants -7.
     */
    dueOffsetDays: integer("due_offset_days"),
    // Copied onto the generated task, same as `task_recurrences` copies its template.
    priority: priorityEnum("priority").notNull().default("medium"),
    listId: uuid("list_id").references(() => lists.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("routine_items_user_routine").on(table.userId, table.routineId),
  ],
)
