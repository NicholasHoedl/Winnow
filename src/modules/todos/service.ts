// About this file: task logic shared by the server and the browser: date sections,
// summaries, repeat labels, search, sorting, the optimistic list update, and reading a
// quick-add line.
//
// What you'll find here:
// - `bucketTasks`: splits open tasks into Overdue, Today, Upcoming and Someday.
// - `summarizeTasks`: the overdue count and the open tasks due today.
// - `repeatLabel`: the "Weekly" or "Every 2 weeks" badge text for a repeating task.
// - `reopenWouldDestroy`: whether reopening a finished repeating task would lose it.
// - `searchTasks`: the /activity search box's match on title or notes.
// - `sortByCompletion`: completed tasks, most recent first.
// - `applyTaskChange`: the optimistic list update for ticking or removing a task.
// - `UNFILED`, `parseListTag`: the "no list" filter value, and reading a `#list` tag.
// - `parseTaskCapture`: splits a quick-add line into title, due date, due kind and list.
//
// Related: `service.test.ts` and `list-tag.test.ts`, worked examples of each function.

// Pure, dependency-free to-do logic. No DB, no `server-only` — so it can be
// unit-tested directly. All timezone-sensitive functions take an explicit
// `now` and IANA `timeZone` for determinism.

import { dueStatus } from "@/lib/date"
import { parseNaturalDate, type ParsedDate } from "@/lib/nl-date"
import type { Cycle } from "@/lib/recurrence"
import { TAG, stripSpans, tagKey } from "@/lib/tags"

export type TaskSummaryInput = {
  dueDate: string | null
  status: "open" | "done"
}

/** The four sections the to-do list renders, in the order it renders them. */
export type TaskBuckets<T> = {
  overdue: T[]
  today: T[]
  upcoming: T[]
  someday: T[]
}

/**
 * Split open tasks into date sections.
 *
 * `someday` — no due date — is the point of this function. `dueStatus` has always returned
 * a distinct `"none"`, but nothing rendered it: the list was flat and undated tasks simply
 * sank to the bottom, indistinguishable from far-future ones. A task with no deadline is
 * not a task that missed one.
 *
 * INPUT ORDER IS PRESERVED within each bucket. Manual position (`tasks.sort_order`) is
 * applied by the query's ORDER BY, so re-sorting here would silently undo a drag.
 */
export function bucketTasks<T extends TaskSummaryInput>(
  tasks: T[],
  now: Date,
  timeZone: string,
): TaskBuckets<T> {
  const buckets: TaskBuckets<T> = {
    overdue: [],
    today: [],
    upcoming: [],
    someday: [],
  }
  for (const task of tasks) {
    if (task.status !== "open") continue
    switch (dueStatus(task.dueDate, now, timeZone)) {
      case "overdue":
        buckets.overdue.push(task)
        break
      case "due-today":
        buckets.today.push(task)
        break
      case "upcoming":
        buckets.upcoming.push(task)
        break
      default:
        buckets.someday.push(task)
    }
  }
  return buckets
}

export type TaskSummary<T> = {
  overdueCount: number
  dueTodayCount: number
  dueToday: T[]
}

/** Dashboard summary: overdue count + due-today tasks, among OPEN tasks only. */
export function summarizeTasks<T extends TaskSummaryInput>(
  tasks: T[],
  now: Date,
  timeZone: string,
): TaskSummary<T> {
  let overdueCount = 0
  const dueToday: T[] = []
  for (const task of tasks) {
    if (task.status !== "open") continue
    const status = dueStatus(task.dueDate, now, timeZone)
    if (status === "overdue") overdueCount++
    else if (status === "due-today") dueToday.push(task)
  }
  return { overdueCount, dueTodayCount: dueToday.length, dueToday }
}

/** Only the schedule fields the label reads; the Drizzle row satisfies it structurally. */
export type RepeatShape = {
  freq: "daily" | "weekly" | "monthly"
  recurrenceInterval: number
}

