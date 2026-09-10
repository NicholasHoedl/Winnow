// Pure agenda assembly for the dashboard: today's due tasks and today's event
// occurrences merged into one chronological list. Dependency-free (no DB, no
// `server-only`) so it unit-tests directly, and timezone-sensitive input is explicit
// (`now` + IANA zone) for determinism — same conventions as todos/service.ts.

import { addDays, dueStatus, todayInZone } from "@/lib/date"

/** The only fields the agenda reads off a task; callers pass their richer rows. */
export type AgendaTask = {
  dueDate: string | null
  /**
   * How the date binds — see `tasks.due_kind`. "by" is a deadline and shows from the day it
   * is set; "on" is a day and shows on it. Absent reads as "on", which is what every row
   * was before T28.
   */
  dueKind?: "on" | "by"
  status: "open" | "done"
  /** Set when a routine run created this task — see `tasks.routine_id`. */
  routineId?: string | null
  /**
   * When it was ticked — see `tasks.completed_at`. Nullable, so a row finished before that
   * column existed carries no instant to judge and reads as old work rather than today's.
   */
  completedAt?: Date | null
}

/**
 * Whether a task still belongs on the board.
 *
 * Open work always does. Completed work does for the REST OF THE DAY it was ticked, so a row
 * you just checked goes struck-through in place instead of vanishing under the tap — and an
 * accidental tick stays visibly undoable until midnight.
 *
 * **Bounded by `completedAt`, not by status alone, and that is the load-bearing part.**
 * `getTasks` applies no status filter in SQL — the three call sites below are the only thing
 * that has ever excluded done work — so admitting every completed task here would drop every
 * task ever finished late into Overdue, permanently. Judged in the caller's zone for the same
 * reason `dueStatus` is: 02:00Z is still the previous day in Chicago.
 */
function onBoard(task: AgendaTask, today: string, timeZone: string): boolean {
  if (task.status === "open") return true
  if (!task.completedAt) return false
  return todayInZone(task.completedAt, timeZone) === today
}

/** An expanded calendar occurrence. `time` is "HH:MM" local, or null for all-day. */
export type AgendaOccurrence = { time: string | null }

export type AgendaItem<T, E> =
  | { kind: "task"; time: null; task: T }
  | { kind: "event"; time: string | null; occurrence: E }

/** Due-today tasks that one routine run put on the board, kept together. */
export type AgendaGroup<T> = {
  routineId: string
  name: string
  tasks: T[]
}

export type TodayAgenda<T, E> = {
  /** Open tasks due before today. Rendered as their own block above the agenda —
   * they demand attention today but have no time-of-day to sort by. */
  overdue: T[]
  /**
   * Due-today tasks created by a routine, one block per routine, in the order their
   * first task appears.
   *
   * Pulled OUT of `items` rather than tagged inside it. A routine is a sequence — the
   * point of grouping is that its steps stay contiguous — and leaving them in the time
   * sort would let a loose task land in the middle of one and undo that.
   */
  groups: AgendaGroup<T>[]
  /** Today, in display order: all-day events, then loose due-today tasks, then timed
   * events ascending. Routine tasks are in `groups` instead. */
  items: AgendaItem<T, E>[]
}

/**
 * Build the dashboard's agenda.
 *
 * `occurrences` are expected to be a single day's — hand it `getDayEvents(today, tz)`,
 * which has already expanded recurrence and applied per-occurrence exceptions.
 *
 * `routineNames` resolves `task.routineId` to a heading. A task whose routine is not in
 * the map falls back to the loose list rather than forming a nameless block: the FK sets
 * `routine_id` to null when a routine is deleted, so this is a defensive path, and an
 * ungrouped task is exactly the pre-grouping behaviour.
 */
export function buildTodayAgenda<
  T extends AgendaTask,
  E extends AgendaOccurrence,
