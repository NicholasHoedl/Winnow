# ADR-0009: Streaks Recompute From The Current Rule

**Status:** Accepted (T7c)
**Date:** 2026-08-04

## Context

T7c turns the existing recurring-task engine into a habits view: per rule, a completion
rate, a current and longest streak, and a 90-day heatmap.

A streak needs two things — which cycles were **completed**, and which cycles were
**expected**. Only the first is stored.

Completions are durable, and this was verified rather than assumed. `syncRuleInstances`
(`todos/queries.ts`) deletes only rows matching `eq(tasks.status, "open")`, and the lazy
path inserts with `onConflictDoNothing`, so a completed cycle is never retired and never
re-created. Each completed instance keeps `seriesId`, `occurrenceDate` and `completedAt`
indefinitely. Skips are separate rows in `task_recurrence_exceptions`, keyed on the same
`occurrenceDate`. So `completed` and `skipped` are both facts on disk.

The denominator is not. Nothing records "this rule owed a cycle on this date" — the set of
expected cycles is derived on demand by `cyclesInRange` in `src/lib/recurrence.ts`, from
the rule as it exists **now**.

And rules are mutated in place. `updateTaskRecurrence` overwrites `freq`,
`recurrenceInterval`, `weekdays`, `startDate` and `endDate` on the same row, with no
versioning and no history. Changing a habit from daily to three-times-a-week therefore
changes what last month "should" have looked like, after the fact — a 90-day history can
gain or lose expected cycles, and the streak with it.

## Decision

**Recompute expected cycles from the current rule. Accept that editing a schedule rewrites
the past.**

No snapshot table, no rule versioning. `getHabits` calls `cyclesInRange` against today's
rule and intersects the result with the stored completions and skips.

Three supporting rules, all in `todos/habits.ts` and unit-tested:

- **A skip is neutral.** It neither extends nor breaks a streak, and it is excluded from
  the completion-rate denominator. Deciding in advance not to do something is not failing
  to do it, and scoring it as a miss would make the honest action look worse than quietly
  ignoring the task. This is the entire reason skip-once is stored as its own row.
- **A trailing miss is forgiven exactly once.** The final cycle is usually the current one,
  still in progress. Counting it would report a broken streak every morning until the day's
  task was done. A second consecutive miss is a real break.
- **Streaks count cycles, the heatmap counts days, and the two never mix.** For a `flexible`
  rule `occurrenceDate` is the period _start_, so a day grid drawn from it would put every
  completion on a Sunday. The heatmap reads `completedAt` bucketed through `todayInZone`
  instead.

## Alternatives considered

**Snapshot each expected occurrence into a table as it is generated.** Correct under any
rule edit, and the only option that makes history immutable. Rejected on cost: it adds a
table and a write to the render-time materializer, which already runs on every render of
/todos, the dashboard and the digest — the app's hottest path, and one with no cron behind
it. The failure it prevents is a single user occasionally editing their own habit schedule
and seeing a number move.

**Version the rule and keep old versions.** Same correctness, more machinery: every rule
edit forks a row, and `cyclesInRange` grows a notion of which version was in force on a
given date. Disproportionate to the problem.

**Show completions only — no denominator, no misses.** Always truthful, and it sidesteps
this entirely. Rejected because "you broke a 12-day streak" is the motivating half of a
habit tracker, and a view that cannot say it is a heatmap, not a habits page.

## Consequences

- Editing a habit's schedule can change its displayed streak and completion rate for
  periods already past. Nothing warns about this; it is documented here and in
  `docs/IMPROVEMENT-PLAN.md`.
- History is only as good as the completions, which is why T7c also fixed a real
  destruction path: `toggleTaskStatus` re-opening an off-cycle completed instance turned it
  into an open row that the next render deleted. The action now refuses, using
  `reopenWouldDestroy`.
- Deleting a rule still orphans its completed rows — `seriesId` is `onDelete: "set null"`,
  so the tasks survive but become unattributable and the habit vanishes from the view.
  That is defensible (you deleted the habit) and is left as-is deliberately.
- Revisit if rule editing ever becomes common, or if the app gains a real scheduler — a
  snapshot written by a cron would cost far less than one written during a page read.
