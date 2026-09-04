# ADR-0014: Habits Are A Quota And A Log

**Status:** Accepted (T12a)
**Date:** 2026-08-10
**Supersedes:** ADR-0009

## Context

The companion's goal plans came back wrong in a way no prompt was going to fix. Asked to
break down "learn 5000 Japanese words", it proposed the milestone "Learn first 1000 words"
and then, as its _tasks_, "Learn words 1-250" — which is another milestone. Asked about a
white belt stripe, it proposed "Drill mount and side control positions" on August 31, which
is not something you decide: you show up to the class you're given.

The model was not being careless. It was answering the only question the schema could ask.
`goalPlanTaskSchema` requires `{ title, milestoneIndex, dueDate }`, so **every recurring
commitment has to name a day**, and a plan made of dated one-offs is the only well-formed
answer available. The thing a person actually commits to — _three classes a week_, _ten new
words a day_ — has no representation in this app at all.

`task_recurrences` looks like it should be that representation and isn't. It answers "which
days does this fall on", which is a different question from "how often". A rule can say
Monday/Wednesday/Friday; it cannot say _three times, any three_. `flexible` gets closest —
"once per period, any day within it" — but the count is hard-wired at one, and the whole
point of a quota is that the number is the commitment.

There is a second cost, quieter and already visible in the app. `goalMomentum` counts
completed tasks and ticked milestones. A goal you have worked three times a week for a month
produces neither, so it reads **Stalled** forever. The reading is not wrong about its inputs;
it is missing the inputs that matter.

T7c had already built something called habits — a _derived_ view in which every repeating
task is implicitly a habit, with streaks recomputed from the recurrence engine. That is the
same conflation, one layer down: it treats "a task that repeats" and "a practice you sustain"
as one thing, because at the time they were.

## Decision

**A habit is a quota and a log: a rule that states a rate, plus one row per completion.**

Two tables. `habits` carries `period` (`day` | `week` | `month`), `target_count`, an optional
`goal_id`, and — unused in T12a, present so the next step needs no migration — `unit` and
`target_amount`. `habit_entries` carries `habit_id`, `on_date` and an optional `amount`, with
**no unique constraint**: two classes on Tuesday is two rows, because it is two classes.

Adherence is `count(entries in the current period) / target_count`. A streak counts
**periods that met the target**, not days and not occurrences.

**The derived habits view is retired in the same tranche**, and the new primitive takes the
name. Repeating tasks go back to being repeating tasks — rent, the bins, the quarterly
review — which is what they always were. No user data is deleted or migrated: those rules
keep generating their instances exactly as before, they simply stop rendering a streak.

### Why a log and not materialised instances

The obvious alternative is to keep the recurrence engine and let a rule emit N instances per
period. It fails on a single fact: **four separate places treat `occurrenceDate` as the unit
of identity, and they agree with each other.**

- `unique(tasks.series_id, occurrence_date)` — Postgres-enforced, and load-bearing: it is
  what makes `syncRuleInstances` idempotent under concurrent renders.
- `unique(task_recurrence_exceptions.rule_id, occurrence_date)` — one skip per occurrence.
- `cyclesInRange` dedupes by `occurrenceDate`.
- The T7c habit maths set-intersects on it.

Three instances of "3 a week" share one occurrence date, so the constraint rejects two of
them. Making it work means adding an `occurrence_index` to the identity and teaching all
four to carry it — a change to the engine every other feature in the app is built on, in
service of a primitive that does not otherwise need it.

It is also the wrong picture. Three identical rows, all soft-due Sunday, all flipping to
overdue together on Monday, indistinguishable from one another: that is not what "three
times this week" looks like. A quota is one thing with a count, not a count of things.

The log costs one table and buys the rate directly. It is also the only shape that extends to
"20 words a day" and "5km a week" without a redesign, which is why `amount` and
`target_amount` exist from the first migration.

### The forgiveness rule, restated in periods

