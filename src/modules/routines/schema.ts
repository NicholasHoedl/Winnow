import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// Relative imports (not "@/db/schema") so drizzle-kit resolves them without aliases.
// routines → todos is acyclic: todos imports calendar + goals, and nothing imports this.
import { users } from "../../db/schema"
import { lists, priorityEnum } from "../todos/schema"

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