const REPEAT_UNIT = { daily: "day", weekly: "week", monthly: "month" } as const

/**
 * "Daily" / "Weekly" / "Every 2 weeks" — the badge wording for a repeating task.
 *
 * Hoisted here in T7c. It existed character-for-character twice, in `task-item.tsx` and
 * the repeating-tasks manager (`repeating-view.tsx` now), and the habit cards would have
 * made three. One phrasing, so
 * the same rule can't read differently depending on where you look at it.
 */
export function repeatLabel(series: RepeatShape): string {
  const unit = REPEAT_UNIT[series.freq]
  if (series.recurrenceInterval > 1) {
    return `Every ${series.recurrenceInterval} ${unit}s`
  }
  return { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }[series.freq]
}

/**
 * Whether re-opening this completed task would silently destroy it.
 *
 * `syncRuleInstances` retires every OPEN instance of a rule that isn't the current cycle,
 * and it runs on each render of /activity, the dashboard and the digest. So un-completing an
 * off-cycle instance turns a durable history row into an open one that the very next page
 * load deletes — the completion disappears with nothing to show it ever existed.
 *
 * A one-off task has no rule to retire it and is always safe. A rule that has ended has no
 * current cycle at all, so nothing can be re-opened under it.
 *
 * Lived in `todos/habits.ts` until T12a retired that file. It never was habit maths: it
 * reads a task against a recurrence cycle and guards `toggleTaskStatus`, which is this
 * module's business and survives the habits rewrite untouched.
 */
export function reopenWouldDestroy(
  task: { seriesId: string | null; occurrenceDate: string | null },
  cycle: Cycle | null,
): boolean {
  if (!task.seriesId || !task.occurrenceDate) return false
  return cycle === null || cycle.occurrenceDate !== task.occurrenceDate
}

/** The fields `/activity`'s search box reads off a task. */
export type TaskSearchInput = {
  title: string
  notes: string | null
}

/**
 * Narrow a task list to the rows matching a free-text query, on title or notes.
 *
 * **This is the page's own box, not the ⌘K palette's.** That one is a server-side `ilike`
 * across every module in the app; this narrows a list `/activity` already holds in memory,
 * so it costs no round trip and can run on every keystroke without a debounce.
 *
 * Notes are searched as well as titles because a task whose detail lives in its notes is
 * exactly the one whose title you cannot remember — the palette made the same call.
 *
 * An empty or whitespace-only query returns the input UNCHANGED rather than nothing: the box
 * is a filter that is simply off until you type in it.
 *
 * INPUT ORDER IS PRESERVED, for the reason `bucketTasks` preserves it — `tasks.sort_order`
 * carries the manual drag, and re-sorting here would silently undo one.
 */
export function searchTasks<T extends TaskSearchInput>(
  tasks: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return tasks
  return tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(needle) ||
      (task.notes?.toLowerCase().includes(needle) ?? false),
  )
}

/** The field the Completed view orders by. */
export type TaskCompletionInput = {
  completedAt: Date | null
}

/**
 * Most recently completed first.
 *
 * `getTasks` orders by `sort_order` then due date, which is the right order for open work and
 * a meaningless one for finished work — it put the thing you just ticked anywhere in the
 * list. A Completed view is a history, and a history reads newest first.
 *
 * **Nulls sort LAST.** `completed_at` is nullable, so a row finished before that column was
 * written has no instant to place; the bottom is the honest place for it rather than the top,
 * which is where an ascending-null sort would put it.
 *
 * Copies before sorting. It is handed an array derived from a React prop, and sorting in
 * place would be a side effect on data the caller still holds.
 */
export function sortByCompletion<T extends TaskCompletionInput>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.completedAt) return b.completedAt ? 1 : 0
    if (!b.completedAt) return -1
    return b.completedAt.getTime() - a.completedAt.getTime()
  })
}

/** What the optimistic reducer below needs off a row. */
export type TaskChangeInput = {
  id: string
  status: "open" | "done"
}

