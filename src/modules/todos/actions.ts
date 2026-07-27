"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { todayInZone } from "@/lib/date"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import { syncRuleInstances, type Task } from "./queries"
import { restorableTask } from "./restore"
import {
  lists,
  subtasks,
  taskRecurrenceExceptions,
  taskRecurrences,
  tasks,
} from "./schema"
import {
  daySchema,
  listInputSchema,
  restoreTaskSchema,
  subtaskInputSchema,
  taskInputSchema,
  taskRecurrenceSchema,
} from "./validation"

/**
 * The row id every single-item delete takes. A Server Action is a public RPC endpoint, so
 * `id: string` is a compile-time annotation and nothing more — anything can be posted. A
 * non-uuid reaches Postgres as a comparison against a `uuid` column and throws
 * `invalid input syntax for type uuid`, which surfaces as an error boundary instead of a
 * clean rejection. Ownership is enforced separately, by the userId in every where clause.
 */
const idSchema = z.string().uuid()

// Every surface that renders task data: the todos page, the two hubs, and — since a
// task can be linked to a goal (T2) — the goals page, which lists a goal's tasks.
function revalidateTaskViews(): void {
  revalidatePath("/todos")
  revalidatePath("/goals")
  revalidateHubs()
}

// --- Tasks ---

export async function createTask(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = taskInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, dueDate, priority, listId, goalId, eventId } =
    parsed.data
  await db.insert(tasks).values({
    userId,
    title,
    notes: nullify(notes),
    dueDate: nullify(dueDate),
    priority,
    listId: nullify(listId),
    goalId: nullify(goalId),
    eventId: nullify(eventId),
  })

  revalidateTaskViews()
  return { ok: true }
}

export async function updateTask(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = taskInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, dueDate, priority, listId, goalId, eventId } =
    parsed.data
  await db
    .update(tasks)
    .set({
      title,
      notes: nullify(notes),
      dueDate: nullify(dueDate),
      priority,
      listId: nullify(listId),
      goalId: nullify(goalId),
      eventId: nullify(eventId),
    })
    .where(and(eq(tasks.id, parsedId.data), eq(tasks.userId, userId)))

  revalidateTaskViews()
  return { ok: true }
}

export type DeleteTaskResult =
  { ok: true; task: Task | null } | { ok: false; error: string }

export async function deleteTask(id: unknown): Promise<DeleteTaskResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, parsed.data), eq(tasks.userId, userId)))
    .returning()
  revalidateTaskViews()
  return { ok: true, task: deleted ?? null }
}

/** Re-inserts a task removed via {@link deleteTask} (the "undo" path). The user
 * id is always taken from the session — any client-supplied one is ignored. */
export async function restoreTask(task: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreTaskSchema.safeParse(task)
  if (!parsed.success) return invalid(parsed.error)
  await db
    .insert(tasks)
    .values(restorableTask(parsed.data, userId))
    .onConflictDoNothing()
  revalidateTaskViews()
  return { ok: true }
}

export async function toggleTaskStatus(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, parsed.data), eq(tasks.userId, userId)),
    columns: { status: true },
  })
  if (!task) return { ok: false, error: "Task not found." }

  const nextStatus = task.status === "open" ? "done" : "open"
  await db
    .update(tasks)
    .set({
      status: nextStatus,
      completedAt: nextStatus === "done" ? new Date() : null,
    })
    .where(and(eq(tasks.id, parsed.data), eq(tasks.userId, userId)))

  revalidateTaskViews()
  return { ok: true }
}

// --- Recurring tasks ---

// The rule columns shared by create + update, from validated input.
function ruleColumns(d: z.infer<typeof taskRecurrenceSchema>) {
  return {
    title: d.title,
    notes: nullify(d.notes),
    priority: d.priority,
    listId: nullify(d.listId),
    freq: d.freq,
    recurrenceInterval: d.recurrenceInterval,
    weekdays: d.weekdays,
    monthlyMode: d.monthlyMode,
    flexible: d.flexible,
    startDate: d.startDate,
    endDate: nullify(d.endDate),
  }
}

