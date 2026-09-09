# ADR-0020: The Activity Section's Tools Are Destinations In A Strip

**Status:** Accepted
**Date:** 2026-09-09
**Amends:** ADR-0013 (the T10b consequence that removed the Activity header's Routines and
Habits buttons, and the later consolidation of secondary actions behind one ⋮ menu)

## Context

`/activity` holds the task list, and four tools around it: habits, routines, lists and
repeating tasks. Each was reachable, and each from a different hiding place:

- **Habits** — a bare `→` icon beside the HABITS heading of the strip ("Open habits" to a
  screen reader, nothing to anyone else).
- **Routines** — a muted "Routines · 2 →" text link at the head of the Run row.
- **Lists** and **Repeating tasks** — two entries in an unlabeled `⋮` menu.

The `⋮` menu was itself a fix. The header used to carry a row of bare icon buttons, and the
note in `e2e/_menu.ts` records why they went: a phone has no hover, so an icon was the only
thing a touch user ever got, and "repeating tasks" is not guessable from a loop glyph. One
named trigger cost less room and said what everything inside it did. It traded unguessable
glyphs for an invisible drawer, and the user reported the result: managing any of the four
was unintuitive, and reaching them was a matter of knowing where to look.

Three of the four already had a route of their own or were a dialog with nothing but a
list in it. The question was only how to make four tools read as one place.

## Decision

**An Activity sub-navigation — Tasks · Habits · Routines · Lists · Repeating tasks — under
the heading of every page in the section.** The same pill strip Settings uses (modelled on
the calendar's view toggle, wrapping onto a second row on a phone, measured by both layout
sweeps), with the active pill lit, so it is also the way back.

**Lists and Repeating tasks became pages**, `/activity/lists` and `/activity/repeating`,
built from the two dialogs' bodies. All five pills navigate. A strip where three pills
navigate and two open dialogs would lie about what a pill does, and a dialog behind a
labeled button — the cheaper option — would have kept two of the four tools on a different
idiom from the other two, which is the split the user was describing.

**The heading is "Activity" on every page**, the lit pill names the page, and the page's
one primary action ("New task", "New habit", "New routine") sits beside the heading. Not a
`layout.tsx`, though Settings uses one: that action belongs to the page — it opens the
page's own dialog — and a layout cannot take it. Each page renders a shared header instead,
and its `loading.tsx` renders the same header, which keeps the strip still while content
waits.

**The redundant links went with it**: the strip's `→`, the "Routines →" link a hundred
pixels under a pill that says the same, and the sub-pages' "← Activity" links — one of
which had said "To-dos" since T10. The Run row and the habit chips are unchanged: the strip
offers no _action_, so ADR-0013's rule — never offer an action the task list already offers
— is not touched, and the "Track a habit →" empty state stays as the invitation it is.

## What this does not reopen

ADR-0013 rejected "tabs on one route" — for merging **goals into tasks**, where both views
would have moved across untouched and nothing would have become more intuitive. Habits and
routines were already separate routes under `/activity`; this makes them visible, and moves
nothing between pages.

## Consequences

- One list, `ACTIVITY_PAGES` in `src/components/shared/activity-pages.ts`, feeds the strip
  and the command palette, as `SETTINGS_PAGES` does — a page cannot exist in one and be
  missing from the other.
- The Tasks page runs one query fewer: `getTaskRecurrences` fed only the dialog.
- Meals and Budget keep their `⋮` menus. This ADR is about a section with five pages, not
  about the menu pattern; a page with two secondary actions and no sub-routes is what that
  pattern is for.
- The suite's `pageAction` helper lost its two Activity entries; the specs that used them go
  to the pages. `_layout.ts` sweeps the two new routes at every width.
- Five pills wrap to two rows on a phone. That costs the Tasks page a row above the fold,
  and the user asked for exactly that visibility.

## Amendment, the same day: the Tasks page is tasks

Seen with real data, the strip sat directly above the routines row (a Run button per
routine, from T13) and the habit strip (a `+1` per habit, from T12d), and the user asked for
the overlap removed. Both rows are gone from `/activity`.

Each had earned its place under the rail rule — running a routine creates tasks, logging a
habit is not a task — while this page was the only door to either. The strip changed that:
the Routines page, where every routine already has its Run button, and the Habits page,
where every habit already logs, are one pill away. What the strip could not answer on its
own was T12d's argument, that logging a practice is the most phone-shaped action in the app
and needs a surface at every width. The dashboard's practice card is that surface — it logs
through the same `useLogHabit`, at every width — so nothing became unreachable.

Consequences: `/activity` runs two queries fewer (`getRoutines`, `getHabitStrip`);
`habit-strip.tsx` and `routines-line.tsx` are deleted; `getHabitStrip` stays, for the card.
What is lost, plainly: logging a habit without leaving the task list. The specs that logged
from the strip log from the card now, which is also where the phone-width assertion lives.