/**
 * What an in-flight write does to the list before the server has answered.
 *
 * `/activity` fed `useOptimistic` a bare toggled id until T45, so only ticking a task felt
 * immediate: deleting or skipping one waited the whole round trip — 306ms on a 5G profile —
 * with the row sitting there unchanged after the menu had already closed. The row is what
 * the tap was about, so it leaves at once, and because `useOptimistic` discards this the
 * moment the transition ends, a failed write puts it back with nothing to undo by hand.
 *
 * The Undo path is NOT expressed here. It opens its own transition and lands through
 * revalidation, so a restored row arrives as ordinary server state.
 *
 * Untouched rows are returned by IDENTITY, which is what keeps a tick from remounting every
 * card in the list.
 */
export type TaskChange = { kind: "toggle" | "remove"; id: string }

export function applyTaskChange<T extends TaskChangeInput>(
  tasks: T[],
  change: TaskChange,
): T[] {
  if (change.kind === "remove") {
    return tasks.filter((task) => task.id !== change.id)
  }
  return tasks.map((task) =>
    task.id === change.id
      ? {
          ...task,
          status:
            task.status === "open" ? ("done" as const) : ("open" as const),
        }
      : task,
  )
}

// --- Lists ---

/** Sentinel for "tasks with no list" in `?list=` — a filter value, not an id. */
export const UNFILED = "none"

export type ListOption = { id: string; name: string }

export type ParsedListTag = {
  /** The list the tag named, or null — including when there was no tag. */
  listId: string | null
  /** The line with the tag taken out and the gap tidied; empty when the tag was all of it. */
  cleaned: string
}

/**
 * Pull a `#list` out of a quick-add line.
 *
 * The sibling of the budget's `parseTransactionQuickAdd`, on the same matcher: only the
 * FIRST tag is read, and it is stripped whether or not it names a list — a `#` is an
 * instruction, and one that sometimes stayed in the title would make it two things. Both
 * sides go through `tagKey`, so "Home projects" is reachable as `#home-projects`.
 */
export function parseListTag(text: string, lists: ListOption[]): ParsedListTag {
  const hit = TAG.exec(text)
  if (!hit) return { listId: null, cleaned: text.trim() }
  const key = tagKey(hit[1])
  const list = lists.find((candidate) => tagKey(candidate.name) === key)
  const cleaned = stripSpans(text, [[hit.index, hit.index + hit[0].length]])
    .replace(/\s{2,}/g, " ")
    .trim()
  return { listId: list?.id ?? null, cleaned }
}

export type ParsedCapture = {
  /** The line with the date phrase and the tag taken out — never empty. */
  title: string
  /** YYYY-MM-DD, or null when the line named no date. */
  dueDate: string | null
  /** `tasks.due_kind` — "by" when the date was introduced by "by". */
  dueKind: ParsedDate["kind"]
  /** The list the tag named, or null. */
  listId: string | null
}

/**
 * Everything one typed quick-add line says: the date, whether "by" made it a deadline,
 * the `#list`, and the title that is left over.
 *
 * Both capture bars read a line through here, so the same words mean the same thing on
 * the dashboard and on the Activity page (T41). What they do with an undated line is
 * theirs to decide, which is why `dueDate` comes back null rather than defaulted: the
 * dashboard assumes today, the Activity bar leaves it for later and lands in Someday.
 *
 * The date first, then the tag: neither parser knows about the other's phrase, and the
 * tag matcher stops at a space, so the order only decides which one tidies up.
 */
export function parseTaskCapture(
  text: string,
  lists: ListOption[],
  today: string,
): ParsedCapture {
  const trimmed = text.trim()
  const dated = parseNaturalDate(trimmed, today)
  const tagged = parseListTag(dated.cleaned, lists)
  return {
    // A line that was ONLY a date and a tag keeps its text rather than saving a blank.
    title: tagged.cleaned || trimmed,
    dueDate: dated.date,
    dueKind: dated.kind,
    listId: tagged.listId,
  }
}
