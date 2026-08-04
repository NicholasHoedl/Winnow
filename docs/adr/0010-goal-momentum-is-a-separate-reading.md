# ADR-0010: Goal Momentum Is A Separate Reading, Not Part Of Progress

**Status:** Accepted (T8)
**Date:** 2026-08-04

## Context

`tasks.goalId` has existed since T2 — nullable, `ON DELETE SET NULL`, with a picker in the
task dialog and a linked-task list on the goal card. What it never did was *measure*
anything. `goalProgress()` (`goals/service.ts`) has a strict precedence — milestones, then
the numeric `targetValue`/`currentValue` pair, then `kind: "none"` — and tasks appear in
none of the three. The query comment said so outright: "Projected — the card only displays
them."

That leaves a real gap. Milestones are lumpy and hand-maintained: one gets ticked every few
weeks at best, so a goal's percentage can sit unchanged for a month whether you are working
it hard or have quietly abandoned it. The two states are indistinguishable, and the second
one is the one worth knowing about. The weekly review had the same problem in sharper form
— its Goals card reported milestones alone, so it read as dead most weeks.

Four options were considered for how linked tasks should relate to the existing number:

1. A **third fallback** in the precedence chain (milestones → tasks → numeric).
2. **Blending** milestones and tasks into a single percentage.
3. A **separate reading** alongside the untouched progress figure.
4. A per-goal **`progressMode`** column letting each goal declare how it is measured.

## Decision

**Option 3. `goalProgress()` is untouched; momentum is a second, independent measure.**

`goalMomentum()` returns `{ moved, stalled, windowDays }`, or **null** when the goal has
nothing to track. Progress answers *how far*; momentum answers *is this alive*. They are
different questions and a single number cannot carry both.

Three decisions fall out of it:

**Both tasks and milestones count as movement.** Tasks-only was the literal reading of the
request and is the simpler query, but a goal driven purely through milestones — real work,
ticked fortnightly — would have reported "stalled" while being actively worked. A badge
that cries wolf gets ignored, which would have killed the one thing the feature is for.
Both columns already carry `completedAt` (`milestones.completedAt` since T7d), so this
needed no schema change.

**A goal with nothing to track returns null, not stalled.** That is a numeric goal or an
empty one. `goals.currentValue` is overwritten in place with no history, so a goal updated
an hour ago is indistinguishable from one last touched in March. There is genuinely nothing
to measure, and rendering "stalled" there would be an outright lie about a goal you are
working. Showing nothing is the honest answer.

**One window, not two.** `user_preferences.goalMomentumDays` (7/14/30, default 14) is both
the count window and the stall threshold. Two numbers would be more expressive and
considerably harder to reason about six months later, and the reading is only worth having
if it can be trusted at a glance. This is the one schema change (migration `0026`), taken
knowingly against the "no schema change" constraint the design started with: 14 days was a
guess about one person's habits, in that person's own app.

## Consequences

**A purely numeric goal gets no momentum reading, permanently** — not until there is a
progress-log table to give `currentValue` a history. Deliberately out of scope; a numeric
goal that also has linked tasks or milestones is measured on those.

**Milestones ticked before T7d have no timestamp and can never count.** Same forward-only
caveat the weekly review already states out loud rather than quietly reporting a zero.

**Momentum is a rate, so it says nothing about completion.** No projected finish date was
built: a forecast from a handful of completions reads as noise on a goal you touch weekly,
and `goals.targetDate` is already compared against directly.

**Goal-linked tasks appear twice in the weekly review** — once in the Tasks count, once in
the Goals card. That is the point rather than a double-count, and `isEmpty` deliberately
ignores `goalTasks` so the same fact is not tested twice.

**`getGoals()` was bounded on the way through.** It previously loaded every task ever
linked to any goal, unbounded — the same failure mode as the `getEventOptions()` caveat,
growing forever and making the card taller every month. It now loads open tasks plus those
finished inside the window, with the true denominator from a `GROUP BY` count. Folded in
here because this is the query that had to change anyway.

**One earlier decision is narrowed.** The linked-task list was explicitly read-only, on the
grounds that duplicating the checkbox would mean two places to keep in step. Exactly one
row — the soonest-due open task — is now actionable, reusing `toggleTaskStatus` so there is
still one code path for "a task got done". Reporting a stall and then sending the user to
another page to act on it is the shape of advice nobody takes.
