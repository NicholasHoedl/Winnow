// Pure companion logic: what gets sent, and what the app checks about what comes back.
// No DB, no framework — unit-testable directly.

import { dayDiff } from "@/lib/date"

import type { GoalPlanPayload, RoutinePayload } from "./validation"

/**
 * Everything the model is told about a goal.
 *
 * **This type is the journal boundary from ADR-0011, expressed in code.** Prompt payloads
 * are built by naming fields, never by spreading a row — `...goal` here would ship
 * whatever columns the goals table grows next, and the same careless habit one module
 * over would ship a journal entry. Every field below is a deliberate decision to send it.
 *
 * `notes` is the goal's own description ("read 30 minutes daily, no manga"), NOT the notes
 * module. That distinction matters and the word is unfortunately overloaded: `notes` the
 * table is off-limits to this feature entirely, forever.
 */
export type GoalPromptContext = {
  title: string
  notes: string | null
  targetDate: string | null
  /** Titles only — enough to avoid proposing what already exists. */
  existingMilestones: string[]
  /** Today, as a local wall date, so the model has an anchor for "in three months". */
  today: string
}

export type ChatMessage = { role: "system" | "user"; content: string }

const SYSTEM_PROMPT = [
  "You break a long-term goal into milestones and the tasks that reach them.",
  "Milestones are checkpoints worth celebrating; tasks are single sessions of work.",
  "Every date must be a real calendar date in YYYY-MM-DD form.",
  "Space milestones evenly across the available time rather than bunching them.",
  "Do not restate a milestone the user already has.",
  "Prefer few, meaningful items over many trivial ones.",
].join(" ")

/**
 * Build the request. Named fields only — see `GoalPromptContext`.
 *
 * Returns messages rather than a string so the caller does not have to know the provider's
 * shape, and so the test can assert on exactly what would be transmitted.
 */
export function buildGoalPlanMessages(
  goal: GoalPromptContext,
  instruction?: string,
  previous?: GoalPlanPayload,
): ChatMessage[] {
  const lines = [
    `Goal: ${goal.title}`,
    `Today is ${goal.today}.`,
    goal.targetDate
      ? `Target date: ${goal.targetDate}.`
      : "No target date has been set; plan over a sensible horizon and say so with the dates.",
  ]
  if (goal.notes) lines.push(`The user describes it as: ${goal.notes}`)
  if (goal.existingMilestones.length > 0) {
    lines.push(
      `Milestones that already exist: ${goal.existingMilestones.join("; ")}`,
    )
  }

  // Refinement sends the plan being revised, not a conversation. One proposal plus one
  // instruction is bounded; a transcript is not, and nothing here needs one.
  if (previous && instruction) {
    lines.push(
      `Revise this existing plan rather than starting over: ${JSON.stringify(previous)}`,
      `The change requested: ${instruction}`,
    )
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ]
}

/**
 * Something the app noticed about a proposed date. The model is never asked to
 * self-assess — it proposes dates, and this judges them, because a model asserting "this
 * fits comfortably before your deadline" would sometimes be wrong and there would be no
 * way to tell.
 */
export type PlanWarning = {
  /** Which list, and which position in it. */
  on: "milestone" | "task"
  index: number
  kind: "past" | "after-target" | "tight" | "out-of-order"
  message: string
}

/** Within this many days of the target counts as cutting it fine. */
const TIGHT_DAYS = 7

export function planWarnings(
  payload: GoalPlanPayload,
  goal: { targetDate: string | null },
  today: string,
): PlanWarning[] {
  const warnings: PlanWarning[] = []

  const check = (
    on: "milestone" | "task",
    index: number,
    dueDate: string,
  ): void => {
    if (dueDate < today) {
      warnings.push({
        on,
        index,
        kind: "past",
        message: "Dated in the past",
      })
      return
    }
    if (!goal.targetDate) return
    if (dueDate > goal.targetDate) {
      warnings.push({
        on,
        index,
        kind: "after-target",
        message: "After your target date",
      })
      return
    }
    const slack = dayDiff(dueDate, goal.targetDate)
    if (slack <= TIGHT_DAYS) {
      warnings.push({
        on,
        index,
        kind: "tight",
        message:
          slack === 0
            ? "On your target date"
            : `${slack} day${slack === 1 ? "" : "s"} before your target date`,
      })
    }
  }

  payload.milestones.forEach((m, i) => check("milestone", i, m.dueDate))
  payload.tasks.forEach((t, i) => check("task", i, t.dueDate))

  // Milestones are a sequence — one dated before the one it follows is the model having
  // lost track of its own ordering, and it reads as nonsense on the timeline.
  payload.milestones.forEach((milestone, i) => {
    if (i === 0) return
    if (milestone.dueDate < payload.milestones[i - 1].dueDate) {
      warnings.push({
        on: "milestone",
        index: i,
        kind: "out-of-order",
        message: "Dated before the milestone above it",
      })
    }
  })

  return warnings
}

