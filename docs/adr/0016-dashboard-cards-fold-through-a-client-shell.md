# ADR-0016: Dashboard Cards Fold Through A Client Shell Holding Server Children

**Status:** Accepted
**Date:** 2026-08-16
**Amends:** ADR-0004 (adds a preference that is not a scheduler substitute, but follows its
lazy-on-read spirit — nothing is computed until the dashboard is rendered)

## Context

The dashboard is the landing page and it has grown. T15 merged goals and habits into one
uncapped card; T16 merged three dated cards into Slate, which caps at `52svh` and scrolls.
Column one now holds two of the tallest things on the page. The ask was simple: let each
card be folded away, and have it stay folded.

"Stay folded" is the whole difficulty. `ARCHITECTURE.md` already states the trade for the
dashboard's month/week toggle — it lives in the URL so the server renders the chosen view,
and _"making it stick means a `user_preferences` column so the server still knows it up
front."_ A collapse stored in `localStorage` would flash every card open before folding it,
on the one page opened most often, and would make a phone and a desktop disagree about the
same account's layout.

So the state is a preference, read on the server. That settles where it lives and creates
the real problem: **who owns the fold at render time.**

## Decision

### One column holding a list, not a boolean per card

`user_preferences.dashboard_collapsed` is `jsonb`, holding the keys of folded cards, and it
is the first preference here that is not one column per setting.

The dashboard's card set churns faster than any other surface in the app. In one working
session: T13 deleted three dashboard cards, T15 merged two into one, T16 merged three more
into one. A `slate_collapsed` / `goals_collapsed` / `tomorrow_collapsed` scheme means a
migration every time that happens, and a dead column left behind on every deletion — the
`notes` removal needed migration `0035` to drop a table for exactly this reason.

A list costs nothing when a card is added and degrades silently when one is removed.
`parseCollapsedCards` filters what comes back against `DASHBOARD_CARDS`, so a key for a card
that no longer exists stops matching instead of erroring, and deleting a card stays a
one-file change.

The cost, stated plainly: this column cannot be queried by content and has no per-key
constraint. It is read whole and written whole, by one writer, for a single user — none of
what a normalised shape would buy is worth having here.

### A client shell holding server-rendered children

`DashboardCard` is a client component. Its `children` are server-rendered RSC output passed
through the boundary, and it decides whether to render them.

The obvious alternative — a small client chevron embedded in each otherwise-server card —
does not work, and the reason is worth writing down because it looks like it should.
Nothing on the client would own the card's content, so folding could only happen by writing
the preference, running `revalidatePath("/")`, and waiting for the whole dashboard to
re-render and stream back. Every fold would be a network round trip on the most-visited page
in the app, for a control whose entire job is to feel like moving furniture.

Holding the children in a client shell gives an optimistic fold with no round trip, and —
this is the part that makes it worth the shape — **`CategoryBars` and the stat tiles stay
server components.** They are not marked `"use client"`, they are not serialised into the
RSC payload as component code, and they keep rendering on the server exactly as before. The
client only decides whether to show what the server already produced.

`useOptimistic` seeded from the prop means a failed write un-folds the card by itself rather
than leaving the UI asserting something the database disagrees with.

### The write is atomic, because the optimistic fold makes it have to be

This was first written as a read-modify-write, on the reasoning that only two tabs racing
could lose an update — a fair cost for a cosmetic preference on a single-user app.

That reasoning was wrong for a reason worth keeping: **the fold being optimistic is what
makes one tab enough.** The UI moves on in about a millisecond, so nothing stops a person
folding a second card while the first write is still in flight, and the second action would
then read a row that does not yet know about the first. One tab, one person, no unusual
timing required.

Both branches are now single statements — `|| '["macros"]'::jsonb` to fold, `- 'macros'` to
unfold — evaluated against whatever is stored at the moment they run.

An honest note on how this was found, because the record is more useful than the story:
`dashboard-collapse.spec.ts` failed, the read-modify-write was blamed, and making it atomic
did **not** fix the test. The actual failure was in the spec — it navigated on the back of an
optimistic assertion and aborted the request in flight. The atomic write is still the right
shape for the reason above, but it was not what that test was failing on, and it should not
be remembered as though it were.

A consequence worth stating: `||` can append a key that is already there, so
`parseCollapsedCards` deduplicating on read is now **load-bearing** rather than defensive.
That function was written with a dedup test on general principle; it is the reason the atomic
form is allowed to be this simple.

### The shell owns the header

All six surfaces hand the shell a `title`, an optional `icon`, and their existing links as
`actions`. This settles an inconsistency T16 surfaced rather than creating one: `CardTitle`
renders a `<div>`, so Slate carried a hand-rolled `<h2>` to satisfy its e2e contract while
three other cards had no heading at all. Every card now has a real `<h2>`, and the body is
the `region` that heading names — which is what keeps
`getByRole("region", { name: "Slate" })` resolving.

`title` is a **string**, not a node, because the chevron interpolates it into
"Collapse X" / "Expand X". The calendar needs its heading to be the month it is showing —
both because a calendar that does not say so is useless, and because
`dashboard-calendar-view.spec.ts` counts the `main h2`s matching a year and an en-dash — so
it passes a separate `label="Calendar"` for the control.

### The stat tiles stopped being whole-tile links

`StatShell` was a single `<Link>` wrapping the entire tile. A collapse chevron is a
`<button>`, and a button inside an anchor is invalid per the HTML content model — in
practice, clicking the chevron would navigate as well as fold. The link moved to the
header's arrow icon, where the affordance already pointed.

This is a real regression in click target, from a whole tile to a 16px icon, and it is the
one part of this change a user could reasonably dislike. It was chosen over the alternative —
one chevron folding both tiles under an invented "Today's numbers" heading — because the two
tiles have separate subjects and separate destinations, and grouping them would have added
chrome in order to remove chrome.

## Consequences

### Accepted costs

**`loading.tsx` cannot know what is folded.** A route-level skeleton has no data access, so
it will always reserve full height. Fold four cards and the skeleton is followed by a much
shorter page — the jump that file exists to prevent, returning in a narrower form. Solving
it means moving the skeleton inside the page behind Suspense, which is a larger change than
this feature justifies.

**A folded card is still fetched.** `page.tsx` runs every query regardless — they sit in one
`Promise.all`, and skipping them would mean the preference deciding what the server reads,
which is a much larger claim than "what does this page show". Folding is presentation.

### What it buys

Adding a card to `DASHBOARD_CARDS` is the whole registration. There is deliberately **no
settings UI**: the chevron on the card is the only control, so there is no second surface to
keep in step and no way for the two to disagree.

## Alternatives rejected

- **`localStorage`.** Flashes every card open on the most-visited page; splits one account's
  layout across devices. The exact failure the `?calendar=week` idiom was designed around.
- **Ephemeral state, resetting each visit.** A dashboard you re-fold on every navigation is
  worse than one that never folded.
- **A boolean column per card.** A migration per dashboard change, and a dead column per
  deletion, on the surface that changes shape most often.
- **A settings section listing every card with a toggle.** Further from the problem than a
  chevron on the card itself, harder to undo, and a second writer for one column.
- **Hiding a card outright rather than folding it.** With no header stub left behind there is
  nothing to click to bring it back, which forces the settings section above into existence.
