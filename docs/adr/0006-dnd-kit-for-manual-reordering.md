# ADR-0006: @dnd-kit For Manual Reordering

**Status:** Accepted (T5a-S7)
**Date:** 2026-07-27

## Context

T5a adds manual reordering to tasks (and later goals). This app has a standing preference
for hand-rolling over taking a dependency, and it has held that line in places where doing
so cost real effort:

- The charts are hand-written SVG (`src/components/charts/`) rather than a charting library.
- Date arithmetic is hand-written in `src/lib/date.ts` even though `date-fns` is already a
  dependency for other reasons.
- The month grid is a plain `grid-cols-7`, not a calendar component.

So a new runtime dependency needs an argument, not a preference.

The deciding constraint is **touch**. Winnow is installed as a PWA on an iPhone
(`ARCHITECTURE.md §6`), and:

- **Native HTML5 drag-and-drop does not fire on touch at all.** `dragstart`/`dragover`/`drop`
  are mouse-only on iOS Safari. A native implementation would give a drag affordance that
  silently does nothing on the device the app is mainly used from.
- Hand-rolling pointer-event drag is therefore the only no-dependency alternative that
  works. That means writing hit-testing, auto-scroll, transform animation, and — the part
  that is easy to skip and hard to add later — a **keyboard** path plus live-region
  announcements, since a pointer-only implementation is unusable without a mouse.

## Decision

Take **`@dnd-kit`** (`core`, `sortable`, `modifiers`, `utilities`).

Reordering is scoped to **within a date section**. Dragging a task between sections would
have to rewrite its due date, which is drag-to-_reschedule_ — a different feature belonging
to the calendar tranche. `restrictToParentElement` enforces that physically rather than by
convention, so a row cannot be dropped into a neighbouring section and silently snap back.

The drag handle is a dedicated button, not the whole card. Dragging the card would swallow
the taps that toggle a task, and on touch there is no hover state to disambiguate the two.

## Consequences

- Four packages added, **~30 kB gzipped** of ESM (`core` 22.3 kB, `sortable` 4.7 kB,
  `utilities` 2.4 kB, `modifiers` 0.8 kB — measured, not estimated). This is the app's first
  UI dependency beyond the base-ui/shadcn primitives.

  It is loaded eagerly with `/todos` rather than lazily like the T4 barcode scanner, because
  reordering is an ordinary interaction on that page rather than an occasional one behind a
  dialog. Note the precise First Load JS delta could not be quoted: Turbopack's build output
  no longer prints the per-route table that would show it — the same limitation T4-S7 hit.

- **Keyboard reordering comes for free and is tested** (`e2e/todos-reorder.spec.ts`): space
  lifts, arrows move, space drops. That accessibility story is the second half of the
  justification — it is precisely what a hand-rolled version would have had to build from
  nothing, and precisely what would have been deferred.

  "Comes for free" turned out to be half true, and the T5a-S13 accessibility pass caught
  it: dnd-kit's DEFAULT announcements read out the item's **id**, so a screen-reader user
  heard _"Draggable item 224f524e-d876-4768-8ecb-66bd96ce2638 was moved over droppable area
  224f524e-…"_. With uuid keys that is noise, and shipping it would have quietly voided the
  argument above. `SortableList` supplies its own announcements — _"Picked up Water the
  plants, position 2 of 2"_, _"Moved to position 1 of 2"_, _"Dropped … at position 1 of
  2"_, _"Cancelled. … returned to position 2"_ — and suppresses the spurious over-event
  dnd-kit fires with the item over itself on lift, which otherwise overwrites "Picked up"
  before it can be read.

- **The calendar's drag-to-reschedule (T5b-S6) is a second, differently shaped context,
  not a reuse of `SortableList`.** The feature this ADR deferred turned out to share only
  the sensor configuration. `SortableList` permutes one list and reports `(ids: string[])`;
  a reschedule reports a day and a time. It puts one `DndContext` per instance where the
  grid needs a single context spanning seven droppable columns. It pins items with
  `restrictToParentElement`, which is the very thing that has to be crossed here. And it
  requires `T extends { id: string }`, which occurrences do not satisfy — they have no id,
  and `bucketByDay` hands the same object to every day a span covers, so identity comes
  from `occurrenceKey` instead.

  Two things did carry over, both of them the accessibility parts: a keyboard path (arrow
  keys move a column or a 15-minute slot, via a custom `coordinateGetter`, since the
  sortable one only knows how to walk a list), and announcements written by hand. The grid
  goes further and drives its own live region, because dnd-kit only announces when the
  droppable changes — which here means only when the DAY changes, leaving an arrow-key
  move down an hour completely silent.

- **`DndContext` must be given an explicit `id`, or it breaks hydration.** Left to itself,
  dnd-kit's `useUniqueId` falls back to a MODULE-LEVEL counter for the
  `aria-describedby="DndDescribedBy-N"` it puts on every drag handle. On the server that
  counter keeps climbing for the life of the process; on the client it restarts near zero.
  They can never agree, so every render of `/todos` and `/goals` produced a React hydration
  mismatch — and React's own wording is that it "won't be patched up", leaving the attribute
  pointing at a description element that isn't there.

  That is the second time this dependency has quietly undone the accessibility argument it
  was taken for, and it cost more than the announcements did: in dev React 19 prints the
  whole component tree per occurrence, which buried one verification run in 3.3 MB of output
  and grew the dev server to 11 GB before anyone connected the two. `SortableList` now passes
  `id={React.useId()}`, which is hydration-stable by construction and short-circuits the
  counter. **Any new `DndContext` — the calendar's drag-to-reschedule included — has to do
  the same.** Confirmed by removing the prop and watching the mismatch come straight back.

- `@dnd-kit/core` declares `react >=16.8.0`, which is necessary but not sufficient evidence
  that it works under React 19.2.4. Verified behaviourally at install rather than assumed:
  both the pointer and keyboard paths reorder and persist across a reload.
- Ordering is stored as a plain `sort_order integer` and rewritten wholesale for the
  affected section in one transaction (`reorderTasks`), rather than using sparse or
  fractional indices. A single user's section is small enough that the simpler invariant —
  stored order always equals what was on screen — is worth more than avoiding the writes.
  Same trade `setBudgets` made in T3-S2.

## Alternatives considered

**Move up / move down menu actions.** Zero dependencies, works on touch and keyboard and
with a screen reader, and trivial to assert in Playwright — each row already has an actions
menu to hang them on. Rejected because reordering more than a couple of positions becomes a
sequence of round-trips, and this is the one interaction where direct manipulation is the
whole point. Kept as the documented fallback had dnd-kit not worked under React 19.

**Native HTML5 drag events.** Rejected outright: no touch support, which is the primary
device.

**Hand-rolled pointer drag.** The honest alternative, and rejected on scope rather than
principle — the accessible keyboard path and live-region announcements are most of the
work, and they are the part that would have been cut.