/** What Apply will actually create, for the manifest footer. Counts what is included. */
export function planCounts(payload: GoalPlanPayload): {
  milestones: number
  tasks: number
} {
  return {
    milestones: payload.milestones.length,
    tasks: payload.tasks.length,
  }
}

/** Which rows the user has switched off, by position in their own list. */
export type Excluded = {
  milestones: ReadonlySet<number>
  tasks: ReadonlySet<number>
}

/**
 * Drop the excluded rows and renumber what is left.
 *
 * The renumbering is the whole reason this is a tested function rather than an inline
 * filter. `milestoneIndex` is a position in an array, so removing milestone 1 silently
 * repoints every task that named 2 at the wrong parent — the classic off-by-one that
 * looks right until the one case where it isn't.
 *
 * A task is dropped when it is switched off OR when its milestone is: keeping tasks under
 * a milestone you just rejected reads as a mistake, even though the data model would
 * tolerate it (tasks link to the goal, never to a milestone).
 */
export function finalizePlan(
  payload: GoalPlanPayload,
  excluded: Excluded,
): GoalPlanPayload {
  // Old position → new position, for the milestones that survived.
  const remap = new Map<number, number>()
  const milestones = payload.milestones.filter((_, i) => {
    if (excluded.milestones.has(i)) return false
    remap.set(i, remap.size)
    return true
  })

  const tasks = payload.tasks.flatMap((task, i) => {
    if (excluded.tasks.has(i)) return []
    const parent = remap.get(task.milestoneIndex)
    if (parent === undefined) return []
    return [{ ...task, milestoneIndex: parent }]
  })

  return { milestones, tasks }
}

// --- Routines (T9b) ---

const ROUTINE_SYSTEM_PROMPT = [
  "You design routines: a named set of tasks spun up together whenever an occasion comes round.",
  "A routine is NOT a schedule. It does not repeat on its own — the user runs it when they need it.",
  "Each task carries dueOffsetDays, measured from the day the routine is run.",
  "Use 0 for the day itself, a negative number for preparation beforehand, and null when a task has no deadline at all.",
  "Prefer a handful of real steps over an exhaustive checklist.",
].join(" ")

/**
 * Build the routine request from the user's brief.
 *
 * Nothing about the user's data is sent — a routine is designed from a description, not
 * from their history. That makes this the least sensitive prompt in the app, and it is
 * still built by naming fields for the same reason the goal one is (ADR-0011).
 */
