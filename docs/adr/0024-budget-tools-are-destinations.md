# ADR-0024: The Budget Section's Tools Are Destinations In A Strip

**Status:** Accepted
**Date:** 2026-09-10
**Amends:** ADR-0020 (its consequence that "Meals and Budget keep their ⋮ menus")

## Context

`/budget` was one page holding everything the section does: the month's stats, the
by-category bars, quick add, the filtered ledger, the AI import, an income-and-savings
ring and six months of bars — in one column, in that order — with the category manager
and the budgets editor in an unlabeled ⋮ menu beside the Add button. Reaching the charts
meant scrolling past the ledger; setting a budget meant knowing which glyph hid a menu.

ADR-0020 had said this was fine: "a page with two secondary actions and no sub-routes is
what that pattern is for." Seen next to the Activity strip, the user asked for the same
treatment here — the components that sit together on the page separated the way Tasks,
Habits, Routines, Lists and Repeating tasks are.

## Decision

**A Budget sub-navigation — Transactions · Budgets · Categories · Trends — under the
heading of every page in the section.** The same pill strip Activity and Settings use,
with the active pill lit; the strip is also the way back.

- **Transactions, `/budget`, is the hub**: the month's stats, quick add, the filtered
  ledger and the Add button, and the AI import under the ledger, since ADR-0015 puts a
  tool on the page of the rows it makes. The by-category bars leave for Budgets, so the
  hub is the ledger the way the Tasks page is tasks.
- **Budgets, `/budget/budgets`**: the bars — how the month stands against its limits —
  and under them the "Set budgets" dialog's body as the page's form. Two blocks rather than
  one table with an editable amount beside each bar; that table is the better shape and a
  follow-up, and this tranche re-homed what existed.
- **Categories, `/budget/categories`**: the "Manage categories" dialog's body as a page.
- **Trends, `/budget/trends`**: the two charts, for the month in view.

**The month rides on the pills.** The section is read one month at a time, and a pill that
dropped you back to this month would make "switch page, pick the month again" one gesture
too many. Categories reads no month and carries it anyway, so a round trip through it keeps
what the other pages were showing.

**The month navigation belongs to the section.** It moved from the ledger into the shared
header, building its links from the current path, so moving a month on Trends stays on
Trends.

**Not a `layout.tsx`**, for ADR-0020's reason: the hub's primary action opens the hub's
dialog, and a layout has no way to take it. Each page renders `BudgetHeader`, and its
`loading.tsx` renders the same, so the heading and the strip hold still while content
waits.

## Consequences

- One list, `BUDGET_PAGES` in `components/shared/budget-pages.ts`, feeds the strip and the
  command palette, as the Activity and Settings lists do. The palette lists the three
  sub-pages as "Budget · Budgets" and so on: alone, "Trends" finds nothing.
- Every budget action revalidates all four paths through `revalidateBudget`, since
  revalidating `/budget` never reaches its children.
- The hub runs one query fewer (the trends); Budgets and Trends each run their own.
- The suite's `pageAction` helper is Meals-only now. `budgets-dialog.spec` became
  `budgets-page.spec`; the category-rename and trends specs go to their pages; `_layout.ts`
  sweeps the three new routes at every width; `budget-tabs.spec` mirrors
  `activity-tabs.spec`.
- Four pills wrap to two rows at phone width, as Activity's five do. That costs the ledger a
  row above the fold, which is the visibility the strip is for.
- Meals is now the one page left with a ⋮ menu. ADR-0020's argument for the menu pattern
  still holds there: two secondary actions and no sub-routes.

## Alternatives considered

- **Tabs on one route, with the URL untouched.** ADR-0013 rejected that for merging goals
  into tasks and ADR-0020 kept the rejection: a pill that does not navigate cannot be
  bookmarked, refreshed or returned to, and the month param would have had to be reasoned
  about twice.
- **A Recurring pill**, listing the repeating-transaction rules the way Repeating tasks
  lists its rules. There is no such list today and no query for one — a rule is managed
  through its instances — so it is a feature, not a move. Deferred to its own tranche.
- **Keep the bars on the hub.** They describe the month the ledger shows; but they are the
  limits' own view, and a Budgets page without them would be a form with nothing to
  measure against.