ADR-0009's "a trailing miss is forgiven exactly once" survives, in new units. At 9am on
Monday a "3 a week" habit stands at 0 of 3, and judging it would report a broken streak every
Monday morning. So **the period containing today is forgiven if it has not met target, and
judged if it has** — the number goes up the instant you hit the quota, which is the whole
motivational point. Every earlier period is judged normally.

Two refinements the cycle version did not need. Forgiveness applies only to a period that is
genuinely in progress: a habit with an `end_date` in the past has a finished last period, so
it is judged, and the habit keeps the streak it ended with rather than reading zero. And the
walk stops at `start_date` — a habit created two weeks ago with both weeks met reads 2, not
"broken in week three" against a void it was never asked about.

## Alternatives considered

**Keep deriving habits from `task_recurrences`, and add a `times_per_period` column.**
Cheapest on paper. Rejected on the `occurrence_index` cascade above: the column is easy, and
every consumer of the identity it breaks is not.

**Two habit mechanisms side by side** — derived habits for daily rules, quota habits for
rates. Rejected. Two things with one name is how the original confusion happened, and this
would have shipped it deliberately rather than inheriting it.

**Store a rolling counter per period instead of one row per completion.** Smaller, and
adherence reads without aggregation. Rejected because an aggregate cannot be undone
precisely, cannot answer "which days", and cannot carry `amount` later. The log is the
smaller commitment even though it is the larger table.

**Show completions only, no target.** Sidesteps the whole design. Rejected for the same
reason ADR-0009 rejected it: "you are one short this week" is the half that changes
behaviour, and a view that cannot say it is a heatmap, not a habit tracker.

## Consequences

- **Changing `week_starts_on`, `period` or `target_count` re-buckets history**, and can
  lengthen or break a streak for periods already past. This is ADR-0009's "editing a schedule
  rewrites the past" inherited whole, for the same reason — the denominator is derived from
  the rule as it exists now, and rules are mutated in place. Accepted on the same grounds.
- **Deleting a goal detaches its habits, and it is no longer silent.** `goal_id` is
  `ON DELETE set null`, so the practice outlives the goal it served but loses its
  attribution, and T12b's momentum loses it with nothing stored to say why. Structurally
  identical to `tasks.series_id`, which ADR-0009 recorded and left alone.
  **Recorded and left alone here too — until it was reported from real use**, at which point
  the behaviour was kept and made explicit rather than changed: the delete confirm now names
  the practice and offers leave / archive / delete, defaulting to leave. The milestones get
  no equivalent choice and the dialog says so outright, because `milestones.goal_id` is NOT
  NULL — a milestone genuinely cannot outlive its goal without a nullable column and a
  screen to show the orphans on, and an option that silently does nothing is worse than no
  option.
- **`+1` is deliberately not idempotent.** No unique constraint means a double-click writes
  two rows — correct for two classes on Tuesday, wrong for a fat finger, and unfixable in the
  schema without breaking the first case. The mitigation is entirely in the UI: the button is
  disabled while the write is in flight, and the undo toast deletes exactly the row id the
  action returned.
- **`amount` and `target_amount` are `real`, not `numeric`.** `numeric` was considered — a
  counted quantity is the classic case for exact decimal — and rejected for consistency:
  `goals.target_value` is already `real`, with a comment giving the reason ("plenty of goals
  are measured in fractions (miles, kilos, hours)"), and the meals module made the same call
  before it. A habit's amount is that same quantity. Introducing a second numeric convention
  to sit directly beside the first would cost more in confusion than it buys in precision.
- **ADR-0009 is superseded, not refuted.** Its reasoning was correct for the feature it
  described: given a habits view derived from the recurrence engine, recomputing the
  denominator really was the right call against snapshotting or versioning. That feature no
  longer exists. Its three supporting rules were the good part and two of them survive here.
- Revisit if habits ever need per-period skips (deferred from this tranche), or if the app
  gains a real scheduler — a stored denominator written by a cron would cost far less than one
  written during a page read, which is the same escape hatch ADR-0009 named.
