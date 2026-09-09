# ADR-0019: The Monthly Budget Is A Standing Figure, Not A Row Per Month

**Status:** Accepted
**Date:** 2026-09-08
**Relates to:** ADR-0017 (account balances deferred — this is the "spending tool" it
defends), ADR-0011 (the app does the arithmetic; the model is told the figures)

## Context

Budgets were a collection of category limits, and the month's "total budgeted" was those
limits added up. That is not a total. Rent is a fixed amount nobody sets a limit on;
utilities "are what they will be"; so the categories that get a limit are the discretionary
ones, and their sum is a ceiling on part of the month presented as a ceiling on all of it.
The dashboard card and the weekly review both said "spent of $X" against that sum, and a
month that was comfortably under its real budget could read as over.

The ask was one figure for the month. The question was how that figure lives when
`budgets` is keyed `(user, category, period_month)` — a row per category per month.

## Decision

**One table, `monthly_budgets (user_id, effective_from, amount_cents)`, effective-dated.**
The total in effect for month M is the latest row with `effective_from <= M`. It is set
once and stands until it is changed; a change starts a new row from its month, and every
earlier month keeps the figure it was measured against.

This is the shape `macro_targets` already has, chosen there for the same reason: a single
mutable row would re-score history every time it changed, and a closed interval needs two
writes per change and can grow gaps or overlaps that no constraint catches. "Greatest start
not after M" is one indexed read off the unique, and unambiguous.

**A 0 row means "no total from this month on".** Zero is the app's idiom for an unset
budget everywhere (`budgetedCents > 0`, `totalBudgetedCents > 0`, a macro target of 0 means
"not tracking it"), so no consumer gained a null path — and an explicit 0 row is what
lets the total be cleared from March without January's row going with it.

**`MonthSummary.totalBudgetedCents` became "the total when one is set, else the category
sum".** Every "spent of $X" reads that one field, so the dashboard card, the review's
Money card and the first-run guard did not change at all. A total wins over the sum
outright rather than combining with it: the categories are limits on parts of the month
and the total is a limit on all of it, so adding them would count the budgeted part twice.
`monthlyBudgetCents` was added beside it for the surfaces that need to know which they
got — the dialog, the page header's stat, the trend chart's line, and the companion.

**`setBudgets` writes the total only when it differs from the figure already in effect.**
A January total stands for March by there being NO March row, and the dialog sends the
total back on every month it is saved in. Without the check, every save would pin a row to
its month and a later change would stop carrying forward.

**The companion's month-to-date line is gated on a total, never on the category sum.**
For the reason in the Context: with categories alone, "of $1,230 budgeted" would have the
model call an under-budget month over. And it is month-to-date rather than the week's
spend over the month's budget — the money line is the week, a budget is the month, and
`getRangeSummary` already refuses that slice for the review.

## Alternatives considered

**A row per month, mirroring category budgets, carried forward by "Copy last month".**
Exact per-month record and consistent with the existing model, at the cost of a click
every month — and the figure this exists for is precisely the kind you commit to once.
Rejected for the user's own framing of it ("rent and utilities will be what they will be").

**A nullable `category_id` on `budgets`, NULL meaning "the whole month".** No new table.
But NULLs are distinct in a unique key, so the existing `(user, category, period_month)`
unique would not stop two "whole month" rows for one month; and a per-month row cannot
stand for the months after it, which is the property the standing figure is for.

**A `total_budget_cents` column on `user_preferences`.** One value, no history: changing
it would re-score every month already lived, which is exactly the failure `macro_targets`
was moved away from.

## Consequences

- The first migration since T23 (`0041`). The runbook's §4 temporary-port step applies to
  the next deploy; a rebuild alone does not run it.
- `monthly_budgets` is a 27th user-owned table: the export, clear-all and the backup count
  each name it (`coverage.test.ts` would have failed otherwise), and the dev seed writes a
  standing row three months back so the chart's line has a gap to show.
- The dashboard's "of $X" still shows the category sum when no total is set — exactly what
  it showed before, with the same weakness the total exists to fix. Setting a total is the
  remedy; nothing about the sum was changed.
- The trend chart's budget line is a gap, not a zero, for months before the first row:
  `BarChart` grew an `overlay` whose points can be null for that reason.