>(
  tasks: T[],
  occurrences: E[],
  now: Date,
  timeZone: string,
  routineNames: ReadonlyMap<string, string> = new Map(),
): TodayAgenda<T, E> {
  const overdue: T[] = []
  const loose: T[] = []
  // Insertion-ordered, which is what puts the groups in the order their first task
  // appears rather than in an arbitrary or alphabetical one. The name is carried in the
  // bucket so the map lookup happens once per task and never needs re-asserting later.
  const grouped = new Map<string, AgendaGroup<T>>()
  const today = todayInZone(now, timeZone)

  for (const task of tasks) {
    if (!onBoard(task, today, timeZone)) continue
    const status = dueStatus(task.dueDate, now, timeZone)
    if (status === "overdue") {
      overdue.push(task)
      continue
    }
    if (status !== "due-today") continue

    const name = task.routineId ? routineNames.get(task.routineId) : undefined
    if (
      task.routineId === undefined ||
      task.routineId === null ||
      name === undefined
    ) {
      loose.push(task)
      continue
    }

    const bucket = grouped.get(task.routineId)
    if (bucket) bucket.tasks.push(task)
    else
      grouped.set(task.routineId, {
        routineId: task.routineId,
        name,
        tasks: [task],
      })
  }

  const groups: AgendaGroup<T>[] = [...grouped.values()]

  const items: AgendaItem<T, E>[] = [
    // Events are listed before tasks so that, under a stable sort, all-day events
    // lead the untimed block and tasks follow.
    ...occurrences.map((occurrence) => ({
      kind: "event" as const,
      time: occurrence.time,
      occurrence,
    })),
    ...loose.map((task) => ({ kind: "task" as const, time: null, task })),
  ]

  // "" sorts before any "HH:MM", so untimed items lead; Array.prototype.sort is stable
  // (ES2019+), which is what makes the within-bucket order deterministic.
  items.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))

  return { overdue, groups, items }
}

// --- Slate -----------------------------------------------------------------------------

/** What a band needs off an occurrence beyond its time: which day, and whether it is tracked. */
export type SlateOccurrence = AgendaOccurrence & {
  /** "YYYY-MM-DD", local. */
  date: string
  event: { tracked: boolean }
}

export type SlateBand<T, E> = {
  /** "YYYY-MM-DD", or null for the Later bucket, which spans no single day. */
  date: string | null
  /** "Today" | "Tomorrow" | "Sat 23" | "Later". */
  label: string
  items: AgendaItem<T, E>[]
  /**
   * Routine blocks. Today's band only — every other band is a preview, and a preview with
   * drag handles would imply an ordering that today's sort has not been applied to.
   */
  groups: AgendaGroup<T>[]
}

export type Slate<T, E> = {
  overdue: T[]
  /**
   * Deadlines still ahead — `dueKind: "by"` with a date after today — nearest first.
   *
   * A block of its own rather than a band, and beside Overdue rather than among the days:
   * it is the same kind of thing as Overdue, a list of dated tasks asking for attention
   * before their day, and not the same kind of thing as a band, which IS a day. The horizon
   * does not apply to it; a deadline reaches as far as it is set.
   */
  dueBy: T[]
  bands: SlateBand<T, E>[]
}

/**
 * A weekday-and-day label: "Sat 23".
 *
 * **No year, and no range.** `dashboard-calendar-view.spec.ts` locates the dashboard's month
 * heading as the one `main h2` ending in four digits, and its week heading as the one holding
 * an en-dash. A band label carrying either makes those locators ambiguous and fails a spec
 * about the calendar, not about this.
 */
function bandLabel(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number)
  // Assembled rather than asking for `{ weekday, day }` together, which en-US renders as
  // "23 Thu" — the locale orders those two the other way round when no month is present.
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    timeZone: "UTC",
  })
  return `${weekday} ${d}`
}