export async function createTaskRecurrence(
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = taskRecurrenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const [rule] = await db
    .insert(taskRecurrences)
    .values({ userId, ...ruleColumns(parsed.data) })
    .returning()
  // Materialize the current instance immediately (revalidation would regenerate it too).
  const { timeZone, weekStartsOn } = await getUserPreferences()
  await syncRuleInstances(
    userId,
    rule,
    todayInZone(new Date(), timeZone),
    weekStartsOn,
  )

  revalidateTaskViews()
  return { ok: true }
}

export async function updateTaskRecurrence(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = taskRecurrenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const [rule] = await db
    .update(taskRecurrences)
    .set(ruleColumns(parsed.data))
    .where(
      and(
        eq(taskRecurrences.id, parsedId.data),
        eq(taskRecurrences.userId, userId),
      ),
    )
    .returning()
  if (!rule) return { ok: false, error: "Recurring task not found." }

  // Re-sync: move/retire the current instance and propagate the edited content onto it.
  const { timeZone, weekStartsOn } = await getUserPreferences()
  await syncRuleInstances(
    userId,
    rule,
    todayInZone(new Date(), timeZone),
    weekStartsOn,
    true,
  )

  revalidateTaskViews()
  return { ok: true }
}

export async function deleteTaskRecurrence(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  // Delete OPEN instances first (while the FK is set); deleting the rule then detaches
  // any COMPLETED instances into standalone history (series_id ON DELETE SET NULL).
  await db
    .delete(tasks)
    .where(
      and(
        eq(tasks.seriesId, parsed.data),
        eq(tasks.userId, userId),
        eq(tasks.status, "open"),
      ),
    )
  await db
    .delete(taskRecurrences)
    .where(
      and(
        eq(taskRecurrences.id, parsed.data),
        eq(taskRecurrences.userId, userId),
      ),
    )

  revalidateTaskViews()
  return { ok: true }
}

// --- Lists ---

export async function createList(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = listInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db.insert(lists).values({ userId, name: parsed.data.name })
  revalidatePath("/todos")
  return { ok: true }
}

export async function renameList(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = listInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(lists)
    .set({ name: parsed.data.name })
    .where(and(eq(lists.id, parsedId.data), eq(lists.userId, userId)))
  revalidatePath("/todos")
  return { ok: true }
}

export async function deleteList(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  // Tasks in this list have list_id set to NULL (FK onDelete: set null).
  await db
    .delete(lists)
    .where(and(eq(lists.id, parsed.data), eq(lists.userId, userId)))
  revalidatePath("/todos")
  return { ok: true }
}

// --- Skip one occurrence of a recurring task ---

/**
 * Skip the current cycle of a recurring task.
 *
 * Not a delete: the generator re-materializes an instance on every render of /todos,
 * /today, the dashboard and the digest, so removing the row alone would put it straight
 * back. The exception row is what suppresses the next insert; `syncRuleInstances` then
 * removes the open instance on the same pass.
 *
 * Ownership is checked against the RULE rather than trusted from the client, the way
 * budget's checkCategory does — otherwise a crafted call could write an exception row
 * pointing at someone else's series.
 */
export async function skipTaskOccurrence(
  ruleId: unknown,
  occurrenceDate: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedRule = idSchema.safeParse(ruleId)
  if (!parsedRule.success) return invalid(parsedRule.error)
  const parsedDate = daySchema.safeParse(occurrenceDate)
  if (!parsedDate.success) return invalid(parsedDate.error)

  const rule = await db.query.taskRecurrences.findFirst({
    where: and(
      eq(taskRecurrences.id, parsedRule.data),
      eq(taskRecurrences.userId, userId),
    ),
    columns: { id: true },
  })
  if (!rule) return { ok: false, error: "Recurring task not found." }

  await db
    .insert(taskRecurrenceExceptions)
    .values({
      userId,
      ruleId: parsedRule.data,
      occurrenceDate: parsedDate.data,
    })
    // Skipping twice is not an error — the unique key makes it idempotent.
    .onConflictDoNothing({
      target: [
        taskRecurrenceExceptions.ruleId,
        taskRecurrenceExceptions.occurrenceDate,
      ],
    })

  // Drop the open instance now rather than waiting for the next read, so the row leaves
  // the list immediately after the revalidation below.
  await db
    .delete(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.seriesId, parsedRule.data),
        eq(tasks.occurrenceDate, parsedDate.data),
        eq(tasks.status, "open"),
      ),
    )

  revalidateTaskViews()
  return { ok: true }
}

