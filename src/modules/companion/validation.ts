import { z } from "zod"

import { isValidDateString } from "@/lib/date"

/**
 * What a generated goal plan is allowed to be.
 *
 * This schema does double duty: it is the JSON Schema handed to the provider's
 * structured-output mode, AND the gate every payload passes before it is stored or
 * applied. One definition governing both is the point — a model that ignores the schema
 * produces a validation failure rather than a surprise in the database.
 */

const planTitle = z.string().trim().min(1, "Title is required").max(200)

/**
 * `.meta()` reaches the JSON Schema handed to the provider; `.refine()` does not — a
 * refinement has no JSON Schema representation and is silently dropped by
 * `z.toJSONSchema`. So the description is how the model is told the format, and the
 * refinement is how we enforce it. Both are needed, and they are not redundant.
 */
const planDate = z
  .string()
  .refine((value) => isValidDateString(value), "Enter a valid date")
  .meta({ description: "A calendar date in YYYY-MM-DD form" })

export const goalPlanMilestoneSchema = z.object({
  title: planTitle,
  dueDate: planDate,
})

export const goalPlanTaskSchema = z.object({
  title: planTitle,
  /**
   * Which milestone this task belongs under, by position in the array above.
   *
   * An index rather than an id because nothing here exists yet — the milestones are
   * proposals too, and will not have ids until the moment they are applied.
   */
  milestoneIndex: z.number().int().min(0),
  dueDate: planDate,
})

/**
 * Bounds are load-bearing, not decoration. "Plan this goal" with no cap invites a model
 * to return sixty milestones, which is unreviewable, unappliable in one transaction, and
 * not a plan. A refusal here is visible and recoverable; a 200-row insert is neither.
 */
export const goalPlanPayloadSchema = z.object({
  milestones: z.array(goalPlanMilestoneSchema).min(1).max(12),
  tasks: z.array(goalPlanTaskSchema).max(50),
})
export type GoalPlanPayload = z.infer<typeof goalPlanPayloadSchema>

/**
 * A routine: a named set of tasks spun up in one action, each due some number of days
 * from whenever you run it.
 *
 * `dueOffsetDays` carries three distinct meanings and the model has to get them right:
 * **null** is "no due date at all", **0** is "due the day you run it", and **negative** is
 * before the anchor — a trip-prep routine books the kennel at -7. Nullable rather than
 * defaulted for exactly that reason; 0 and null are not the same answer.
 *
 * Bounded to a year each way, matching `routineItemInputSchema`, which is what will
 * validate these again on the way in.
 */
const OFFSET_LIMIT = 365

export const routineItemProposalSchema = z.object({
  title: planTitle,
  dueOffsetDays: z
    .number()
    .int()
    .min(-OFFSET_LIMIT)
    .max(OFFSET_LIMIT)
    .nullable()
    .meta({
      description:
        "Days from the run date: 0 = the day you run it, negative = before it, null = no due date",
    }),
  priority: z.enum(["low", "medium", "high"]),
})

export const routinePayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  items: z.array(routineItemProposalSchema).min(1).max(20),
})
export type RoutinePayload = z.infer<typeof routinePayloadSchema>

/**
 * A narrated week.
 *
 * Structured rather than one blob of prose, for two reasons: it renders as something you
 * can scan, and the shape is itself a length constraint — a model handed "write a summary"
 * writes an essay, and a weekly review nobody finishes reading is worse than no weekly
 * review.
 *
 * This is the only payload with **nothing to apply**. There is no `applyProposal` branch
 * for it, because a paragraph is not a row.
 */
export const summaryPayloadSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  observations: z.array(z.string().trim().min(1).max(400)).min(1).max(4),
})
export type SummaryPayload = z.infer<typeof summaryPayloadSchema>

/**
 * Transactions read out of pasted text — a bank export, a statement, a list of receipts.
 *
 * `amount` is a POSITIVE major-unit figure and `type` carries the sign, matching
 * `transactionInputSchema`. The model never emits integer cents: `createTransaction` does
 * that conversion with `amountToMinor`, which is tested, and asking a model to multiply
 * by a hundred is asking for an off-by-a-factor-of-ten in someone's ledger.
 *
 * `categoryName` is a name, not an id — the model is given the user's category names and
 * picks from them. `resolveCategory` turns it into an id at apply time, and anything it
 * cannot match lands uncategorised rather than guessing.
 */
export const importRowSchema = z.object({
  date: planDate,
  payee: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300),
  amount: z.number().min(0).max(20_000_000),
  type: z.enum(["income", "expense"]),
  categoryName: z.string().trim().max(100).nullable(),
})

export const importPayloadSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(100),
})
export type ImportPayload = z.infer<typeof importPayloadSchema>

/**
 * What the client asks the server to generate.
 *
 * A discriminated union on `kind`, so each job carries exactly the inputs it needs and no
 * others: a plan names a goal, a routine is described in words. A single flat shape with
 * everything optional would let a malformed request through to the prompt builder.
 *
 * `proposalId` + `instruction` mean "revise this", and are shared by both kinds — the
 * proposal being refined is loaded from the database and sent with the instruction so the
 * model edits rather than starts over.
 */
const refinement = {
  proposalId: z.string().uuid().optional(),
  instruction: z.string().trim().max(500).optional(),
}

export const generateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("goal_plan"),
    goalId: z.string().uuid(),
    ...refinement,
  }),
  z.object({
    kind: z.literal("routine"),
    /** What the routine is for, in the user's words: "a morning routine before work". */
    brief: z.string().trim().min(1).max(500),
    ...refinement,
  }),
  z.object({
    kind: z.literal("import"),
    /**
     * The pasted blob.
     *
     * This is the only job that sends the user's own financial detail to the provider —
     * every other prompt sends titles, descriptions or already-summed figures. It is the
     * point of the feature and the user pastes it deliberately, but the UI says so out
     * loud rather than leaving it to be discovered.
     */
    text: z.string().trim().min(1).max(20_000),
    ...refinement,
  }),
  z.object({
    kind: z.literal("summary"),
    /**
     * Any date inside the week to narrate — the same anchor `/review` takes from `?week=`.
     * Optional: absent means the current week.
     */
    weekOf: z
      .string()
      .refine((value) => isValidDateString(value), "Enter a valid date")
      .optional(),
    ...refinement,
  }),
])

/**
 * Applying sends the payload back, because the user has been editing it — pruning rows,
 * fixing titles and dates. Re-validating it here rather than trusting the stored copy is
 * what makes the inline editing safe: the same bounds apply to a hand-edited plan as to
 * a generated one.
 */
export const applyProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("goal_plan"),
    id: z.string().uuid(),
    payload: goalPlanPayloadSchema,
  }),
  z.object({
    kind: z.literal("routine"),
    id: z.string().uuid(),
    payload: routinePayloadSchema,
  }),
  z.object({
    kind: z.literal("import"),
    id: z.string().uuid(),
    payload: importPayloadSchema,
  }),
  // No `summary` arm, deliberately. A narrated week has nothing to create, so there is no
  // shape for Apply to take — the renderer offers Done, which just clears it from the
  // queue. Leaving the arm out means a client asking to "apply" a summary fails
  // validation rather than reaching a branch that would have to do nothing.
])
