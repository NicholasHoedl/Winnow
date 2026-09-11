# ADR-0029: The Phone Carries The Daily Four, And More

**Status:** Accepted
**Date:** 2026-09-11
**Amends:** ADR-0013 (the bar's seven slots as its "measured ceiling"), ADR-0020 and
ADR-0024 (section strips that wrap onto a second row on a phone)

## Context

The UX review's first pass judged navigation by two principles: Jakob's law, that people
expect an app to work like the others they use, and Hick's law, that every extra option at
a frequent decision costs time. Pass 0 had ranked the flows by how often they are used:
tasks, the dashboard, habits, food and transactions every day; goals, the calendar, the
review and budgets weekly; routines, repeating rules, categories and settings rarely.

The phone's tab bar held all seven destinations, labels at 0.65rem so they would fit.
ADR-0013 recorded seven as "the measured ceiling": the most that physically fit a 375px
bar, which was a statement about space rather than about reading it. Both platforms the app
runs beside are explicit here. Material's navigation bar is for three to five destinations,
and past five it says not to use one at all. Apple's guidance is three to five tabs, with
the overflow moved into a More tab.

The phone header carried Search, a Settings gear and the theme toggle on every screen — two
rare choices among three, the toggle drawn as a bordered button unlike its neighbours. And
the section strips on Activity, Budget and Settings wrapped: five pills into two rows with
"Repeating tasks" alone on the second, four into a two-by-two block, seven into two rows.
ADR-0020 and ADR-0024 accepted that as the price of a strip the layout sweep could measure.

## Decision

**The bar holds the four daily destinations and More.** Dashboard, Activity, Budget and
Meals, in the sidebar's order, then More. More opens a sheet from the bottom listing Goals,
Calendar, Review and Settings; it is lit while you are on one of them, as a More tab is on
iOS, and the sheet marks which. The desktop sidebar keeps all seven.

**The placement lives on the one list.** Each entry in `navItems` carries `phone: "tab" |
"more"`; the tab bar and the sheet are derived from it, and Settings joins the sheet as
`SETTINGS_ITEM`. A unit test holds every destination to exactly one place and the bar to
five slots, so a destination cannot go missing from a phone or turn up twice on one.

**The phone header keeps the brand and Search.** Settings moved into More, with a label.
The theme toggle left the header; the Appearance page has always had it. The desktop
sidebar keeps its gear and its toggle, where they sit out of the way.

**Section strips are one row that scrolls.** One shared `PageTabs` draws all three, with
the lit pill scrolled into view on arrival — the single way a scrolling strip can hide where
you are. It names `overflow-x-auto` in its class list, which the layout sweep reads as a
deliberate scroller; the check the sweep cannot make, that the strip is one row with the
current page in view, is `navigation.spec.ts`'s now.

**The rest of the pass, for the record.** Review's week control takes the shape Meals and
Budget already use: chevrons around a centred label, a date jump, and a link back to this
week. Goals and Calendar put their primary action to the right of the title, as Activity,
Budget and Meals do, with descriptions and view toggles beneath. The palette lists its
create actions most-used first.

## Consequences

- **Goals, Calendar and Review are two taps on a phone instead of one.** They are the weekly
  tier, and each stays one tap from the dashboard: its Review and Add event buttons, the
  calendar card's link and the goals card.
- **Labels grew to `text-xs`** with the room five slots leave, and More's rows are full
  width and at least 48px tall.
- **The shadcn Sheet joins `components/ui`**, from the registry's base-nova style with the
  same import rewrites the CLI makes; nothing was hand-built.
- **A scrolling strip can clip its last pill at the edge.** That clipped pill is the cue that
  there is more, which is how scrollable tabs read on both platforms; the lit one is always
  brought into view.
- **Specs**: `navigation.spec.ts`'s seven-tab measurement became five slots with More, plus
  the sheet and the strips; `nav-items.test.ts` pins the derivation.

## Alternatives considered

- **Keep seven, shrink further.** It fits, which was the old argument, and it is the one both
  platforms tell you not to make.
- **Five tabs with Goals instead of Budget.** Goals sat next to Activity for a reason, but
  Pass 0 measured transactions as entered when they happen and goals as weekly.
- **A hamburger menu for everything.** Hides the daily four as well as the weekly three, the
  opposite of what the tiers say.
- **Wrapping strips with shorter labels.** "Repeating" instead of "Repeating tasks" gets
  Activity to one row today and loses it again with the next page.
