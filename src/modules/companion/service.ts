// Pure companion logic: what gets sent, and what the app checks about what comes back.
// No DB, no framework — unit-testable directly.

import { dayDiff, dowOf } from "@/lib/date"

import type {
  GoalPlanPayload,
  RoutinePayload,
  SummaryPayload,
} from "./validation"

/**
 * Everything the model is told about a goal.
 *
 * **This type is ADR-0011's boundary expressed in code.** Prompt payloads are built by
 * naming fields, never by spreading a row — `...goal` here would ship whatever columns the
 * goals table grows next, to a third party, without anyone deciding to. Every field below
 * is a deliberate decision to send it.
 *
 * `notes` is the goal's own description ("read 30 minutes daily, no manga"), and it IS
 * sent: it is the only place the user says what the goal actually means, and a plan built
 * without it is a plan built from a title. It is also the most personal thing in this
 * payload, which is why it is listed here by name rather than arriving as a side effect.
 */
export type GoalPromptContext = {
  title: string
  notes: string | null
  targetDate: string | null
  /**
   * The goal's numeric target, when it has one — 5000 with unit "words".
   *
   * Sent so the model can answer with a habit in the SAME unit, which is the only case
   * `planWarnings` can check a rate against: `goals.unit` is documented as free text and
   * purely a display suffix, so nothing in this app converts between units and nothing
   * here should start. A goal measured by milestones alone leaves all three null.
   */
  targetValue: number | null
  currentValue: number | null
  unit: string | null
  /** Titles only — enough to avoid proposing what already exists. */
  existingMilestones: string[]
  /** Today, as a local wall date, so the model has an anchor for "in three months". */
  today: string
}

export type ChatMessage = { role: "system" | "user"; content: string }

/**
 * Rewritten in T12c, and the change is the whole point of the tranche.
 *
 * The old prompt asked for "milestones and the tasks that reach them". Given a schema where
 * every task needed a `dueDate`, the only well-formed answer was a list of appointments —
 * so it produced milestones in disguise ("Learn words 1-250") and commitments the user does
 * not control ("Drill mount and side control on Aug 31"). The model was answering the
 * question it was asked.
 *
 * The question is now: what do you do REPEATEDLY to get there. Dates survive only on
 * milestones, which are checkpoints, and on the handful of genuine one-offs that let the
 * practice start.
 */
