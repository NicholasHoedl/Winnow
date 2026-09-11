# ADR-0027: The Fold List Leaves The Dashboard

**Status:** Accepted
**Date:** 2026-09-10
**Amends:** ADR-0016 (the folded-cards preference now holds a card that is not on the
dashboard)

## Context

T29 put the body-weight trend chart directly under the weigh-in card on `/meals`, so a
weigh-in could not be logged without the trend being seen. It worked: the chart is now the
tallest thing on the page, above the quick-add bar and the day's log, on every visit. The
ask was to be able to collapse it.

ADR-0016 already settled what a remembered fold is in this app: a preference the server
reads, not `localStorage` — so the page renders folded rather than flashing open, and a
phone and a desktop agree — written atomically, through a client shell that holds
server-rendered children so the fold is instant and the chart stays a server component.
Every one of those reasons applies to `/meals` as it did to `/`. The only new question
was whether the weight chart should be a key in the dashboard's list or something of its
own.

## Decision

**The same list, the same shell, one more key.** `DASHBOARD_CARDS` gains `"weight"`;
`WeightTrendSection` renders inside `DashboardCard` with that key and the title "Weight
trend"; the chevron writes `dashboard_collapsed` through `setDashboardCard`, which now
revalidates `/meals` as well as `/`. No migration, no settings UI, no second mechanism.

**The readout moves from the heading into the body.** The section's heading used to carry
the trend, the rate and the goal phrase. A heading that folds away with its body is no
heading, and the shell's title is a string because the chevron's label is built from it.
The readout is now the chart's caption, and the weigh-in card directly above quotes the
same figures, so a folded card takes nothing off the page.

**Nothing is renamed.** The column, the constant and the shell all say "dashboard", and
the list now holds a meals card. Renaming the column is the no-TTY migration dance for a
cosmetic gain; renaming the constant and the component churns six call sites for the
same. The names say where the list started. This ADR is the note that says where it
stops: nowhere in particular.

## Consequences

- The weight chart's fold is per account and survives a reload, and `weight-trend.spec`
  proves that the way `dashboard-collapse.spec` does — after a `goto`.
- A folded chart is a preference left behind for every later spec, so the spec unfolds it
  at the end and in `afterEach`, and does so _before_ deleting the weigh-ins: with no
  weigh-ins there is no card, and nothing to unfold.
- `loading.tsx` for `/meals` cannot know the fold, as ADR-0016 already accepted for `/`.
- Adding a foldable card anywhere in the app is now the ADR-0016 registration and nothing
  more: a key in the list, a `DashboardCard` around the content, `collapsed` read from the
  preference by the page.

## Alternatives considered

- **A boolean column of its own.** Exactly the per-card scheme ADR-0016 rejected, and a
  migration for one bit.
- **A second list for `/meals`.** Two columns holding the same shape for the same
  purpose, differing only in which page reads them.
- **`localStorage`.** Rejected in ADR-0016 for a page opened every day; `/meals` is
  opened every day.
- **Hide the chart with the tracking switch.** Already possible (T29), and not the ask:
  the chart should be a chevron away, not a settings page away.
