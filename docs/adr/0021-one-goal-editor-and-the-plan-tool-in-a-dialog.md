# ADR-0021: One Goal Editor, And The Plan Tool In A Dialog

**Status:** Accepted
**Date:** 2026-09-09
**Amends:** ADR-0013 (a goal's tasks, and where they may be acted on), ADR-0015 (how the
plan tool is framed on its page)

## Context

`/goals` had grown three surfaces for one job. The **detail dialog** (opened from a card)
held a goal's milestones — tick, edit, add, delete, make-a-task — and its practice — log,
edit, archive, add, delete — with an "Edit goal" button that hopped to a **second dialog**
for the goal's own fields. Above the list, the **plan tool** pinned a goal picker, and
selecting a goal there showed its applied plan as a third editor — "Your plan" — that edited
the same milestones and habits again, plus the goal's tasks, and offered "Re-plan with AI".
The AI proposal itself rendered above the list too.

Each surface was reasoned into existence on its own: the detail dialog is the old goal card
body (ADR-0013), the edit dialog predates it, "Your plan" was the answer to "accepting a
proposal made the panel vanish" (T10). Together they meant the same milestone could be
renamed in three places, a goal's tasks could be managed in exactly one of them, and the
goal list — what the page is for — was never the first thing on the page.

## Decision

**One editor per goal, opened from its card.** Details (the goal's fields, folded until
asked for), progress, practice, milestones, tasks, and Delete — in that order, in one
dialog. Milestones, habits and tasks write as you go, as the detail dialog's rows did; the
fields save as one form, because a title, a date and a number target validate as a set.
The edit dialog is gone; "New goal" keeps a create-only dialog on the same form.

**The plan tool is a button beside New goal.** It opens a dialog to pick the goal and ask;
the proposal opens in a wide review dialog of its own — prune, edit, add, refine, Apply or
Discard — and closes on either decision. Closing it any other way leaves the proposal
pending, and a one-line note under the header offers it again. A proposal already pending
on arrival opens on load, as the panel used to render on load.

**"Your plan" — reopening an applied plan for editing — is gone.** Its job is the editor's:
the rows a plan created are the goal's rows, and the editor holds every one of them.
`getGoalPlan` stays, because it is how the page loads a goal's tasks.

## What this does to ADR-0013

That ADR removed the goal card's task list and defends the removal in strong terms — "two
lists of the same rows drift, and only one of them can be acted on." The Tasks section in
the editor is not the thing it removed. That was a **read-only copy** with, at most, one
actionable row; these are the real rows, addressed by id, renamed and dated and deleted in
place, exactly as the T10 plan editor had done on this page for a month. What the section
deliberately cannot do is **tick** a task: completing one is the Tasks page's and the
dashboard's action already, and a checkbox here would be the second surface for the same
action that ADR-0013's rule refuses. The section links to the Tasks page filtered to the
goal for that.

## What this does to ADR-0015

Nothing structural. The tool is still on `/goals`, the page of its artifact; applying
still refreshes in place rather than navigating; `getPendingProposals("goal_plan")` still
scopes what the page opens. What changes is the frame: a dialog rather than a panel above
the list, which the ADR's own reasoning allows — it wanted the plan to have "somewhere to
land" with room for a full screen of review, and a dialog with the viewport has more room
than a panel sharing it with the list.

One shared piece moves with it. `ToolPanel` wrapped a job's input side and drew the
refinement box beneath it; a job with no panel has no input side to wrap, so `PlanProposal`
takes the refinement box as a slot above its footer. The other three tools keep their
panels.

## Consequences

- Fewer surfaces than before: `goal-detail-dialog.tsx` and `plan-editor.tsx` are deleted,
  `goal-dialog.tsx` is create-only, and `goal-form.tsx` is the one copy of the fields.
- The editor is the widest and tallest dialog in the app. The mobile sweep measures it at
  320, 375 and 393px with a task in the fixture as well as milestones and habits.
- A dialog that opens itself on load is more intrusive than a panel was. The escape hatch
  — close it, reopen from the note — is the mitigation, and the pending proposal is never
  lost by closing.
- `e2e/companion.spec.ts` drives the tool through the button and the two dialogs; the
  test for reopening an applied plan became a test that the applied rows are in the editor
  and editable there.
