# ADR-0022: A Due Date Is A Day Or A Deadline, And The Slate Shows Only What Is Tracked

**Status:** Accepted
**Date:** 2026-09-09
**Extends:** the Slate rules T16 recorded in `HANDOFF.md` §2 (no ADR of its own)

## Context

Every due date was read the same way. `buildSlate` previewed a dated task in a band for
its day — "Tomorrow", "Sat 23" — out to the horizon, put it in Later beyond that, and moved
it into Today when the day came. That is the right shape for one thing a date can mean and
the wrong shape for the other. "Fill in the dentist paperwork, Tuesday" is a day: it wants
doing on Tuesday and is noise before it. "Renew the passport by the 30th" is a deadline:
the whole point of writing the date down is to be reminded of it _before_ the 30th, and a
row that surfaces a week out, or on the day, has missed that point. The user's words: a
deadline should be on the Slate _from the moment it is created_, marked, and on its day the
Slate should say that the day has come.

The same card drew every event of today and tomorrow whether or not it was highlighted, and
only applied the flag from the day after. So on the two days that matter most the flag
bought nothing, and the card read as a second calendar under the first one.

## Decision

**A due date binds one of two ways, and the task says which.** `tasks.due_kind` is an enum
`on | by`, default `on` (migration `0043`).

- `on` is a day. The task appears on the Slate on that day, in Today, and nowhere sooner.
  It is not previewed in a band, and it is not in Later.
- `by` is a deadline. The task appears in a **Due by** block — between Overdue and Today,
  the same shape as Overdue, in the attention colour rather than the alarm one — from the
  day it is set, with its date, however far off. On the day it joins Today and the row
  says "Due by today". Past the day it is Overdue like any other task.
- Later holds undated tasks only. Whatever has a day has a day it will appear on.

**Only tracked events reach the Slate, on every day including today.** The horizon decides
how far ahead the Slate looks for them and nothing else; a deadline is not subject to it.
The dashboard's month grid still holds every event, so nothing is hidden from the
dashboard — only from the list that is meant to be read top to bottom each morning.

**The flag is called "track", not "highlight", down to the columns.** `events.tracked` and
`event_exceptions.tracked` replace `highlighted`; the migration renames, so every flag set
so far survives, and the importer maps the old name in a backup taken before it.
"Highlight" said what the row looked like; "track" says what the dashboard does with it,
which is the thing the user is choosing.

**Setting the kind.** The task dialog offers "Due on / Due by" under the due date, shown
once a date is set and defaulting to Due on. Quick capture reads "by" — and only
"by" — as a deadline ("pay rent by friday"); "due friday" and "on friday" stay days. The
companion's setup tasks are deadlines, because "buy the shoes" is wanted before the plan's
date, not on it. Everything else that makes a task — the recurrence generator, a routine
run, the goal editor's rows — keeps making days, by the column default.

## Consequences

- **A task due on a later day is not on the dashboard until that day.** That is the request,
  and it is a real loss of the preview T16 kept: someone who used the "Sat 23" bands to see
  the week's tasks now reads them on the Tasks page, whose Upcoming section holds every
  dated task. The Slate is about today.
- **Migration `0043` needs the runbook's port step**, with `0041` and `0042` still waiting
  on the same one. Three undeployed migrations now ride one rebuild.
- **The star on a Slate event row is gone.** It marked the tracked rows among the rest;
  with every row tracked, it marked every row.
- **Two more strings on a task badge** — "By Sep 23", "Due by today" — and one more prop
  on the Slate. The Overdue rule, the routine groups, the done-until-midnight rule and the
  digest are untouched.
- **`parseNaturalDate` returns a `kind`.** Its callers were already destructuring the
  result, so the addition cost nothing; the two quick-add bars differ in what they do with
  it, as they already differed on the date itself.

## Alternatives considered

- **Mark deadlines inside the day bands rather than in a block of their own.** A deadline
  two weeks out is past the horizon and would have no band to sit in — and the request was
  "from the moment it is created", which is a statement about the whole span, not about the
  horizon. A block that ignores the horizon is the honest shape.
- **Make `by` the default for every dated task.** Most tasks the app makes on its own are
  days: a morning routine's steps are for that morning, a weekly repeat is for its week.
  Defaulting them to deadlines would fill the Due by block with things that are not.
- **Keep showing today's events regardless of the flag, and apply "tracked only" from
  tomorrow.** That is T16's rule and the user rejected it on sight: the point of the flag
  is to say what is worth the dashboard's attention, and today is where that matters most.
- **Rename in the UI only and leave the columns.** Cheaper, and the kind of split — one
  word on screen, another in the schema and every backup — that costs a reader a
  translation every time. The user chose the full rename.