const SYSTEM_PROMPT = [
  "You turn a long-term goal into a ladder of milestones and the recurring practice that climbs it.",
  "Milestones are dated checkpoints worth celebrating, spaced evenly across the available time.",
  "Habits are the repeatable actions that actually get you there, stated as a RATE — three times a week, once a day. They carry no dates.",
  "A habit's rate is EITHER a count of sessions (targetCount, with targetAmount and unit null) OR an amount (targetAmount plus unit, e.g. 20 with unit 'words'). Never both, and never one of targetAmount/unit without the other.",
  "When the goal states a numeric target, prefer an amount in that same unit for at least one habit, so the rate can be checked against the target.",
  "Almost all of the work belongs in habits: a goal is reached by what you do repeatedly, not by a list of appointments.",
  "Setup tasks are rare and few — genuine one-offs that must happen before the practice can start, like buying the book or booking a trial class.",
  "Never propose a dated task for work the user does not control: you cannot decide what a class will cover on a given day.",
  "Never restate a milestone as a task or a habit.",
  "Every date must be a real calendar date in YYYY-MM-DD form.",
  "Do not restate a milestone the user already has.",
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
  // The numeric target, when there is one. Phrased as "N left of M" rather than just the
  // total, because a goal already part-done needs a rate for what REMAINS — and the model
  // has no other way to know the difference.
  if (goal.targetValue !== null && goal.targetValue > 0) {
    const unit = goal.unit ? ` ${goal.unit}` : ""
    const done = goal.currentValue ?? 0
    lines.push(
      `Measured numerically: ${done} of ${goal.targetValue}${unit} so far, ${Math.max(0, goal.targetValue - done)}${unit} still to go.`,
    )
    if (goal.unit) {
      lines.push(
        `If a habit is stated as an amount, use "${goal.unit}" as its unit so the rate can be compared with the target.`,
      )
    }
  }
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
/**
 * What a proposed habit's rate actually says, once the two ways of stating one have been
 * resolved. The app's copy of `resolveQuota`, for a payload rather than a row.
 *
 * **This is where the both-or-neither rule lives**, and it is here rather than in the Zod
 * schema because that schema is converted with `z.toJSONSchema` and sent to the provider —
 * Zod refuses to convert a transform or a refinement, so expressing the rule there would
 * break every plan request rather than tidy one field. See `goalPlanHabitSchema`.
 *
 * A half-stated habit — an amount with no unit, or a unit with no amount — is read as a
 * SESSION habit rather than rejected. That is the same asymmetry `goalPlanPayloadSchema`
 * documents about its own minima: a rejected payload reaches the user as a bare `malformed`
 * they can only escape by regenerating, while a habit that quietly counts sessions is
 * visible and editable in front of them.
 */
export function proposedQuota(habit: {
  targetCount: number
  targetAmount: number | null
  unit: string | null
}): { measured: boolean; amount: number | null; unit: string | null } {
  const unit = habit.unit?.trim() ? habit.unit.trim() : null
  const amount =
    habit.targetAmount !== null &&
    Number.isFinite(habit.targetAmount) &&
    habit.targetAmount > 0
      ? habit.targetAmount
      : null
  if (unit === null || amount === null) {
    return { measured: false, amount: null, unit: null }
  }
  return { measured: true, amount, unit }
}

export type PlanWarning = {
  /** Which list, and which position in it. `plan` is about the proposal as a whole. */
  on: "milestone" | "setupTask" | "plan"
  index: number
  kind:
    | "past"
    | "after-target"
    | "tight"
    | "out-of-order"
    | "no-habits"
    | "no-milestones"
    | "rate-short"
  message: string
}

/** Days in a period, for turning a rate into "how much by then". */
const DAYS_PER_PERIOD: Record<"day" | "week" | "month", number> = {
  day: 1,
  week: 7,
  // An approximation, and the reason `RATE_GRACE` exists below. Using real calendar months
  // would mean walking periods from today to the target date, which is a lot of machinery
  // for a figure that is already an estimate of a plan nobody has started.
  month: 30,
}

/**
 * How far short a rate may land before it is worth saying so.
 *
 * A plan that misses by 2% is inside the error of `DAYS_PER_PERIOD` above, and warning
 * about it would be the app inventing precision it does not have.
 */
const RATE_GRACE = 0.95

/** Within this many days of the target counts as cutting it fine. */
const TIGHT_DAYS = 7

export function planWarnings(
  payload: GoalPlanPayload,
  goal: {
    targetDate: string | null
    /** The numeric target, when the goal has one. All three travel together. */
    targetValue?: number | null
    currentValue?: number | null
    unit?: string | null
  },
  today: string,
): PlanWarning[] {
  const warnings: PlanWarning[] = []

  // A plan of checkpoints with no practice behind it is the exact failure this tranche
  // exists to prevent, and it is the app's job to notice — the model is never asked whether
  // its own plan is any good. Cheap to check, and it names the thing that is missing rather
  // than leaving the user to feel that something is off.
  if (payload.habits.length === 0) {
    warnings.push({
      on: "plan",
      index: 0,
      kind: "no-habits",
      message:
        "No recurring practice — nothing here builds toward the milestones",
    })
  }

  // The counterpart, and the reason `milestones` no longer carries a `.min(1)`. A goal
  // whose milestones are already complete makes the model answer with an empty list —
  // correctly, since the prompt sends the existing titles so it will not duplicate them.
  // The schema used to reject that correct answer as `malformed`, which reached the user as
  // an unexplained failure they could only meet again by regenerating. Saying what is
  // missing is strictly better than refusing to show them anything.
  if (payload.milestones.length === 0) {
    warnings.push({
      on: "plan",
      index: 0,
      kind: "no-milestones",
      message: "No milestones — nothing here marks progress toward the goal",
    })
  }

  const check = (
    on: "milestone" | "setupTask",
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
  // Habits carry no dates, which is the point of them — but a measured habit carries a
  // RATE, and a rate can be checked against a numeric target with a deadline. That is the
  // one thing about a habit this function can judge.
  const rate = rateWarning(payload, goal, today)
  if (rate) warnings.push(rate)
  payload.setupTasks.forEach((t, i) => check("setupTask", i, t.dueDate))

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

/**
 * "At 20 words a day you reach 5000 in February, not December."
 *
 * Named as unbuilt in IMPROVEMENT-PLAN since T12c, where it was blocked on a proposed habit
 * being able to carry an amount at all. Every condition below is a reason to stay SILENT
 * rather than guess, and there are more of them than there are reasons to speak:
 *
 * - **The goal must be measured numerically**, with something left to do. A goal tracked by
 *   milestones has no quantity to divide by a rate.
 * - **There must be a target date**, in the future. Without a deadline nothing is late, and
 *   a warning list is for things that are wrong — the user chose silence here explicitly.
 * - **The units must MATCH.** `goals.unit` is free text and purely a display suffix, so
 *   this app has no conversions and must not acquire one by inference. "30 minutes a day"
 *   against "5000 words" is not slow, it is incomparable, and saying anything about it
 *   would be a guess wearing a number.
 *
 * Rates SUM across every habit in the matching unit, because two practices toward one goal
 * really do add up — "20 new words a day" plus "50 reviewed a week" is 70 a week, and
 * judging either alone would report a shortfall that the plan does not have.
 */
function rateWarning(
  payload: GoalPlanPayload,
  goal: {
    targetDate: string | null
    targetValue?: number | null
    currentValue?: number | null
    unit?: string | null
  },
  today: string,
): PlanWarning | null {
  const goalUnit = goal.unit?.trim().toLowerCase()
  if (!goalUnit) return null
  if (!goal.targetValue || goal.targetValue <= 0) return null
  if (!goal.targetDate || goal.targetDate <= today) return null

  const remaining = goal.targetValue - (goal.currentValue ?? 0)
  if (remaining <= 0) return null

  let perDay = 0
  for (const habit of payload.habits) {
    const quota = proposedQuota(habit)
    if (!quota.measured) continue
    if (quota.unit!.toLowerCase() !== goalUnit) continue
    perDay += quota.amount! / DAYS_PER_PERIOD[habit.period]
  }
  // No habit in the goal's own unit. That is not a slow plan, it is an unmeasurable one,
  // and `no-habits` already covers a plan with no practice at all.
  if (perDay <= 0) return null

  const days = dayDiff(today, goal.targetDate)
  const reached = perDay * days
  if (reached >= remaining * RATE_GRACE) return null

  const unit = goal.unit!.trim()
  return {
    on: "plan",
    index: 0,
    kind: "rate-short",
    message: `At this rate you reach about ${round(reached)} of the ${round(remaining)} ${unit} needed by your target date`,
  }
}

/** Whole numbers for a figure that is already an estimate — "3650", not "3649.8". */
function round(value: number): number {
  return Math.round(value)
}

/** What Apply will actually create, for the manifest footer. Counts what is included. */
export function planCounts(payload: GoalPlanPayload): {
  milestones: number
  habits: number
  setupTasks: number
} {
  return {
    milestones: payload.milestones.length,
    habits: payload.habits.length,
    setupTasks: payload.setupTasks.length,
  }
}

/** Which rows the user has switched off, by position in their own list. */
export type Excluded = {
  milestones: ReadonlySet<number>
  habits: ReadonlySet<number>
  setupTasks: ReadonlySet<number>
}

/**
 * Drop the excluded rows.
 *
 * This used to be the trickiest function in the module and is now the dullest, which is
 * worth recording rather than quietly enjoying. Tasks carried a `milestoneIndex` — a
 * POSITION in the milestones array — so removing milestone 1 silently repointed every task
 * that named 2 at the wrong parent, and the renumbering existed to stop that. It was the
 * classic off-by-one that looks right until the one case where it isn't.
 *
 * T12c retired `milestoneIndex` entirely. Habits and setup tasks attach to the GOAL, the
 * same place tasks always actually attached in the data model — the nesting under milestones
 * was only ever presentational. With nothing pointing at a position, there is nothing to
 * renumber, and a whole class of bug went with it.
 */
export function finalizePlan(
  payload: GoalPlanPayload,
  excluded: Excluded,
): GoalPlanPayload {
  return {
    milestones: payload.milestones.filter(
      (_, i) => !excluded.milestones.has(i),
    ),
    // Normalised on the way out, not merely filtered. A half-stated habit reaching
    // `createHabit` would be REJECTED by `habitInputSchema`'s both-or-neither rule, and
    // the whole apply would fail with "couldn't create <title>" — the bad failure mode
    // `goalPlanPayloadSchema` warns about, arrived at from the other direction. Here it
    // simply becomes the session habit it already reads as. See `proposedQuota`.
    habits: payload.habits
      .filter((_, i) => !excluded.habits.has(i))
      .map((habit) => {
        const quota = proposedQuota(habit)
        return { ...habit, targetAmount: quota.amount, unit: quota.unit }
      }),
    setupTasks: payload.setupTasks.filter(
      (_, i) => !excluded.setupTasks.has(i),
    ),
  }
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
 * still built by naming fields for the same reason the goal one is (ADR-0011): the rule is
 * about the habit, and a prompt builder that spreads rows is one schema change away from
 * sending something nobody chose to send.
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
/** Sunday-indexed, matching `dowOf`. */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

export type SummaryPromptContext = {
  weekStart: string
  weekEnd: string
  /** The user's local today, so the model can be told where in the week it is. */
  today: string
  /**
   * How much of the week has happened — `weekProgress` in `review/service.ts` computes it.
   *
   * Taken as a SHAPE rather than imported, the same way `GoalMeasure` is: a companion
   * importing another module's service would be the first cross-module service import in
   * this codebase, and the convention when that came up for `dueStatus` was to avoid it.
   */
  progress: { elapsed: number; total: number; remaining: number }
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

/**
 * The observations as a sequence.
 *
 * They are stored as four discrete fields rather than an array — see the note on
 * `summaryPayloadSchema` for the provider behaviour that forced it — and every reader wants
 * a list. This is the ONLY place that knows the field names, so adding a fifth means
 * changing the schema and this function and nothing else.
 */
export function summaryObservations(payload: SummaryPayload): string[] {
  return [
    payload.observation1,
    payload.observation2,
    payload.observation3,
    payload.observation4,
  ].filter((o): o is string => typeof o === "string" && o.length > 0)
}

const SUMMARY_SYSTEM_PROMPT = [
  "You write a short, factual review of someone's week from figures they already recorded.",
  "Every number you are given is already correct — restate them, never recompute or estimate.",
  "Say what actually happened and what it suggests. Do not congratulate, encourage, or moralise.",
  "If something is notably better or worse than the rest of the week, say which and why.",
  "Never invent detail that is not in the figures.",
  // Without this the model reads a partial week as a failed one: told "2 of 3 days logged"
  // on a Wednesday it still reaches for the shortfall against seven, because seven days is
  // what "a week" means to it. Saying so in the system prompt is cheaper than hoping the
  // figures alone carry it.
  "A week still in progress is judged only on the days that have happened; days still to come are not missed days.",
].join(" ")

export function buildSummaryMessages(
  week: SummaryPromptContext,
  instruction?: string,
  previous?: SummaryPayload,
): ChatMessage[] {
  const { elapsed, total, remaining } = week.progress
  const inProgress = remaining > 0
  // A week not yet begun has nothing elapsed to measure against; it reads against the whole
  // week, for the same reason the Meals card does.
  const outOf = elapsed || total

  const lines = [
    // The day NAMES come off the week's own bounds, which `weekRange` built from
    // `weekStartsOn` — so a Monday-start account tells the model its week runs Monday to
    // Sunday without this function ever reading the preference.
    `Week of ${week.weekStart} to ${week.weekEnd}, which runs ${
      WEEKDAY_NAMES[dowOf(week.weekStart)]
    } to ${WEEKDAY_NAMES[dowOf(week.weekEnd)]}.`,
    inProgress
      ? `Today is ${WEEKDAY_NAMES[dowOf(week.today)]} — day ${elapsed} of ${total}, with ${remaining} still to come. Everything below covers the week SO FAR.`
      : `The week is over; all ${total} days are accounted for.`,
    `Tasks completed: ${week.tasksCompleted}${
      week.busiestDay ? `, busiest day ${week.busiestDay}` : ""
    }.`,
    // "of 7" was a constant here, which is what produced "3 of 7 days logged" on a
    // Wednesday — four days counted as missed when three had not arrived.
    `Meals logged on ${week.daysLogged} of ${outOf} days${
      inProgress ? " so far" : ""
    }; ${week.daysOnTarget} of ${week.daysWithTarget} days with a calorie target were met.`,
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
