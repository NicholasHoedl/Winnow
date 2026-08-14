import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import type { z } from "zod"

import { db } from "@/db"
import { todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { currentModel, generatePayload } from "@/modules/companion/ai-client"
import { aiReady } from "@/modules/companion/ai-settings"
import { getAiSettings } from "@/modules/preferences/queries"
import {
  describeAiFailure,
  type AiResult,
} from "@/modules/companion/ai-request"
import { buildGoalContext } from "@/modules/companion/queries"
import { aiProposals } from "@/modules/companion/schema"
import {
  buildGoalPlanMessages,
  buildImportMessages,
  buildRoutineMessages,
  buildSummaryMessages,
  summaryReadiness,
} from "@/modules/companion/service"
import {
  generateSchema,
  goalPlanPayloadSchema,
  importPayloadSchema,
  routinePayloadSchema,
  summaryPayloadSchema,
} from "@/modules/companion/validation"
import { getCategories } from "@/modules/budget/queries"
import { formatCents } from "@/modules/budget/service"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getWeeklyReview } from "@/modules/review/queries"

/** Enough task titles to make a summary specific, few enough to stay a summary. */
const TASK_TITLE_CAP = 20

/**
 * Generate (or revise) a proposal. `POST /api/companion/generate`.
 *
 * **A route handler rather than a Server Action, which contradicts ADR-0005 — see
 * ADR-0012 for why.** In one line: a Server Action blocks the React transition it is
 * called from, and this call takes 5–60 seconds. ADR-0005 documented the 500ms version of
 * that problem for Open Food Facts; at a minute it stops being a UX wrinkle and becomes a
 * frozen page. A plain `fetch` from the client blocks nothing.
 *
 * The auth check ADR-0005 worried a second API surface would need is `requireUserId()`,
 * the same call every query and action in the app already makes.
 *
 * **It lives under `/api` since T13, and that changes who rejects an unauthenticated
 * request.** It used to sit at `/companion/generate`, inside the `(app)` segment, where
 * `proxy.ts` caught a request with no session and 307'd it to `/login` before this file
 * ran. That matcher excludes `/api` — deliberately, see `api/calendar/[token]` — so the
 * proxy no longer stands in front. Nothing is less protected: `requireUserId()` was always
 * the authoritative check and it still runs first. But it THROWS, and an uncaught throw in
 * a route handler is a 500, so it is caught below and answered as a 401. A 500 for "you
 * are signed out" is the kind of wrong signal that costs someone an afternoon.
 *
 * It moved because four pages will call it once T13 disperses the companion, and an
 * endpoint addressed by one page's route is a lie at that point.
 */
function bad(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status })
}

/** The stored payload of the proposal being refined, or undefined if there isn't one. */
async function loadPrevious<T>(
  userId: string,
  proposalId: string | undefined,
  instruction: string | undefined,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  if (!proposalId || !instruction) return undefined
  // Read from the database, not from the request: the client cannot ask the provider to
  // chew on arbitrary content it invented.
  const existing = await db.query.aiProposals.findFirst({
    where: and(
      eq(aiProposals.id, proposalId),
      eq(aiProposals.userId, userId),
      eq(aiProposals.status, "pending"),
    ),
  })
  const parsed = schema.safeParse(existing?.payload)
  return parsed.success ? parsed.data : undefined
}