/** Undo for {@link skipTaskOccurrence} — the generator re-creates the instance on read. */
export async function clearTaskRecurrenceException(
  ruleId: unknown,
  occurrenceDate: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedRule = idSchema.safeParse(ruleId)
  if (!parsedRule.success) return invalid(parsedRule.error)
  const parsedDate = daySchema.safeParse(occurrenceDate)
  if (!parsedDate.success) return invalid(parsedDate.error)

  await db
    .delete(taskRecurrenceExceptions)
    .where(
      and(
        eq(taskRecurrenceExceptions.userId, userId),
        eq(taskRecurrenceExceptions.ruleId, parsedRule.data),
        eq(taskRecurrenceExceptions.occurrenceDate, parsedDate.data),
      ),
    )

  revalidateTaskViews()
  return { ok: true }
}

// --- Manual ordering ---

/**
 * Write a section's task order in one transaction.
 *
 * Takes the FULL ordered id list for the section rather than a (id, newIndex) pair: the
 * client already knows the resulting order, and rewriting it wholesale means the stored
 * positions can never drift out of step with what was on screen. Sparse or fractional
 * indices would avoid rewriting neighbours, but a single user's section is small enough
 * that the simplicity is worth more than the writes. Same call `setBudgets` made in T3-S2.
 *
 * Every id is checked to belong to the caller BEFORE anything is written — otherwise a
 * crafted call could reposition someone else's rows, since sortOrder alone says nothing
 * about ownership.
 */
export async function reorderTasks(ids: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = z.array(z.string().uuid()).max(500).safeParse(ids)
  if (!parsed.success) return invalid(parsed.error)
  if (parsed.data.length === 0) return { ok: true }

  if (new Set(parsed.data).size !== parsed.data.length) {
    return { ok: false, error: "The same task appears twice." }
  }

  const owned = await db.query.tasks.findMany({
    where: and(eq(tasks.userId, userId), inArray(tasks.id, parsed.data)),
    columns: { id: true },
  })
  if (owned.length !== parsed.data.length) {
    return { ok: false, error: "Unknown task." }
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of parsed.data.entries()) {
      await tx
        .update(tasks)
        .set({ sortOrder: index })
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    }
  })

  revalidateTaskViews()
  return { ok: true }
}

// --- Subtasks ---

/**
 * Ownership is checked against the PARENT task, not trusted from the client — the same
 * treatment `checkCategory` gives a client-supplied category id in the budget module.
 * Without it a subtask could be filed under someone else's task while still carrying your
 * user id, which would render nowhere and count nowhere.
 */
async function ownsTask(userId: string, taskId: string): Promise<boolean> {
  const row = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: { id: true },
  })
  return row !== undefined
}

export async function addSubtask(
  taskId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(taskId)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = subtaskInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  if (!(await ownsTask(userId, parsedId.data))) {
    return { ok: false, error: "Task not found." }
  }

  // Append. `milestones.sort_order` sat unwritten for four tranches because addMilestone
  // never set it (fixed in T5a-S1) — not repeating that here.
  const [last] = await db
    .select({ sortOrder: subtasks.sortOrder })
    .from(subtasks)
    .where(and(eq(subtasks.userId, userId), eq(subtasks.taskId, parsedId.data)))
    .orderBy(desc(subtasks.sortOrder))
    .limit(1)

  await db.insert(subtasks).values({
    userId,
    taskId: parsedId.data,
    title: parsed.data.title,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  })
  revalidateTaskViews()
  return { ok: true }
}

export async function toggleSubtask(
  id: unknown,
  done: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsedDone = z.boolean().safeParse(done)
  if (!parsedDone.success) return invalid(parsedDone.error)

  await db
    .update(subtasks)
    .set({ done: parsedDone.data })
    .where(and(eq(subtasks.id, parsedId.data), eq(subtasks.userId, userId)))
  revalidateTaskViews()
  return { ok: true }
}

export async function deleteSubtask(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .delete(subtasks)
    .where(and(eq(subtasks.id, parsed.data), eq(subtasks.userId, userId)))
  revalidateTaskViews()
  return { ok: true }
}