export function buildRoutineMessages(
  brief: string,
  instruction?: string,
  previous?: RoutinePayload,
): ChatMessage[] {
  const lines = [`Design a routine for: ${brief}`]

  if (previous && instruction) {
    lines.push(
      `Revise this existing routine rather than starting over: ${JSON.stringify(previous)}`,
      `The change requested: ${instruction}`,
    )
  }

  return [
    { role: "system", content: ROUTINE_SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ]
}

/**
 * An offset as a person would say it.
 *
 * The three cases are genuinely different and the UI has to keep them apart: null is "no
 * due date", 0 is "the day you run it", and negative is preparation. Rendering a bare
 * "-7" would make the reader do the translation on every row, and rendering null as "0"
 * would silently invent a deadline.
 */
export function offsetLabel(days: number | null): string {
  if (days === null) return "No date"
  if (days === 0) return "On the day"
  const magnitude = Math.abs(days)
  const unit = magnitude === 1 ? "day" : "days"
  return days < 0 ? `${magnitude} ${unit} before` : `${magnitude} ${unit} after`
}

/** How long the routine spans, for the manifest footer. */
export function routineSpan(payload: RoutinePayload): string {
  const offsets = payload.items
    .map((item) => item.dueOffsetDays)
    .filter((value): value is number => value !== null)
  if (offsets.length === 0) return "no dates"
  const first = Math.min(...offsets)
  const last = Math.max(...offsets)
  if (first === last) return offsetLabel(first).toLowerCase()
  return `${offsetLabel(first).toLowerCase()} to ${offsetLabel(last).toLowerCase()}`
}

// --- Weekly summary (T9c) ---

/**
 * Everything the model is told about a week.
 *
 * Named fields, same as the goal context, and the same reason (ADR-0011). Two things are
 * specifically absent and must stay absent: **journal and note content**, which never
 * leaves the machine, and **individual transactions** — the money below is already
 * summed and formatted.
 *
 * `money` arrives as display strings rather than integer cents because the app has
 * already done that arithmetic with `formatCents`. Handing a model raw minor units and
 * a currency code is inviting it to divide by a hundred and be wrong about it.
 */
export type SummaryPromptContext = {
  weekStart: string
  weekEnd: string
  tasksCompleted: number
  busiestDay: string | null
  /** Up to a readable number of them; `taskOverflow` says how many were left out. */
  taskTitles: string[]
  taskOverflow: number
  daysLogged: number
  daysWithTarget: number
  daysOnTarget: number
  spent: string
  earned: string
  /** "Chapter one · Write the book" — a milestone or goal task with its goal. */
  goalMovement: string[]
}

const SUMMARY_SYSTEM_PROMPT = [
  "You write a short, factual review of someone's week from figures they already recorded.",
  "Every number you are given is already correct — restate them, never recompute or estimate.",
  "Say what actually happened and what it suggests. Do not congratulate, encourage, or moralise.",
  "If something is notably better or worse than the rest of the week, say which and why.",
  "Never invent detail that is not in the figures.",
].join(" ")

export function buildSummaryMessages(
  week: SummaryPromptContext,
  instruction?: string,
  previous?: { headline: string; observations: string[] },
): ChatMessage[] {
  const lines = [
    `Week of ${week.weekStart} to ${week.weekEnd}.`,
    `Tasks completed: ${week.tasksCompleted}${
      week.busiestDay ? `, busiest day ${week.busiestDay}` : ""
    }.`,
    `Meals logged on ${week.daysLogged} of 7 days; ${week.daysOnTarget} of ${week.daysWithTarget} days with a calorie target were met.`,
    `Money: ${week.spent} spent, ${week.earned} in.`,
  ]
  if (week.taskTitles.length > 0) {
    lines.push(
      `What was finished: ${week.taskTitles.join("; ")}${
        week.taskOverflow > 0 ? ` (and ${week.taskOverflow} more)` : ""
      }`,
    )
  }
  if (week.goalMovement.length > 0) {
    lines.push(`Progress toward goals: ${week.goalMovement.join("; ")}`)
  }

  if (previous && instruction) {
    lines.push(
      `Revise this existing summary rather than starting over: ${JSON.stringify(previous)}`,
      `The change requested: ${instruction}`,
    )
  }

  return [
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ]
}

/**
 * Whether a week has enough in it to be worth narrating.
 *
 * This exists because a language model will not say "there isn't much here". Given three
 * data points it writes a confident paragraph about your habits, and that paragraph is
 * indistinguishable in tone from one grounded in a full week. So the app decides, before
 * spending a paid call, and refuses locally with a reason.
 *
 * The bar is deliberately low — this is guarding against a near-empty week, not grading
 * one. Any single real signal is enough.
 */
export type SummaryReadiness =
  { ready: true } | { ready: false; reason: string }

/** Below this, "you completed 2 tasks" is the whole summary and prose adds nothing. */
const MIN_TASKS = 3
const MIN_LOGGED_DAYS = 3

export function summaryReadiness(week: {
  tasksCompleted: number
  daysLogged: number
  moneyMoved: boolean
  goalMovement: number
}): SummaryReadiness {
  if (
    week.tasksCompleted >= MIN_TASKS ||
    week.daysLogged >= MIN_LOGGED_DAYS ||
    week.moneyMoved ||
    week.goalMovement > 0
  ) {
    return { ready: true }
  }
  return {
    ready: false,
    reason:
      "There isn't enough in this week to summarise — the figures on /review already say all of it.",
  }
}

// --- Transaction import (T9d) ---

const IMPORT_SYSTEM_PROMPT = [
  "You read transactions out of pasted text: a bank export, a statement, a list of receipts.",
  "Extract only rows that are actually transactions. Ignore headers, totals, running balances and blank lines.",
  "Amounts are always POSITIVE; the type field carries the direction. Money leaving is an expense, money arriving is income.",
  "Dates must be real calendar dates in YYYY-MM-DD form; resolve any other format you are given.",
  "Choose categoryName only from the list you are given, matching the name exactly. Use null when none of them fit.",
  "Never invent a transaction that is not in the text.",
].join(" ")

export function buildImportMessages(
  text: string,
  categories: string[],
  instruction?: string,
  previous?: { rows: unknown[] },
): ChatMessage[] {
  const lines = [
    categories.length > 0
      ? `Categories you may choose from: ${categories.join("; ")}`
      : "The user has no categories yet; use null for every categoryName.",
    "Text to read:",
    text,
  ]

  if (previous && instruction) {
    lines.push(
      `Revise this existing extraction rather than starting over: ${JSON.stringify(previous)}`,
      `The change requested: ${instruction}`,
    )
  }

  return [
    { role: "system", content: IMPORT_SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ]
}

/**
 * Turn a category NAME the model chose into one of the user's category ids.
 *
 * Case- and space-insensitive, because a model handed "Groceries" will sometimes answer
 * "groceries" and that is not a disagreement worth losing a category over. Anything that
 * does not match returns null and the row lands uncategorised — a wrong category is
 * harder to notice than a missing one, so an unmatched guess is never coerced onto the
 * nearest thing.
 */
export function resolveCategory(
  name: string | null,
  categories: readonly { id: string; name: string }[],
): string | null {
  if (!name) return null
  const wanted = name.trim().toLowerCase()
  if (!wanted) return null
  return (
    categories.find((c) => c.name.trim().toLowerCase() === wanted)?.id ?? null
  )
}

/** How many rows will land without a category, for the manifest footer. */
export function uncategorisedCount(
  rows: readonly { categoryName: string | null }[],
  categories: readonly { id: string; name: string }[],
): number {
  return rows.filter(
    (row) => resolveCategory(row.categoryName, categories) === null,
  ).length
}
