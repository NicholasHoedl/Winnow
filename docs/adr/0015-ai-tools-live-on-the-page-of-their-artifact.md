# ADR-0015: AI Tools Live On The Page Of The Artifact They Produce

**Status:** Accepted
**Date:** 2026-08-15
**Amends:** ADR-0012 (the endpoint's address), ADR-0013 (goals get a page again)

## Context

T9 built the AI companion as a **place**: `/companion`, a two-pane page holding all four
jobs — plan a goal, build a routine, read my week, read transactions — with a shared pending
queue and one proposal on screen at a time.

That was the right first shape. One page meant one spine to build and one surface to reason
about while the feature was still proving it worked at all, and a tab in the nav made a new
capability discoverable rather than hidden behind a keyboard shortcut.

It stopped being right for a reason the original design could not have measured: **the tools
were away from everything they act on, and one of them was demonstrably wrong because of
it.**

`buildSummaryMessages` has always accepted a `weekOf`, and `/review` has always parsed
`?week=`. But `/companion` had no idea which week you were looking at — it was a different
page — so it never sent one, and **every summary narrated the current week**. Step back three
weeks on the review, ask the companion to read it, and you got a confident paragraph about
this week's figures under last month's heading. Nothing threw, nothing was logged, and no
test caught it. The tool was missing context that the artifact's own page has for free.

Three smaller frictions pointed the same way. Applying a plan navigated you to `/activity`,
because the milestones it created were not on the page you were standing on. The pending
queue mixed four kinds, so opening `/companion` handed you whatever was newest rather than
what you came for. And the nav had to gate a whole tab on `aiReady`, because `/companion`
404s when the feature is unconfigured — which made the AI setting a fact the **shell** had to
know, on every authenticated render.

## Decision

**Each AI job lives on the page of the artifact it produces.**

| Job | Page | Artifact |
|---|---|---|
| Plan a goal | `/goals` | milestones, habits and setup tasks on a goal |
| Build a routine | `/activity/routines` | a routine and its items |
| Read my week | `/review` | a narrated week |
| Read transactions | `/budget` | transaction rows |

`/companion` is **deleted**. There is no central AI page, no AI nav tab, and nothing in the
nav varies by whether a provider is configured.

Three properties follow, and they are the point rather than side effects:

1. **A tool has its page's context for free.** `/review` knows its own `?week=` and passes
   it, so the summary narrates the week on screen. This is the bug above, fixed by the
   arrangement rather than by remembering to plumb a parameter.
2. **Applying does not navigate.** `useProposal`'s `onApplied` is optional; a page that is
   already the artifact's home passes none and refreshes in place, leaving you looking at
   what you just made.
3. **Each page gates its own tool on `aiReady`,** so `/goals`, `/activity/routines`,
   `/review` and `/budget` all exist regardless. Goals are not an AI feature. The `(app)`
   layout no longer reads the AI settings at all.

**`getPendingProposals(kind)` is what makes it safe.** Each page asks for its own kind, so
`/goals` cannot auto-open a pending import — the view opens `pending[0]`, and "newest" says
nothing about which page you are on.

## What is shared, and what deliberately is not

**Shared:** `useProposal()` (state, generate, apply, discard), `ToolPanel` (the titled card
around a job's input), `RefinementBox`, and the four proposal renderers in
`components/companion/`.

**Not shared:** the job's own inputs, the refinement request body, and where to go after
applying. Those differ per kind and per page, and pulling them into the hook is how a shared
hook becomes a switch statement with a hook wrapped round it.

**Not shared, and load-bearing:** `ToolPanel` wraps the INPUT side only. The four renderers
draw their own header, body, footer and Discard/Apply, and differ enough in the middle that a
generic wrapper around them would end up parameterised into unreadability. That was decided
in T13 Phase 2 and is worth keeping.

## Consequences

**Discoverability changes shape, and this is the real cost.** `/companion` advertised the
whole feature in one place: one tab, four jobs, obvious. Now each tool is only visible to
someone already on the relevant page, and there is no single screen that says "this app can
do these four things". The mitigation is that each tool is where you would be standing when
you wanted it — but a user who never visits `/review` will not discover that it can narrate a
week. **If this proves to be a problem, the fix is a mention in Settings or an onboarding
note, NOT a central page.** Bringing back one page to list the tools would reintroduce
exactly the separation this ADR exists to remove.

**Four surfaces to keep in step instead of one.** Phase 2 existed specifically to shrink
this: the shared spine means a change to how proposals work is one edit, not four. What is
genuinely four-fold is the panel placement and the per-kind request body.

**Tools now share pages with lists, which collides in tests.** `getByRole`/`getByLabel` match
substrings, so a `<section aria-label="Plan a goal">` matches a lookup for "Goal", and a
proposal's "Discard" matches a goal card named "…discard…". Locators on these pages need to
be exact or role-scoped. Three specs failed this way on the first run.

**The endpoint moved to `POST /api/companion/generate`** (ADR-0012's amendment) because four
pages call it, and an endpoint addressed by one page's route segment is a lie once that page
is not the only caller — and a falsehood once it is deleted.

**`revalidateProposal` is now the feature's shape in code.** The kind→path map says where
each artifact lives, and `routine` points at `/activity/routines` rather than `/activity`:
running a routine creates tasks, but APPLYING a proposal creates the routine.

## What was rejected

**Keeping `/companion` as a fifth surface** — an index of the four tools. It reads harmless
and is not: two places to run the same job means two code paths to keep in step, and the one
that lacks the artifact's context is the one that produced the `weekOf` bug.

**Putting the routine builder on `/activity`,** which is what the T13 plan literally said. A
routine's artifact is a routine, and routines are listed, created and edited on
`/activity/routines`. `/activity` is the task list; the builder there would have reproduced
the exact separation this ADR removes, one page over.

**A single "AI" section in Settings that runs the jobs.** Settings is where you configure a
provider, not where you work. This is the same mistake as `/companion` with a worse address.
