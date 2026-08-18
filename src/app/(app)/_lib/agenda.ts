// Pure agenda assembly for the dashboard: today's due tasks and today's event
// occurrences merged into one chronological list. Dependency-free (no DB, no
// `server-only`) so it unit-tests directly, and timezone-sensitive input is explicit
// (`now` + IANA zone) for determinism — same conventions as todos/service.ts.

import { addDays, dueStatus, todayInZone } from "@/lib/date"

/** The only fields the agenda reads off a task; callers pass their richer rows. */
export type AgendaTask = {
  dueDate: string | null
  status: "open" | "done"
  /** Set when a routine run created this task — see `tasks.routine_id`. */
  routineId?: string | null
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

  for (const task of tasks) {
    if (task.status !== "open") continue
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

/** What a band needs off an occurrence beyond its time: which day, and whether it is flagged. */
export type SlateOccurrence = AgendaOccurrence & {
  /** "YYYY-MM-DD", local. */
  date: string
  event: { highlighted: boolean }
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
 * Everything with a date on it, nearest first.
 *
 * Replaces three components that split one question — *what has a date?* — along an arbitrary
 * line: the agenda held today, `Tomorrow` held exactly one more day and no tasks at all, and
 * "Coming up" held every remaining task in a flat list. A task due tomorrow appeared in the
 * last of those with a "tomorrow" badge while tomorrow's *events* sat in a different column.
 *
 * **Today's band is `buildTodayAgenda`, called rather than reimplemented.** Overdue, the
 * routine groups and the all-day → task → timed sort are all its work, and its thirteen tests
 * go on pinning the behaviour that actually ships.
 *
 * The bands after it are deliberately not symmetrical with it:
 *
 * - **Tomorrow** shows every event *and* every task due then. Events because that is what
 *   `Tomorrow` did; tasks because "Coming up" did, and merging must not lose either.
 * - **Beyond tomorrow**, only HIGHLIGHTED events — plus any task due that day. Showing every
 *   event a week out would bury the card in standups, which is the whole reason the flag
 *   exists rather than a blanket lookahead.
 * - **Later** takes what is left: tasks dated past the horizon, and undated ones.
 *
 * `horizonDays` therefore only ever *adds* days to look at. No value of it can hide a row that
 * today or tomorrow would have shown.
 */
export function buildSlate<T extends AgendaTask, E extends SlateOccurrence>(
  tasks: T[],
  occurrences: E[],
  now: Date,
  timeZone: string,
  horizonDays: number,
  routineNames: ReadonlyMap<string, string> = new Map(),
  /**
   * Defaulted, unlike `formatLongDate`'s required one, and only because twelve tests in
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
  const lastDate = dates[dates.length - 1]

  const onDay = (date: string) => occurrences.filter((o) => o.date === date)
  const dueOn = (date: string) =>
    tasks.filter((task) => task.status === "open" && task.dueDate === date)

  const agenda = buildTodayAgenda(
    tasks,
    onDay(today),
    now,
    timeZone,
    routineNames,
  )

  const bands: SlateBand<T, E>[] = [
    { date: today, label: "Today", items: agenda.items, groups: agenda.groups },
  ]

  for (const date of dates.slice(1)) {
    const isTomorrow = date === dates[1]
    const events = onDay(date).filter((o) => isTomorrow || o.event.highlighted)
    const items: AgendaItem<T, E>[] = [
      ...events.map((occurrence) => ({
        kind: "event" as const,
        time: occurrence.time,
        occurrence,
      })),
      ...dueOn(date).map((task) => ({
        kind: "task" as const,
        time: null,
        task,
      })),
    ]
    items.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))

    // An empty day is omitted rather than shown as a bare heading. Most days between here
    // and the horizon have nothing flagged on them, and a column of empty dates would make
    // the card look busy while saying nothing.
    if (items.length === 0) continue
    bands.push({
      date,
      label: isTomorrow ? "Tomorrow" : bandLabel(date, locale),
      items,
      groups: [],
    })
  }

  // Everything still on the list that no band above claimed: dated past the horizon, or
  // never dated at all. `dueDate > lastDate` is a plain string compare, which is sound for
  // ISO dates and is how `dueStatus` does it too.
  const later = tasks.filter(
    (task) =>
      task.status === "open" &&
      (task.dueDate === null || task.dueDate > lastDate),
  )
  if (later.length > 0) {
    bands.push({
      date: null,
      label: "Later",
      items: later.map((task) => ({ kind: "task" as const, time: null, task })),
      groups: [],
    })
  }

  return { overdue: agenda.overdue, bands }
}