export async function POST(request: Request): Promise<Response> {
  // Answered as JSON with `ok: false`, because that is the only shape the client reads —
  // it parses the body and never looks at `response.ok`, so a 401 surfaces as a toast
  // rather than as a thrown parse.
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return bad("You're signed out — sign in and try again.", 401)
  }

  // Belt and braces: the page is not rendered when the companion is off, but a route
  // handler is reachable regardless of what the UI chose to show.
  // Settings, not environment (T11) — so this is a read, not a constant.
  if (!aiReady(await getAiSettings()))
    return bad(describeAiFailure({ kind: "disabled" }), 503)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return bad("Malformed request.", 400)
  }

  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) return bad("Malformed request.", 400)
  const input = parsed.data

  let result: AiResult<unknown>
  let targetId: string | null = null

  if (input.kind === "goal_plan") {
    const { timeZone } = await getUserPreferences()
    const context = await buildGoalContext(
      input.goalId,
      todayInZone(new Date(), timeZone),
    )
    if (!context) return bad("That goal no longer exists.", 404)

    const previous = await loadPrevious(
      userId,
      input.proposalId,
      input.instruction,
      goalPlanPayloadSchema,
    )
    targetId = input.goalId
    result = await generatePayload(
      goalPlanPayloadSchema,
      buildGoalPlanMessages(context, input.instruction, previous),
    )
  } else if (input.kind === "routine") {
    // A routine is designed from a description, so nothing of the user's data is sent —
    // the least sensitive prompt in the app, and `targetId` stays null because there is
    // nothing existing for it to point at.
    const previous = await loadPrevious(
      userId,
      input.proposalId,
      input.instruction,
      routinePayloadSchema,
    )
    result = await generatePayload(
      routinePayloadSchema,
      buildRoutineMessages(input.brief, input.instruction, previous),
    )
  } else if (input.kind === "import") {
    // Names only — the model picks from them and `resolveCategory` turns its answer back
    // into an id at apply time. Sending ids would invite it to invent one.
    const categories = await getCategories()
    const previous = await loadPrevious(
      userId,
      input.proposalId,
      input.instruction,
      importPayloadSchema,
    )
    result = await generatePayload(
      importPayloadSchema,
      buildImportMessages(
        input.text,
        categories.map((c) => c.name),
        input.instruction,
        previous,
      ),
    )
  } else {
    const { review, currency } = await getWeeklyReview(input.weekOf)

    // The app decides whether the week is worth narrating, BEFORE spending a call. A
    // model handed three data points writes a confident paragraph about your habits and
    // never volunteers that there wasn't much there — so the refusal has to happen here.
    const readiness = summaryReadiness({
      tasksCompleted: review.tasks.completed,
      daysLogged: review.macros.daysLogged,
      moneyMoved: review.money.expenseCents > 0 || review.money.incomeCents > 0,
      goalMovement: review.milestones.length + review.goalTasks.length,
    })
    if (!readiness.ready) return bad(readiness.reason, 422)

    const previous = await loadPrevious(
      userId,
      input.proposalId,
      input.instruction,
      summaryPayloadSchema,
    )
    result = await generatePayload(
      summaryPayloadSchema,
      buildSummaryMessages(
        {
          weekStart: review.weekStart,
          weekEnd: review.weekEnd,
          tasksCompleted: review.tasks.completed,
          busiestDay: review.tasks.busiestDay,
          // Capped so a busy week does not send fifty titles. The overflow count keeps
          // the model from treating the visible ones as the whole story.
          taskTitles: review.tasks.items
            .slice(0, TASK_TITLE_CAP)
            .map((t) => t.title),
          taskOverflow: Math.max(0, review.tasks.items.length - TASK_TITLE_CAP),
          daysLogged: review.macros.daysLogged,
          daysWithTarget: review.macros.daysWithTarget,
          daysOnTarget: review.macros.daysOnTarget,
          // Formatted here, by the app, using the same helper the UI uses. The model
          // never sees integer cents and is never asked to divide by a hundred.
          spent: formatCents(review.money.expenseCents, currency),
          earned: formatCents(review.money.incomeCents, currency),
          goalMovement: [
            ...review.milestones.map((m) => `${m.title} · ${m.goalTitle}`),
            ...review.goalTasks.map((t) => `${t.title} · ${t.goalTitle}`),
          ],
        },
        input.instruction,
        previous,
      ),
    )
  }

  if (!result.ok) return bad(describeAiFailure(result.failure), 502)

  // A refinement replaces the pending proposal in place rather than starting a chain.
  // Nothing asks to see what a revision came from, and a `parentId` nobody reads is the
  // same anti-pattern as a column with no writer.
  if (input.proposalId && input.instruction) {
    const [updated] = await db
      .update(aiProposals)
      .set({ payload: result.data, model: await currentModel() })
      .where(
        and(
          eq(aiProposals.id, input.proposalId),
          eq(aiProposals.userId, userId),
          eq(aiProposals.status, "pending"),
        ),
      )
      .returning()
    if (updated) return NextResponse.json({ ok: true, proposal: updated })
  }

  const [created] = await db
    .insert(aiProposals)
    .values({
      userId,
      kind: input.kind,
      targetId,
      payload: result.data,
      model: await currentModel(),
    })
    .returning()

  return NextResponse.json({ ok: true, proposal: created })
}
