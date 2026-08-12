"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import {
  invalid,
  type ActionFailure,
  type ActionResult,
} from "@/lib/action-result"
import { requireUserId } from "@/lib/session"
import { createTransaction } from "@/modules/budget/actions"
import { getCategories } from "@/modules/budget/queries"
import { addMilestone } from "@/modules/goals/actions"
import { createHabit } from "@/modules/habits/actions"
import { resolveCategory } from "./service"
import { goals } from "@/modules/goals/schema"
import { addRoutineItem, createRoutine } from "@/modules/routines/actions"
import { createTask } from "@/modules/todos/actions"

import { fetchModels } from "./ai-client"
import { describeAiFailure } from "./ai-request"
import { AI_PROVIDERS } from "./ai-settings"
import { aiProposals } from "./schema"
import { applyProposalSchema } from "./validation"
import { z } from "zod"

const idSchema = z.string().uuid("Invalid id")

/** What the Settings form is CONSIDERING, which may not be what is saved yet. */
const listModelsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z.string().trim().max(500),
})

function revalidateCompanion(): void {
  revalidatePath("/companion")
}

/**
 * Turn an approved proposal into real rows.
 *
 * The payload comes back from the client rather than being read from the stored row,
 * because the user has been editing it — pruning items, fixing titles and dates. It is
 * re-validated by the same schema that governed the generation, so a hand-edited plan
 * faces exactly the bounds a generated one does.
 *
 * Writes go through `addMilestone` and `createTask` rather than straight to the tables.
 * That is the whole propose-only guarantee cashed in: every Zod schema, every ownership
 * check (`checkTaskLinks` proves the goal is yours), every revalidation path runs exactly
 * as it does when you create these by hand. There is one code path for "a milestone was
 * created", not two.
 */
