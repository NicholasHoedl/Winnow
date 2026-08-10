# ADR-0013: To-dos And Goals Merged Into One Activity Page

**Status:** Accepted (T10a, extended by T10b)
**Date:** 2026-08-06
**Amends:** nothing structural. It does retire two of the app's seven original nav routes,
and it narrows ADR-0010's surface — momentum is still a separate reading, but it is no
longer shown as a sentence on every goal.

## Context

`/todos` and `/goals` were both top-level nav entries from the first tranche. T2 gave
`tasks` a nullable `goalId`, and T8 built goal momentum on top of it: a goal counts as
moving when its linked tasks get finished.

So by T9 the two pages were describing the same rows from opposite ends, and each had grown
a compromise to cover for the split:

- The goal card carried a **read-only list of its linked tasks**, because otherwise a goal
  told you nothing about the work underneath it. T5a then made exactly **one** row in that
  list actionable — the next one due — on the reasoning that telling you a goal had stalled
  and then sending you to a different page to do something about it is the shape of advice
  nobody takes. That was a compromise, and it was documented as one.
- `revalidateTaskViews()` in the todos module revalidated `/goals` as well as `/todos`,
  because a task write changed both pages.
- The bottom nav had been **full at seven items** since T7a, with no room for anything new
  and a documented requirement that an eighth entry needs a More sheet or a scroller first.

## Decision

**One route, `/activity`.** The task list is the spine; goals are a rail beside it.
Selecting a goal filters the list to that goal's tasks.

The selection lives in the URL as `?goal=<id>`, written with `history.replaceState` rather
than a router navigation. Every route in this app is dynamic (`auth()` reads cookies) and
Next's client router cache uses staleTime 0 for dynamic routes, so `router.replace` would
round-trip to the server on every filter click for data that did not change. `replaceState`
rather than `pushState` because this is a filter, not navigation: Back should leave the
page, not walk out through every goal you clicked.

**The rail is two components, not one responsive one.** A column on desktop, a horizontal
chip scroller on a phone. 375px cannot spare a sidebar, and stacking the full rail above the
list would push the tasks off the fold — which is the one thing the page exists to show.

**A goal's detail — milestones, edit, delete — moved into a dialog**, because a 280px rail
has no room for an add-a-milestone form. There is no goal *page* anymore.

**The linked-task list is gone**, and with it the single-actionable-row compromise. The
tasks are right there, all of them checkable, sortable and editable. A read-only copy inside
the dialog would be a second place to keep in step.

**The freed nav slot stays free.** Six entries. An eighth was the problem; a seventh is not
an invitation.

> **Reversed 2026-08-06, by the user, immediately after T10b.** The Companion took the slot:
> `/companion` is now the second nav entry, directly after Activity. The reasoning above was
> about not spending the slot *by default* — not about refusing to spend it on something
> asked for. The bar is back at seven, which is the measured ceiling, so the next addition
> faces the original problem again: a More sheet or a scroller first.
>
> The tab is **conditional**. `/companion` renders nothing unless the companion is
> configured (ADR-0011; from T11 that is a Settings page, not an env var), so it is spliced
> in at render by `navItemsFor(companionEnabled)` rather than living in the static
> `navItems` — a permanent dead tab for anyone who never turned the feature on would be
> worse than no tab at all.

## Consequences

`/todos`, `/goals`, `/todos/routines` and `/todos/habits` are **permanent redirects**. This
is an installed PWA and both were top-level nav entries for the app's whole life, so they
are the two most likely URLs to be bookmarked, pinned, or sitting in a home-screen shell's
history on a phone this repo cannot reach to fix. Same reasoning as `/today` in T5.

The palette keeps `t` and `g` as aliases for `/activity` alongside the new `a`. They
addressed To-dos and Goals for years of muscle memory; sending them somewhere sensible costs
one map entry.

Goal search results improved rather than degraded: `/goals` could only drop you on a page of
every goal, where `/activity?goal=<id>` opens with the list already scoped.

`revalidateTaskViews()` lost a path. `getGoalOptions()` lost a caller — the page derives the
task dialog's goal picker from `getGoals`, which returns every goal anyway, so `/activity`
runs one query fewer than `/todos` did.

**Momentum says less on the rail than the goals page said.** The full sentence ("3 finished
in the last week") is in the detail dialog; the rail draws only the exception, as a
"Stalled" badge, and an icon otherwise. ADR-0010's reading is intact — the arithmetic is
unchanged — but a glance now gets a flag rather than a figure.

**Two things this makes harder, stated plainly.** Goal drag-reordering happens in a 280px
column, so the targets are smaller than the old two-column card grid; and the rail is not
reorderable on mobile at all, because dnd-kit's pointer sensor and a horizontal touch scroll
want the same gesture and the scroll is the one needed every time.

## T10b: the rest of the rail, and the rule that governs it

Routines and habits joined the rail as two more blocks. Deciding what each block may *do*
needed a rule, and it is the same one that removed the goal card's linked-task list above:

> **The rail never offers an action the task list beside it already offers.**

So a routine gets a **Run** button — running a routine *creates* tasks, which the list
cannot do for you — and a habit gets **no tick at all**, because today's habit instance is
already a checkable row in that list. Adding a checkbox to the rail's habit row would
recreate, in the same tranche, exactly the two-places-to-keep-in-step problem T10a spent its
effort removing. The rail shows the streak and the recent cycles; the tick lives in the list.

On a phone the two blocks become links rather than content. Routines and habits are lists,
not single readings, and a second horizontal scroller under the goal chips would be
unusable — so they stay the pages they already are, one tap away.

Two consequences worth knowing. The Activity header lost its Routines and Habits icon
buttons, because the rail and the mobile shortcuts both reach those pages and three routes
to the same place is two too many. And `/activity` now calls `getHabits()` on every render
with the **same 90-day window** the habits page uses — a shorter window would be cheaper and
would make the rail's streak number disagree with the page it links to, which is a worse bug
than a slower query on a single-user app.

## What was rejected

**Tabs on one route** — the lowest-risk option, and a filing change rather than a design
one. Both views would have moved across nearly untouched, nothing would have become more
intuitive, and reaching goals would have cost an extra click.

**Tasks grouped under their goal**, with an Unassigned group. The most literally "merged"
option, and the wrong one for this data: most tasks have no goal, so Unassigned would
dominate the page and push goal work below the fold.

**Side-by-side columns with no relationship** — readable, but it halves the width each gets
and collapses to the tabs option on mobile anyway.
