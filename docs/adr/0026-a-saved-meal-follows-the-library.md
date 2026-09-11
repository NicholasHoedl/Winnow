# ADR-0026: A Saved Meal Is Library Foods That Follow The Library

**Status:** Accepted
**Date:** 2026-09-10

## Context

The meals page had two one-tap ways to log something: a quick-pick chip, which logs one
serving of one recent food, and "Copy a day", which logs everything a previous day had.
Nothing sat between them. A breakfast that is always the same banana and glass of milk
was two taps on two chips, or a quick-add line each, every morning. The ask was to bundle
individual items into a "meal" and log the bundle at once.

The question worth an ADR is what a bundle _is_. An entry in this app is a snapshot: its
figures are copied from the food at log time and never re-read, so yesterday's oatmeal
stays yesterday's oatmeal (`meal_entries`, ADR-0005's arrangement). A saved meal is not a
record of something eaten. It is a standing definition of something that will be eaten
again, and a definition that quietly kept last month's figures for the milk after the
library row was corrected would be wrong in a way nobody would notice.

## Decision

**Two tables, and an item references its library food.** `saved_meals` holds a name and
an optional meal type; `saved_meal_items` holds, per item, a `food_id`, a `position`, a
`servings` count, and the same name, serving and figure columns an entry has.

**An item follows its library food.** While the food exists, everything shown or logged
for the item takes the food's current name, serving and figures; the item contributes only
its servings. Correct the milk in the library and every meal that has it is corrected.
The page resolves every item once, against the library it has already read, so the chip,
the list and the editor show exactly what a tap would write; the log action resolves
again before it inserts.

**The snapshot is only the fallback.** `food_id` is `ON DELETE SET NULL`, so deleting a
library food leaves the item in place with the figures it last had. A meal never silently
shrinks because a food was tidied out of the library, and the undo of that food delete
does not need to know about meals. This is the reverse of an entry, where the snapshot is
the record — the same columns, the opposite standing, and the schema says so.

**Every food in a meal is a library food.** The editor uses the same search bar as the
Log food dialog. A library pick joins the meal as it is; a reference or packaged pick is
saved to the library first and then joins, which is the choice quick add already makes
when it falls through to the reference foods. So a fresh item always has a food to follow,
and the snapshot-only case is reached only by deletion.

**Built where the items are.** "Save as meal" sits beside each section's kcal total on the
day's log and opens the editor pre-filled with that section — a food logged twice becomes
one item with the servings added up. The ⋮ menu's "Saved meals" lists them for editing,
deleting and starting from scratch. One editor serves every way in.

**Logged as one insert, undone as one delete.** A tap on a meal's chip inserts one entry
per item, under the meal's own meal type or, when it has none, wherever quick-added meals
go — the preference the quick-add bar applies. The action returns the new entry ids and
the toast's Undo deletes exactly those, the copy-a-day arrangement, because "remove the
last entry" is the wrong undo for something that added three.

**An edit replaces the items wholesale.** A meal is a handful of rows and nothing
references an item's id, so "what the editor shows is what is stored" costs one delete and
one insert in a transaction, and no diffing.

**Both tables carry `user_id`.** The account export discovers user-owned tables by that
column and the coverage test derives its list the same way. A child table keyed only by
its parent would be exported nowhere, and the guard written to catch a forgotten table
would not see it.

## Consequences

- Migration `0045`, additive only: nothing a running pre-built server queries changes.
- The backup gains two tables; `tables.test.ts`'s exact count moved from 27 to 29, which
  is that test doing its job.
- A saved meal's figures can differ from the entries it logged last week, by design. The
  entries are what was eaten; the meal is what will be.
- A food deleted and then restored by its undo is not re-linked to the items that
  referenced it — they keep their snapshot from then on. The same is true of entries
  today, and for the same reason: the FK nulled the link, and the undo replays a row, not
  a graph.
- The scorer's word lists, the reference portions and the packaged-goods caveats all
  apply unchanged inside the editor: it is the same search bar.

## Alternatives considered

- **Items as a `jsonb` column on the meal.** One table, one row per meal, read whole and
  written whole — the shape ADR-0016 chose for the folded-cards list. Rejected because an
  item points at a food, and a foreign key is the only thing that can keep that pointer
  honest when the food goes; a JSON array cannot be `SET NULL`.
- **A reference and nothing else, `ON DELETE CASCADE`.** No snapshot columns. Rejected
  because deleting a library food would silently remove it from every meal, and the
  food's undo could not put the items back.
- **Snapshot only, never re-read.** The entry model, applied to meals. Rejected for the
  reason in the context: a definition that keeps a corrected figure stale is wrong
  without looking wrong.
- **Typing a meal's name in the quick-add bar.** A small parser extension, left out of
  this tranche so the bar's behaviour stays exactly what its specs pin; the chips are the
  one-tap path the ask was for.