export async function applyProposal(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = applyProposalSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { id } = parsed.data

  const proposal = await db.query.aiProposals.findFirst({
    where: and(eq(aiProposals.id, id), eq(aiProposals.userId, userId)),
  })
  if (!proposal) return { ok: false, error: "Proposal not found." }
  if (proposal.status !== "pending") {
    return { ok: false, error: "That proposal has already been dealt with." }
  }
  // The client tells us which shape it is applying; the stored row says which shape it
  // actually is. Disagreeing means a stale tab, not a legitimate request.
  if (proposal.kind !== parsed.data.kind) {
    return { ok: false, error: "That proposal changed — reload and try again." }
  }

  // `targetId` is deliberately not a foreign key (see schema.ts), so a goal it names can
  // have been deleted since. Check rather than let the inserts fail halfway.
  if (parsed.data.kind === "goal_plan") {
    if (!proposal.targetId) {
      return { ok: false, error: "This proposal has no goal to apply to." }
    }
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, proposal.targetId), eq(goals.userId, userId)),
      columns: { id: true },
    })
    if (!goal) return { ok: false, error: "That goal no longer exists." }
  }

  // Claim it BEFORE writing anything. The updated row count is the lock: a second Apply
  // — a double click, or the same proposal open in two tabs — finds nothing pending and
  // stops here rather than creating every row twice. Applying is not transactional
  // across modules, so preventing a duplicate matters more than being able to roll back
  // a partial one.
  const claimed = await db
    .update(aiProposals)
    .set({ status: "applied", appliedAt: new Date() })
    .where(
      and(
        eq(aiProposals.id, id),
        eq(aiProposals.userId, userId),
        eq(aiProposals.status, "pending"),
      ),
    )
    .returning({ id: aiProposals.id })
  if (claimed.length === 0) {
    return { ok: false, error: "That proposal has already been dealt with." }
  }

  const failed = (title: string): ActionResult => {
    revalidateCompanion()
    return { ok: false, error: `Couldn't add “${title}”.` }
  }

  if (parsed.data.kind === "goal_plan") {
    const goalId = proposal.targetId!
    // Sequential, not parallel: `addMilestone` reads the current highest sortOrder to
    // append, so concurrent inserts would all read the same value and collapse the order.
    for (const milestone of parsed.data.payload.milestones) {
      const result = await addMilestone(goalId, {
        title: milestone.title,
        dueDate: milestone.dueDate,
      })
      if (!result.ok) return failed(milestone.title)
    }

    // The practice. Routed through `createHabit` for the same reason milestones go through
    // `addMilestone` — one code path for "a habit was created", including the ownership
    // check that proves this goal is the caller's.
    //
    // A habit generates no tasks and carries no dates (ADR-0014). Attaching it to the goal
    // is what makes logging it count toward that goal's momentum (T12b), which is the
    // reading that used to say Stalled on exactly this kind of work.
    for (const habit of parsed.data.payload.habits) {
      const result = await createHabit({
        title: habit.title,
        period: habit.period,
        targetCount: habit.targetCount,
        goalId,
      })
      if (!result.ok) return failed(habit.title)
    }

    // Setup tasks attach to the GOAL as well: `tasks` has `goalId` and no `milestoneId`, so
    // the grouping a plan shows is presentational and never survives into the data model.
    for (const task of parsed.data.payload.setupTasks) {
      const result = await createTask({
        title: task.title,
        dueDate: task.dueDate,
        goalId,
      })
      if (!result.ok) return failed(task.title)
    }
  } else if (parsed.data.kind === "routine") {
    // The routine has to exist before its items can point at it, which is why
    // `createRoutine` now returns the new id rather than just `ok`.
    const created = await createRoutine({
      name: parsed.data.payload.name,
      description: parsed.data.payload.description,
    })
    if (!created.ok) return failed(parsed.data.payload.name)

    for (const item of parsed.data.payload.items) {
      const result = await addRoutineItem(created.id, {
        title: item.title,
        dueOffsetDays: item.dueOffsetDays,
        priority: item.priority,
      })
      if (!result.ok) return failed(item.title)
    }
  } else {
    // Names back into ids. Read the categories here rather than trusting anything the
    // client sent: `resolveCategory` only ever returns an id that is already the
    // caller's, and `createTransaction` re-checks ownership and type anyway.
    const categories = await getCategories()

    for (const row of parsed.data.payload.rows) {
      const categoryId = resolveCategory(row.categoryName, categories)
      const result = await createTransaction({
        // `amount` is major units and positive; `type` carries the direction.
        // `createTransaction` converts to integer cents with `amountToMinor`, so the
        // model is never asked to multiply by a hundred.
        amount: row.amount,
        type: row.type,
        date: row.date,
        payee: row.payee,
        description: row.description,
        // A category the model named but the user does not have resolves to null, and
        // the row lands uncategorised rather than in the wrong place.
        categoryId: categoryId ?? "",
      })
      if (!result.ok) return failed(row.payee)
    }
  }

  revalidateCompanion()
  return { ok: true }
}

/** Reject a proposal. Kept rather than deleted, so the pending queue empties honestly. */
export async function discardProposal(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(aiProposals)
    .set({ status: "discarded" })
    .where(
      and(
        eq(aiProposals.id, parsed.data),
        eq(aiProposals.userId, userId),
        eq(aiProposals.status, "pending"),
      ),
    )

  revalidateCompanion()
  return { ok: true }
}

/**
 * What models the configured provider serves, for the Settings dropdown.
 *
 * A Server Action rather than a query the page awaits, because it is a NETWORK call the
 * user retries: awaiting it during render would make /settings unreachable whenever the
 * provider is slow, for a field that is one of six on the page.
 *
 * The API key never leaves the server — `fetchModels` reads it, sends it to the provider,
 * and returns only ids and labels. The failure comes back as a described string rather than
 * an `AiFailure`, so the client component needs no knowledge of the taxonomy and nothing
 * about the request shape crosses the boundary.
 */
export async function listAiModels(
  input: unknown,
): Promise<
  { ok: true; models: { id: string; label: string }[] } | ActionFailure
> {
  await requireUserId()
  const parsed = listModelsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const result = await fetchModels(parsed.data)
  if (!result.ok) {
    return { ok: false, error: describeAiFailure(result.failure) }
  }
  return { ok: true, models: result.data }
}