/**
 * Everything worth seeing today, nearest first.
 *
 * Replaces three components that split one question — *what has a date?* — along an arbitrary
 * line: the agenda held today, `Tomorrow` held exactly one more day and no tasks at all, and
 * "Coming up" held every remaining task in a flat list. T28 then narrowed the question to
 * *what is worth seeing today?*, and the parts are:
 *
 * - **Overdue** and **Today** are `buildTodayAgenda`, called rather than reimplemented: the
 *   routine groups and the all-day → task → timed sort are its work, and its thirteen tests
 *   go on pinning the behaviour that actually ships. A deadline whose day has come is a task
 *   due today like any other, so it lands here; the row is what says "due by today".
 * - **Due by** holds the deadlines still ahead. A `by` date means the task is wanted before
 *   it, so the task shows from the day it is set — which is the whole difference between
 *   `by` and `on`, and why the horizon has no say over it.
 * - **Each following day**, out to the horizon, holds that day's TRACKED events and nothing
 *   else. A task due ON a day is for that day; previewing it in a "Sat 23" band was noise,
 *   and so was every untracked event of today and tomorrow, which the card used to draw
 *   unasked. Tracked is the only way onto the card for an event, today included.
 * - **Later** takes the undated tasks. Whatever has a day has a day it will appear on.
 *
 * `horizonDays` therefore governs tracked events and nothing else. Empty days are omitted.
 */
export function buildSlate<T extends AgendaTask, E extends SlateOccurrence>(
  tasks: T[],
  occurrences: E[],
  now: Date,
  timeZone: string,
  horizonDays: number,
  routineNames: ReadonlyMap<string, string> = new Map(),
  /**
   * Defaulted, unlike `formatLongDate`'s required one, and only because the tests in
   * `agenda.test.ts` call this positionally and none of them is about formatting — they
   * assert which BAND a row lands in. The one production caller (`(app)/page.tsx`) passes it
   * explicitly, so the default is reached by tests and nothing else.
   */
  locale = "en-US",
): Slate<T, E> {
  const today = todayInZone(now, timeZone)
  // Inclusive of the horizon itself: "within 7 days" reaches the seventh day, not the sixth.
  const dates = Array.from({ length: horizonDays + 1 }, (_, i) =>
    addDays(today, i),
  )

  // Filtered here, never in SQL, for the reason `calendar/queries.ts` gives: the flag can
  // live on an exception, so it is only knowable after `applyExceptions` has run.
  const tracked = occurrences.filter((o) => o.event.tracked)
  const onDay = (date: string) => tracked.filter((o) => o.date === date)
  // Filtered ONCE, not inside each helper. `getTasks` is bounded only by `userId`, so this
  // array holds every task the account has ever completed and that set only grows — and
  // `onBoard` costs an `Intl.DateTimeFormat` per done row.
  const board = tasks.filter((task) => onBoard(task, today, timeZone))

  const agenda = buildTodayAgenda(
    tasks,
    onDay(today),
    now,
    timeZone,
    routineNames,
  )

  // `> today` rather than "not overdue and not today": a deadline that has arrived belongs
  // to Today, and one that has passed to Overdue, and both are the agenda's to place. The
  // sort is stable, so two deadlines on one day keep the list's own order.
  const dueBy = board
    .filter(
      (task) =>
        task.dueKind === "by" && task.dueDate !== null && task.dueDate > today,
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))

  const bands: SlateBand<T, E>[] = [
    { date: today, label: "Today", items: agenda.items, groups: agenda.groups },
  ]

  for (const date of dates.slice(1)) {
    const items: AgendaItem<T, E>[] = onDay(date).map((occurrence) => ({
      kind: "event" as const,
      time: occurrence.time,
      occurrence,
    }))
    items.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))

    // An empty day is omitted rather than shown as a bare heading. Most days between here
    // and the horizon have nothing tracked on them, and a column of empty dates would make
    // the card look busy while saying nothing.
    if (items.length === 0) continue
    bands.push({
      date,
      label: date === dates[1] ? "Tomorrow" : bandLabel(date, locale),
      items,
      groups: [],
    })
  }

  // Undated only. A dated task has a day it will appear on — or a Due by row already.
  const later = board.filter((task) => task.dueDate === null)
  if (later.length > 0) {
    bands.push({
      date: null,
      label: "Later",
      items: later.map((task) => ({ kind: "task" as const, time: null, task })),
      groups: [],
    })
  }

  return { overdue: agenda.overdue, dueBy, bands }
}
