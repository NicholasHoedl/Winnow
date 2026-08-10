# Winnow — Architecture

Status: Implemented through improvement-plan tranche T5c-a (iCal export + feed),
plus the dashboard consolidation that folded `/today` in.
Last updated: 2026-08-03

This document assumes SPEC.md. It covers the tech stack and rationale, the
system layout, the data model, the deployment architecture (including the
Tailscale HTTPS mechanism that makes the iPhone-install goal actually work),
the PWA approach, the auth approach, and a proposed folder structure.

Guiding rule throughout: **every choice below has to justify itself for a
single-user, self-hosted, daily-use CRUD app maintained by one person.**
Where a more "impressive" option was rejected in favor of a simpler one,
that's deliberate, not an oversight.

---

## 1. Tech Stack and Rationale

| Layer                        | Choice                                                                                                                         | Why                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                    | **Next.js (App Router)**, full-stack                                                                                           | One codebase, one deployable container, TypeScript end to end, matches the user's existing skill set. See ADR-0001.                                                                                                                                                                |
| Language                     | **TypeScript**                                                                                                                 | Shared types between UI, server actions, and DB schema; catches a large class of bugs at build time with zero runtime cost.                                                                                                                                                        |
| Database                     | **PostgreSQL**, self-hosted in Docker                                                                                          | Real transactions, foreign keys, and constraints — the budgeting module in particular needs correctness guarantees a document store won't give for free. See ADR-0003.                                                                                                             |
| ORM / migrations             | **Drizzle ORM**                                                                                                                | SQL-transparent (thin query builder, not a heavy runtime), migrations are plain readable SQL, types inferred directly from schema. Prisma considered and rejected as the default — see ADR-0003.                                                                                   |
| UI                           | **Tailwind CSS + shadcn/ui**                                                                                                   | Utility CSS with owned, copy-in components (not an opaque dependency) — fast to build with, easy for one person to keep consistent. Detailed visual design (fonts, color, motion) is intentionally **not** specified here; that's a design-phase concern for later in the roadmap. |
| Validation & forms           | **Zod + React Hook Form** with shadcn Form primitives                                                                          | One schema (Zod) shared by both the client form and the server action/route handler — validation logic is never duplicated.                                                                                                                                                        |
| Data fetching / server state | **React Server Components for reads, Server Actions for mutations, TanStack Query only where optimistic UI genuinely matters** | See §1.1 below — this is a deliberate, justified mix, not an arbitrary grab-bag.                                                                                                                                                                                                   |
| Auth                         | **Auth.js (NextAuth) Credentials provider, single account**                                                                    | Light by design — the tailnet is the real perimeter. See §5.                                                                                                                                                                                                                       |
| Testing                      | **Vitest + React Testing Library** (unit/component), **Playwright** (a handful of E2E happy paths)                             | Enough to catch regressions in the business logic that actually has bugs (money math, recurrence, totals) without building a heavy test pyramid for a single-user app.                                                                                                             |
| Tooling                      | **TypeScript, pnpm, Node LTS, ESLint + Prettier (or Biome), Docker Compose**                                                   | Boring, standard, well-documented — optimizing for "still obvious how this works in a year" over novelty.                                                                                                                                                                          |

### 1.1 Data fetching: the actual rule

To avoid two competing data-fetching mental models growing across the app:

- **Default for all reads**: React Server Components querying Drizzle
  directly. Dashboard, list views, detail views all load this way. No
  client-side fetch waterfall for first paint.
- **Default for all mutations**: Next.js Server Actions, colocated with
  their forms, using `revalidatePath`/`revalidateTag` to refresh the RSC
  data after a write. This covers the large majority of create/edit/delete
  interactions across all four modules.
- **TanStack Query is opt-in, per-component**, used only where a mutation
  needs to _feel_ instant before the server confirms — e.g., toggling a
  task's done state, or a meal-entry quick-add. These are the few spots
  where optimistic UI meaningfully improves daily-use feel; everywhere
  else, a Server Action + revalidation round-trip is simple, correct, and
  fast enough.
- Rule of thumb when adding a new interaction: start with a Server Action.
  Only reach for TanStack Query if the Server Action's revalidation delay
  is actually noticeable and annoying in practice.

### 1.1a Outbound HTTP (added in T4)

Until T4 the app made **no outbound network calls at all** — every byte it
served came from its own Postgres. The Open Food Facts food-database lookup
broke that, so the rule is written down rather than left to whoever adds the
next integration. See **ADR-0005** for the full reasoning.

- **Third-party calls happen in a Server Action, on the server.** Not from the
  browser (no CORS, no third-party host in the CSP, no API surface exposed to a
  page), and not in a route handler (which would be a second mutation mental
  model for something Server Actions already do).
- **The client owning the fetch never throws.** `off-client.ts` is
  `server-only`, owns every `fetch`, and returns failure _as a value_ — an
  outage or a timeout must render an inline message while hand-entry stays
  fully usable, not trip an error boundary.
- **Timeouts are mandatory** (`AbortSignal.timeout`, 6 s search / 4 s barcode).
  A third-party outage otherwise manifests as a Server Action that blocks a
  React transition indefinitely.
- **Anything interpolated into a URL is validated first.** A barcode goes into
  a path segment, so it is regex-checked (`/^\d{8,14}$/`) at the action and
  again before the URL is built; queries go through `URLSearchParams`.
- **Reading writes nothing.** Searching the food database touches no table;
  only an explicit import does.
- **The integration is switchable** (`OFF_ENABLED`). Off means zero network
  calls, and the flag is read on the server and passed down as a prop — a
  client component must never touch `process.env`.

The deployment consequence is in §4.2: the app container now needs outbound
HTTPS, where before it needed none.

### 1.2 What was deliberately not chosen

- **A separate Python/FastAPI backend** — no ML or heavy compute exists in
  this app; two services would double the deployment and maintenance
  surface for no benefit. See ADR-0001.
- **A GraphQL layer** — there's exactly one client (this app) and no
  third-party API consumers; REST-ish route handlers / Server Actions are
  sufficient and simpler to reason about.
- **A heavy state-management library** (Redux, Zustand-everywhere, etc.) —
  Server Components + the selective TanStack Query usage above cover the
  actual needs; a global client store would be solving a problem this app
  doesn't have.
- **Multi-tenant auth (Clerk, Auth0, full RBAC)** — single user, network
  already restricted by Tailscale. Would be pure over-engineering for v1.
- **A message queue / background job system** — nothing in v1 needs
  async background processing (backups are a host-level cron, not an
  in-app job).

### 1.3 Responsive layout and theming (confirmed decisions)

- **Equal-priority responsive design.** Laptop and phone are both
  first-class; each screen is designed for both breakpoints from the
  start, not retrofitted. Concretely, the app shell is responsive: a
  persistent **sidebar nav on desktop** and a **bottom tab bar on mobile**
  (thumb-reachable, app-like in the installed PWA), sharing the same routes
  and components. This is a deliberate, user-chosen trade of some build
  speed for a genuinely good experience on both devices — design each
  screen's mobile and desktop states together, not desktop-then-squish.
- **Light and dark themes.** System-following by default with a manual
  toggle, via shadcn/ui's CSS-variable theming. The theme tokens are
  established in Phase 0 so nothing needs re-plumbing later.
  **Settled after T7:** the colour scheme is no longer an open Phase 5
  question. It is one warm, muted palette — deep teal on linen, a single
  terracotta accent, graphite chrome — with every value living in
  `app/globals.css` and measured to clear WCAG AA in both themes. The
  five-scheme picker that briefly existed was removed with it; theme
  (light/dark/system) is now the whole of "appearance".
- **Design references.** Visual references for building the UI (shell layout,
  calendar grid, event cards, popovers, category bars) live in
  [`docs/design/ui-reference.md`](docs/design/ui-reference.md) — consult them
  for the 0.3 shell, the Phase 4 Calendar module, and the Phase 5 visual pass.
  They guide layout and interaction patterns. Their colours predate the warm
  scheme above and should be read for structure, not for hue.

---

## 2. System / Component Diagram

```
 ┌──────────────────────────────┐   ┌──────────────────────────────┐
 │   iPhone (Safari / installed  │   │   Laptop (Chrome/Edge/Safari) │
 │   home-screen PWA)            │   │                                │
 └───────────────┬───────────────┘   └───────────────┬────────────────┘
                 │                                    │
                 │        HTTPS, over the Tailscale mesh (WireGuard)
                 │        to <hostname>.<tailnet>.ts.net
                 └───────────────────┬────────────────┘
                                     ▼
                 ┌─────────────────────────────────────────┐
                 │  Home server (always-on host machine)     │
                 │                                           │
                 │  tailscaled  +  `tailscale serve`          │
                 │  → terminates HTTPS using a Tailscale-     │
                 │    issued cert, reverse-proxies to         │
                 │    127.0.0.1:3000                          │
                 │                     │                       │
                 │                     ▼                       │
                 │  ┌─────────────────────────────────────┐   │
                 │  │  Docker Compose                       │   │
                 │  │                                        │   │
                 │  │  ┌────────────────┐  ┌──────────────┐│   │
                 │  │  │ app (Next.js)   │  │  postgres     ││   │
                 │  │  │ :3000           │─▶│  :5432        ││   │
                 │  │  │                 │  │               ││   │
                 │  │  │ RSC reads       │  │  pgdata volume││   │
                 │  │  │ Server Actions  │  │  (persistent) ││   │
                 │  │  │ Auth.js         │  └──────────────┘│   │
                 │  │  └────────────────┘                   │   │
                 │  └─────────────────────────────────────┘   │
                 │                                           │
                 │  host cron / systemd timer                │
                 │    → pg_dump → local backup path            │
                 └─────────────────────────────────────────┘
```

Notes on this diagram:

- **Tailscale runs on the host OS**, not inside a container. This avoids
  Docker-networking-in-networking complexity (Tailscale wants access to a
  real network device / routing table) and keeps the Docker Compose stack
  itself completely ordinary — it only ever needs to expose the app on
  localhost.
- **`tailscale serve`** is the recommended way to get HTTPS from the
  tailnet to the app; it terminates TLS with a Tailscale-managed
  certificate and forwards to a local port. See §4.3 for the alternative
  (a dedicated reverse-proxy container) and why it's not the default.
- Inside the `app` container, the layering is (top to bottom):
  **Presentation** (React Server/Client Components, shadcn/ui, Tailwind)
  → **Application/business logic** (a thin per-module `service.ts` holding
  the actual rules: overdue calculation, macro totals, budget rollups,
  recurrence expansion) → **Persistence** (per-module Drizzle
  schema/query modules, Postgres). Business logic is kept out of both the
  UI layer and the raw query layer specifically so it can be unit-tested
  without needing a browser or, in most cases, a live database (pure
  functions where possible).
- The **dashboard depends on the modules' read queries; the modules
  never depend on the dashboard.** This one-directional rule is what keeps
  the "unified home" from turning into duplicated logic — the dashboard is
  an aggregator, never a second implementation of a module's rules.

### 2.1 The dashboard is the only hub

There was a second one — `/today` — until it was folded in. The two pages ran
five of the same queries (`getTasks`, `getDayEvents`, `getCalendars`,
`getMacroSummary`, `getBudgetSummary`) and shared a header, the capture bar and
the stat cards; the merged agenda was the only thing one had that the other
didn't. `/today` now 308-redirects to `/` (`next.config.ts`), because the app is
installed to a home screen and a bare 404 would be a dead icon.

The page is three columns that fill the viewport rather than one tall column
that scrolls:

| Column | Holds                                          |
| ------ | ---------------------------------------------- |
| Left   | Overdue → today's agenda → "Coming up"         |
| Centre | The month grid, or the week strip, full height |
| Right  | Tomorrow → macros/budget → categories → goals  |

Three things about it are load-bearing rather than cosmetic:

- **"Coming up" shows only what the agenda does not**, and the filter is derived
  from the agenda's own output rather than a second definition of "overdue" and
  "due today". Two definitions of one boundary is how a task ends up listed
  twice, or in neither place, the day one of them changes.
- **`Tomorrow` is deliberately only tomorrow.** It was `UpNext` and showed today
  as well; the agenda covers today better, and keeping both printed the same
  events twice on one page.
- **Height is reached for, never forced.** The grid uses `min-h`, which fills
  spare space but never adds any, and the agenda and task lists cap with
  internal scroll — so no volume of data turns this back into a scrolling page.
  Fits without scrolling from 1366×768 up; 1280×800 overflows by ~19px, and the
  digest banner adds ~180px on the one visit a day it appears.

The month/week toggle keeps its state in the URL (`/?calendar=week`), not in
client state, so the server renders the chosen view — no flash of the wrong one,
and no localStorage read during render. The cost is that the dashboard opens on
the month each visit; making it stick means a `user_preferences` column so the
server still knows it up front.

---

## 3. Data Model

All tables live in one Postgres database. **Every domain table carries a
`user_id` foreign key**, even though v1 has exactly one row in `users`.
This is a deliberate consistency rule, not premature multi-tenancy: it
means there's no special-cased "the one user" table, every query already
filters by `user_id`, and adding a second user later is additive
(loosening a constraint) rather than a schema rewrite.

All monetary amounts are stored as **integer cents** (not floating point,
not `numeric` used carelessly) — this is a correctness requirement for the
budgeting module, called out explicitly because float-based money math is
a classic, easy-to-introduce bug.

> **Read this before trusting anything below it.** This document was written against
> the v1 plan and has been revised unevenly since.
>
> **Accurate**, rewritten against the real schema: §3.2 (to-dos and goals), §3.3
> (calendar), §3.5 (meals).
>
> **Still the original plan**: §3.4 (budgeting) — later work added
> `transaction_recurrences` and `user_preferences`, and the planned `accounts` table
> was never built.
>
> **Absent entirely.** Five modules shipped after this document was last revised and
> have no section here at all: **notes** (T7a, journal + free notes), **routines**
> (T7b, `routines` + `routine_items`), **habits** (T12a, `habits` + `habit_entries` — a
> quota and a log; see ADR-0014, which supersedes ADR-0009), **review** (T7d — no tables;
> a pure projection of four other modules) and **companion** (T9a, the AI proposal store —
> `ai_proposals`). There are 27 user-owned tables across 14 modules, at 33 migrations
> (`0000`–`0032`). Do not infer from silence here that something does not exist.
>
> Habits are the one entry above whose description **reversed**. Between T7c and T12a the
> module had no tables at all: every repeating task was implicitly a habit, and streaks were
> recomputed from the recurrence engine on read. T12a retired that. A habit is now its own
> primitive stating a RATE — "3 classes a week" — it generates no tasks and has no row in the
> to-do list, and a repeating task is just a repeating task again.
>
> `user_preferences` has no section of its own: one row per user, holding the settings
> the server must read — zone, week start, currency, time format, default task
> priority, digest, the goal momentum window (T8), and the account's saved `theme`.
> `theme` is **mirrored, not moved**: it is applied before first paint from
> localStorage by a blocking script in the root layout, above any session lookup, so
> the server cannot supply it in time. The column exists so a new device adopts it and
> so it reaches the export.
>
> A `palette` column lived here too, between T6a and the post-T7 recolour, backing a
> five-scheme picker. Both are gone (migration 0025). The neutrals were shared across
> all five schemes, so recolouring the app changed the ground every one of them stood
> on — and rather than restyle five schemes nobody asked for, there is now one look.
>
> `drizzle/` and each module's `schema.ts` are always the source of truth; the
> ADRs in `docs/adr/` record why the shape changed. What is worth reading here
> either way is the _reasoning_.

### 3.1 Core

**users**

| field         | type         | notes                            |
| ------------- | ------------ | -------------------------------- |
| id            | uuid (pk)    |                                  |
| email         | text, unique | login identifier                 |
| password_hash | text         | via Auth.js Credentials provider |
| display_name  | text         |                                  |
| created_at    | timestamptz  |                                  |

Plus the standard Auth.js/Drizzle-adapter tables (`sessions`, `accounts`,
`verification_tokens`) if using database-backed sessions — not
hand-designed here, they follow Auth.js's documented schema.

### 3.2 To-dos and Goals

**lists**

| field      | type              | notes               |
| ---------- | ----------------- | ------------------- |
| id         | uuid (pk)         |                     |
| user_id    | uuid (fk → users) |                     |
| name       | text              | e.g. "Work", "Home" |
| sort_order | int               | for manual ordering |
| created_at | timestamptz       |                     |

**tasks**

| field                   | type                                             | notes                                             |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------- |
| id                      | uuid (pk)                                        |                                                   |
| user_id                 | uuid (fk → users)                                |                                                   |
| list_id                 | uuid (fk → lists, nullable, ON DELETE SET NULL)  | a task may belong to no list                      |
| series_id               | uuid (fk → task_recurrences, ON DELETE SET NULL) | null for a one-off; see the generator below       |
| occurrence_date         | date, nullable                                   | the cycle key of a generated instance             |
| goal_id                 | uuid (fk → goals, ON DELETE SET NULL)            | T2 cross-module link                              |
| event_id                | uuid (fk → events, ON DELETE SET NULL)           | T2 cross-module link                              |
| title                   | text, required                                   |                                                   |
| notes                   | text, nullable                                   |                                                   |
| due_date                | date, nullable                                   | date-only; **null is a real state** — see Someday |
| priority                | enum(low, medium, high)                          | default medium                                    |
| status                  | enum(open, done)                                 |                                                   |
| sort_order              | int, not null, default 0                         | manual position **within a date section**         |
| completed_at            | timestamptz, nullable                            | set when status → done                            |
| created_at / updated_at | timestamptz                                      |                                                   |

Plus `unique(series_id, occurrence_date)`. NULLs are DISTINCT in Postgres, so
one-off tasks (both null) never collide — the constraint only binds generated rows.

**A null `due_date` is a first-class state, not a missing value.** `bucketTasks`
splits open tasks into overdue / today / upcoming / **someday**, and the list renders
those as sections. Quick-add deliberately creates a task with no date (capture now,
schedule later) while the full dialog prefills today, because opening it is already
an act of scheduling.

`sort_order` orders tasks _within_ a section, not across the whole list. Dragging
between sections would have to rewrite `due_date`, which is a different feature — so
the drag context is per-section and enforced with `restrictToParentElement` rather
than by convention. Every existing row defaults to 0, which leaves ordering inert
until something writes it; ties then fall back to `due_date`/`created_at`. See
ADR-0006 for why `@dnd-kit` rather than native drag or a hand-rolled implementation.

**subtasks** — a one-level checklist under a task

| field      | type                                 | notes |
| ---------- | ------------------------------------ | ----- |
| id         | uuid (pk)                            |       |
| user_id    | uuid (fk → users)                    |       |
| task_id    | uuid (fk → tasks, ON DELETE cascade) |       |
| title      | text, required                       |       |
| done       | boolean, not null, default false     |       |
| sort_order | int, not null, default 0             |       |
| created_at | timestamptz                          |       |

Flat on purpose — no nesting — so `tasks` stays a table other modules can join to
rather than a tree. Identical in shape to `milestones` under a goal, and read the
same way: one extra `findMany` grouped in memory, not a per-row join.

**task_recurrences** — the rule behind a repeating task

Template fields (title, notes, priority, list) plus the recurrence definition:
`freq` (daily/weekly/monthly), `recurrence_interval`, `weekdays` (a 7-bit BYDAY mask,
where 0 means "the anchor's weekday"), `monthly_mode`, `flexible` ("once per period,
any day within it"), `start_date`, and a nullable inclusive `end_date`.

`syncRuleInstances` materializes the **current cycle only**: it retires off-cycle OPEN
instances and inserts the current one, idempotently via the unique key above.
Completed instances are never retired — they are history — and their cycle is never
re-created. The generator runs lazily inside the task reads, so there is no cron; the
cost is that it executes on every render of `/todos`, the dashboard and the
digest, which is why anything it needs is batch-loaded once per user rather than
per rule.

**task_recurrence_exceptions** — "skip this one"

| field           | type                                            |
| --------------- | ----------------------------------------------- |
| id              | uuid (pk)                                       |
| user_id         | uuid (fk → users)                               |
| rule_id         | uuid (fk → task_recurrences, ON DELETE cascade) |
| occurrence_date | date, not null                                  |
| created_at      | timestamptz                                     |

Plus `unique(rule_id, occurrence_date)`, which also makes skipping twice idempotent.

Same shape as the calendar's `event_exceptions`, but **the wiring is where it differs,
and that difference is the whole design.** Calendar occurrences are expanded on read,
so an overlay can simply drop one. Tasks are materialized — so deleting the instance
is not a skip, the generator puts it back on the next page load. The exception has to
suppress the _insert_ instead, and omitting the `ne(occurrence_date)` from the retire
clause is what also removes the row that is already there.

A `skipped` boolean on `tasks` was the alternative and was rejected: the row would
remain OPEN and have to be filtered out of every list, count, digest and search, where
missing one produces a phantom task. With no row, nothing can leak.

A consequence worth knowing: a rule whose current cycle is skipped has no task row
anywhere — and neither does one whose `start_date` hasn't arrived yet. Both routes to
a rule used to hang off a generated row, which left those rules unreachable until the
next cycle (a month, for a monthly rule). The **Repeating tasks** manager lists rules
from the rules table instead, so neither case is a dead end.

**goals**

| field                      | type                     | notes                                  |
| -------------------------- | ------------------------ | -------------------------------------- |
| id                         | uuid (pk)                |                                        |
| user_id                    | uuid (fk → users)        |                                        |
| title                      | text, required           |                                        |
| notes                      | text, nullable           |                                        |
| target_date                | date, nullable           | drives the at-risk indicator           |
| target_value/current_value | real, nullable           | progress for a goal without milestones |
| unit                       | text, nullable           | display suffix only — no conversion    |
| sort_order                 | int, not null, default 0 |                                        |
| created_at / updated_at    | timestamptz              |                                        |

**milestones**

| field      | type                                 | notes |
| ---------- | ------------------------------------ | ----- |
| id         | uuid (pk)                            |       |
| user_id    | uuid (fk → users)                    |       |
| goal_id    | uuid (fk → goals, ON DELETE cascade) |       |
| title      | text, required                       |       |
| done       | boolean, not null, default false     |       |
| due_date   | date, nullable                       |       |
| sort_order | int, not null, default 0             |       |
| created_at | timestamptz                          |       |

`goalProgress` returns a **discriminated** result — `milestones`, `numeric`, or `none`
— with milestones winning when both are set, because they are the more specific
statement of intent and combining the two into one bar would be arithmetic nobody
asked for. The `none` case exists so "there is nothing to measure" cannot be rendered
as 0%: the previous shape returned `{done: 0, total: 0, percent: 0}` for a goal with
no milestones, and the dashboard rail dutifully printed a literal "0/0" beside a
2%-wide bar for four tranches.

The percentage is deliberately **not** clamped — a goal can be overshot ("12 of 10
lbs") and the printed figure tells the truth; it is the bar's _width_ that is clamped.
Same split T4-S9 settled on for over-target macros.

Tasks linked to a goal (T2) are surfaced on the goal card **read-only**: `/todos` is
where you act on a task, and a second checkbox here would be two places to keep in
step. What the card shows is what you can read at a glance — how many are outstanding,
which are overdue, and a way through.

### 3.3 Calendar / Events

**calendars** — named groups (Personal, Work, …), seeded on first read.

| field      | type                     | notes                                   |
| ---------- | ------------------------ | --------------------------------------- |
| id         | uuid (pk)                |                                         |
| user_id    | uuid (fk → users)        |                                         |
| name       | text, required           |                                         |
| color      | int, not null, default 1 | palette slot 1–6 → `--cat-1..6`; no hex |
| sort_order | int, not null, default 0 |                                         |
| created_at | timestamptz              |                                         |

**events**

| field                   | type                                       | notes                                      |
| ----------------------- | ------------------------------------------ | ------------------------------------------ |
| id                      | uuid (pk)                                  |                                            |
| user_id                 | uuid (fk → users)                          |                                            |
| calendar_id             | uuid, nullable (fk → calendars, cascade)   | deleting a calendar takes its events       |
| title                   | text, required                             |                                            |
| notes                   | text, nullable                             |                                            |
| start_at                | timestamptz                                | the ANCHOR instant — see the model below   |
| end_at                  | timestamptz, nullable                      | nullable to allow open-ended/point events  |
| all_day                 | boolean                                    |                                            |
| recurrence_freq         | enum(none, daily, weekly, monthly, yearly) |                                            |
| recurrence_interval     | int, default 1                             | e.g. every 2 weeks                         |
| recurrence_weekdays     | int, default 0                             | 7-bit BYDAY mask; 0 = the anchor's weekday |
| recurrence_monthly_mode | enum(day_of_month, nth_weekday)            | how a monthly series lands                 |
| recurrence_end_date     | date, nullable                             | INCLUSIVE; open-ended if null              |
| created_at / updated_at | timestamptz                                |                                            |

**These five columns map onto an RRULE on the way out, and only on the way out**
(`modules/calendar/ical.ts`, T5c-a). Four things the schema leaves implicit have
to be re-derived to say it in iCalendar's terms: BYDAY when the mask is `0`, the
nth-weekday ordinal (`recurrence_monthly_mode` records only that the rule _is_
nth-weekday), a `COUNT` that does not exist here and is expressed as `UNTIL`, and
`recurrence_end_date` being an inclusive DATE where `UNTIL` is a date-time. The
ordinal derivation is shared with the expander via `nthWeekdayOf` precisely so the
published feed cannot claim a different Friday than the app draws.

Reading an arbitrary RRULE _back_ is not the mirror of this — `COUNT`, `BYSETPOS`
and multi-`BYDAY`-with-ordinals have nowhere to live in five columns — which is
why import is not offered. See ADR-0008.

Recurring **calendar** occurrences are **computed on the fly** for whatever
date range is being viewed, not pre-materialized as individual rows. This avoids
the classic recurrence bug class of stale materialized instances after an edit.
The tradeoff originally accepted here — no "edit just this one occurrence" — was
later bought back with an `event_exceptions` overlay rather than by materializing.

**This rule turned out to be specific to the calendar.** Recurring to-dos and
recurring transactions both materialize real rows, lazily on read, because a
to-do you can tick off and a payment that hits your ledger have to _exist_.
Their tradeoffs are opposite and deliberate: the task generator keeps exactly
one open instance and retires the rest, while the transaction generator is
insert-only and never rewrites a posted row. See ADR-0004 for the money case
and the constraint it carries (enabling `cacheComponents` would make writing
during a render illegal).

#### The wall-clock model

An occurrence is a **local date plus a time-of-day derived once from the anchor**,
not an instant. Recurrence stepping is therefore plain calendar-date arithmetic
with no timezone reconstruction, and a 09:00 standup stays 09:00 across a DST
boundary instead of drifting to 08:00 or 10:00.

The cost is that `start_at` is only an accurate instant **for the anchor itself**.
Anything computing an offset for a later occurrence has to work from `occ.time`,
never from `event.start_at`, or every occurrence past a transition lands an hour
out. The week grid's vertical axis is wall clock for the same reason — see
`components/calendar/grid-geometry.ts`, which explains why elapsed-time positioning
was built first and then rejected.

An occurrence is **in view when its span overlaps the range**, not when its start
date falls inside it. Both paths in `expandOccurrences` agree on this now; until
T5b-S1 only the non-recurring one did, so a recurring Mon–Wed event was invisible
in a week beginning Tuesday while an identical one-off was not.

**event_exceptions** — per-occurrence overrides and skips

| field                   | type                                      | notes                          |
| ----------------------- | ----------------------------------------- | ------------------------------ |
| id                      | uuid (pk)                                 |                                |
| user_id                 | uuid (fk → users)                         |                                |
| event_id                | uuid (fk → events, ON DELETE cascade)     |                                |
| original_date           | date, not null                            | the RECURRENCE-ID — see below  |
| canceled                | boolean, not null, default false          | "skip this day"                |
| start_at / end_at       | timestamptz, nullable                     | null = inherit from the series |
| all_day / title / notes | nullable                                  | null = inherit                 |
| calendar_id             | uuid, nullable (fk → calendars, set null) |                                |
| created_at / updated_at | timestamptz                               |                                |

Plus `unique(event_id, original_date)`, which makes re-saving the same day an
upsert rather than a duplicate.

**`original_date` is the key, and it is deliberately not "where the occurrence
is".** It is the date the SERIES would produce the occurrence on — iCalendar's
RECURRENCE-ID. Since T5b an override can also **move** its occurrence to another
day, and the two then differ. Addressing the row by where the block currently sits
writes a _second_ override instead of updating the one that exists, leaving the
series with two rows fighting over one day. `Occurrence` carries `originalDate`
alongside `date` for exactly this reason, and `occurrenceKey` is built from it.

The moved day needs **no column of its own**: an override already stores a full
`start_at`, so the day it lands on is in the data. A `moved_to_date` was planned
and dropped — one fact with two homes is one fact that can disagree with itself.

Two consequences fall out of moves being possible:

- **Reads scan wider than their own range.** An occurrence moved _into_ a view was
  never expanded, because its natural date is outside it; one moved _out_ was
  expanded and has to be dropped. `inboundOccurrenceDates` handles the first and
  `applyExceptions`' range check the second, and the exception fetch matches on
  `original_date ∈ range` **OR** the stored instant landing in it.
- **Moves are bounded** (`MAX_MOVE_DAYS`, 60). Not a taste judgement: "scan far
  enough either side" is only knowable if there is a limit, and the query windows
  widen by exactly that amount. Unbounded, every read would have to consider every
  exception ever written.

#### "This and following"

Splitting a series stops the original the day **before** the split (`recurrence_end_date`
is inclusive) and inserts a continuation re-anchored **on** it. Re-anchoring is what
preserves phase — an every-other-week series counted from the split date lands on the
same days only because the split date is itself an occurrence.

All three writes — truncate, insert, and re-point every exception from the split date
onward — run in **one transaction**. Alone, each is a bug: a truncate without its
continuation silently deletes every future occurrence, and a continuation without its
truncate renders the series twice.

Splitting at the series' own first occurrence is just an edit of the whole thing, and is
handled as one; writing the split anyway would strand a row that produces nothing.

One inherited wart: `nth_weekday` never stores its ordinal and re-derives it from
whichever month the anchor lands in, so splitting a "4th Friday" series at a month whose
4th Friday is also its last can quietly turn it into a "last Friday" one. The ambiguity
is in the schema rather than in the split, but the split is where it surfaces.

### 3.4 Budgeting

**accounts**

| field                  | type                                         | notes |
| ---------------------- | -------------------------------------------- | ----- |
| id                     | uuid (pk)                                    |       |
| user_id                | uuid (fk → users)                            |       |
| name                   | text                                         |       |
| type                   | enum(checking, savings, credit, cash, other) |       |
| starting_balance_cents | integer                                      |       |
| created_at             | timestamptz                                  |       |

**categories**

| field      | type                  | notes |
| ---------- | --------------------- | ----- |
| id         | uuid (pk)             |       |
| user_id    | uuid (fk → users)     |       |
| name       | text                  |       |
| kind       | enum(income, expense) |       |
| created_at | timestamptz           |       |

**transactions**

| field        | type                             | notes                                                                                                                                                       |
| ------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id           | uuid (pk)                        |                                                                                                                                                             |
| user_id      | uuid (fk → users)                |                                                                                                                                                             |
| account_id   | uuid (fk → accounts)             |                                                                                                                                                             |
| category_id  | uuid (fk → categories, nullable) | nullable = uncategorized                                                                                                                                    |
| amount_cents | integer, positive                |                                                                                                                                                             |
| type         | enum(income, expense)            | stored explicitly rather than inferred from category, so a transaction's direction is never silently dependent on how its category happens to be configured |
| date         | date                             |                                                                                                                                                             |
| description  | text, nullable                   |                                                                                                                                                             |
| created_at   | timestamptz                      |                                                                                                                                                             |

**budgets**

| field        | type                   | notes                       |
| ------------ | ---------------------- | --------------------------- |
| id           | uuid (pk)              |                             |
| user_id      | uuid (fk → users)      |                             |
| category_id  | uuid (fk → categories) |                             |
| period_month | date                   | truncated to first-of-month |
| amount_cents | integer                |                             |
| created_at   | timestamptz            |                             |

**Monthly rollups are a computed query, not a stored table** — sum of
`transactions.amount_cents` grouped by category/month, compared against
`budgets.amount_cents`. Given single-user data volumes, this is trivially
fast; materializing it would be solving a performance problem that
doesn't exist yet (YAGNI — revisit only if it's ever actually slow).

### 3.5 Meal Macros

Macros are `real` (float), not `numeric`. Nutrition doesn't need the
integer-cents precision money does, and floats sum cleanly as JS numbers.

**foods** — the reusable library

| field                                     | type                      | notes                                  |
| ----------------------------------------- | ------------------------- | -------------------------------------- |
| id                                        | uuid (pk)                 |                                        |
| user_id                                   | uuid (fk → users)         |                                        |
| name                                      | text                      |                                        |
| serving_label                             | text                      | e.g. "1 cup", "100 g"                  |
| calories                                  | real, not null, default 0 | per serving                            |
| protein_g / carbs_g / fat_g               | real, not null, default 0 | per serving                            |
| fiber_g / sugar_g / sat_fat_g / sodium_mg | real, **nullable**        | per serving; null = unknown            |
| barcode                                   | text, nullable            | set when imported from Open Food Facts |
| created_at / updated_at                   | timestamptz               |                                        |

Indexes: `(user_id, name)` — the library is read in full on every `/meals`
render — and `(user_id, barcode)`, deliberately **not** unique. A unique there
would change what `restoreFood`'s `onConflictDoNothing` swallows: undo would
start silently no-op'ing on a barcode collision rather than on the id.
Duplicates are deduped in the action instead.

**meal_entries** — one logged item

| field                                     | type                                            | notes                                                  |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| id                                        | uuid (pk)                                       |                                                        |
| user_id                                   | uuid (fk → users)                               |                                                        |
| food_id                                   | uuid (fk → foods), nullable, ON DELETE SET NULL | kept only for "log again"                              |
| date                                      | date                                            |                                                        |
| meal_type                                 | enum(breakfast, lunch, dinner, snack), nullable |                                                        |
| servings                                  | real, default 1                                 | fractional servings; also how a per-100 g import works |
| name / serving_label                      | text                                            | **snapshot**                                           |
| calories / protein_g / carbs_g / fat_g    | real, not null, default 0                       | **snapshot**                                           |
| fiber_g / sugar_g / sat_fat_g / sodium_mg | real, nullable                                  | **snapshot**                                           |
| created_at                                | timestamptz                                     |                                                        |

Indexes: `(user_id, date)` — the module's hot path, hit by `/meals`, `/` and
the dashboard — and `(user_id, created_at)` for the newest-first scan behind quick
picks.

**Every nutrition figure is snapshotted at log time**, which is why the columns
are duplicated rather than joined. Editing or deleting a food must never rewrite
what you ate last Tuesday. The micros are snapshotted for the same reason: if
they were read live, editing a food's sodium would silently rewrite history for
micros while leaving the macros correct — worse than not having them at all.

**Micronutrients are nullable, unlike the macros' NOT NULL DEFAULT 0.** All four
macros are on screen whenever a food is entered by hand, so a 0 there means "I
typed zero". For micros, "unknown" is the _normal_ state — every food that
predates the columns has none, and Open Food Facts products routinely carry
fiber but not saturated fat. A 0 default would report "412 mg sodium" for a day
where three of eight entries simply have no data: precise-looking and wrong.
`sumMicros` therefore returns totals **plus a per-micro known-count**, so the UI
can say "412 mg (3 of 8)" instead of implying a precision it doesn't have.

**macro_targets** — effective-dated, one row per period

| field                                  | type                            | notes                                       |
| -------------------------------------- | ------------------------------- | ------------------------------------------- |
| id                                     | uuid (pk)                       |                                             |
| user_id                                | uuid (fk → users)               |                                             |
| effective_from                         | date, not null                  | the day this set of targets starts applying |
| calories / protein_g / carbs_g / fat_g | real, not null, default 0       |                                             |
| created_at / updated_at                | timestamptz                     |                                             |
|                                        | unique(user_id, effective_from) | also serves as the lookup index             |

The targets in effect on day D are the latest row with `effective_from <= D`.
There is deliberately **no `effective_to`**: a closed interval needs two writes
per change and can develop gaps or overlaps no constraint catches, whereas
"greatest start not after D" is one indexed lookup. Same shape as `budgets`'
`(user, category, period_month)` key.

This replaced a single row per user (`unique(user_id)`). Changing a target used
to silently re-score every day already logged, which would have made the trends
meaningless. Migration `0017` backfills the pre-existing row to `1970-01-01`
— not `created_at::date` — so every historical day keeps scoring against the
targets it has always been scored against.

**water_logs** — one row per log

| field        | type              | notes |
| ------------ | ----------------- | ----- |
| id           | uuid (pk)         |       |
| user_id      | uuid (fk → users) |       |
| date         | date              |       |
| amount_fl_oz | real, not null    |       |
| created_at   | timestamptz       |       |

**body_weights** — one row per day

| field                   | type                  | notes                           |
| ----------------------- | --------------------- | ------------------------------- |
| id                      | uuid (pk)             |                                 |
| user_id                 | uuid (fk → users)     |                                 |
| date                    | date                  |                                 |
| weight_lb               | real, not null        |                                 |
| created_at / updated_at | timestamptz           |                                 |
|                         | unique(user_id, date) | also serves as the lookup index |

**These two have opposite shapes on purpose, and the difference is the point.**
Water accumulates in +8/+16 taps through the day, so an append-only log makes
"+8 oz" a plain insert and undo a plain delete. A per-day running total would
need a read-modify-write — racy against a double tap — and an undo that
remembers a delta. Weight is measured once, so the unique makes the write a
clean upsert, makes a typo an edit rather than a second data point, and keeps
the trend chart's x-axis unambiguous.

**Units live in the column names** (`amount_fl_oz`, `weight_lb`, `sodium_mg`),
the same idiom as `amount_cents` and `protein_g`. The app is imperial by
decision; there is no units preference and no conversion layer, so the unit is
part of the schema rather than a convention someone has to remember.

Daily totals are computed by summing `meal_entries` (scaled by `servings`) for a
date and user — a query, not a stored aggregate. The weight trend buckets to one
point per week (`weeklyWeightSeries`, pure and unit-tested) and **omits** weeks
with no weigh-in rather than emitting 0, since a 0 would draw a cliff to the
floor of the chart.

---

## 4. Deployment Architecture

### 4.1 Host

A single always-on machine the user owns (mini PC / Raspberry Pi / NAS /
existing desktop — see SPEC.md open question #7 on which one, since it
determines Docker image architecture: arm64 vs. amd64). Runs:

- Docker + Docker Compose.
- Tailscale (`tailscaled`), installed directly on the host OS.

### 4.2 Docker Compose services

- **`app`** — the Next.js application, built from a multi-stage
  `Dockerfile`, listening on an internal port (e.g. 3000), published only
  to `127.0.0.1:3000` on the host (not to `0.0.0.0`) — it should not be
  reachable on the host's LAN interface directly, only via `tailscale
serve` or localhost.
- **`postgres`** — official Postgres image, with a named Docker volume
  (e.g. `winnow_pgdata`) mounted at the data directory. This volume is the
  single source of truth for all application data and must survive
  container recreation, image upgrades, and host reboots.
- Both share a Compose-managed bridge network; only `app` talks to
  `postgres`, using a service-name hostname (e.g. `postgres:5432`) and
  credentials from environment variables / an env file that is **not**
  committed to git.
- **`app` needs outbound HTTPS** as of T4 — the Open Food Facts lookup runs
  server-side (§1.1a, ADR-0005). Before T4 the container needed no egress at
  all, so a locked-down network policy that predates this will make the food
  database silently unavailable. Set `OFF_ENABLED=false` to turn the feature
  off deliberately rather than have it fail; everything else in the app
  continues to work with no egress. `postgres` still needs none.

### 4.3 Tailscale networking and HTTPS (the critical piece)

PWAs require a secure context — service workers refuse to register over
plain HTTP, and iOS Safari's install behavior assumes a real HTTPS origin.
On a private tailnet with no public domain, this is solved as follows:

1. **Enable MagicDNS and HTTPS certificates** in the Tailscale admin
   console (DNS → both toggles). This gives the host a stable name like
   `homeserver.<tailnet-name>.ts.net` that resolves only for devices
   joined to the tailnet, and allows Tailscale to issue real,
   browser-trusted (Let's Encrypt-backed) certificates for that name.
2. **Recommended: `tailscale serve https / http://127.0.0.1:3000`** run
   once on the host (or via a small startup script). This one command
   makes Tailscale itself terminate HTTPS on the tailnet using a
   certificate it manages, and reverse-proxies to the app container's
   published local port. Tailscale renews the certificate automatically
   in the background as long as `tailscaled` is running — **no manual
   renewal cron needed.** This is the recommended default specifically
   because it removes an entire maintenance chore (cert renewal) for a
   solo maintainer.
3. **Alternative (not the default): `tailscale cert` + a dedicated
   reverse-proxy container** (Caddy or nginx) that mounts the
   certificate files and terminates TLS itself, forwarding to the `app`
   container over the Docker network. This gives more control (useful if
   the host will eventually run other services needing custom proxy
   rules) at the cost of running and maintaining an extra container and
   a manual renewal job (Tailscale certs are short-lived, ~90 days;
   without `serve`/`funnel` managing it, this needs its own cron plus a
   proxy reload). Use this only if a concrete reason to want more control
   shows up later — otherwise it's avoidable complexity.
4. **Result**: the app is reachable at
   `https://homeserver.<tailnet-name>.ts.net` from any device joined to
   the tailnet — laptop and iPhone alike — with a certificate every
   browser (including iOS Safari) trusts, satisfying the secure-context
   requirement for both service worker registration and a clean "Add to
   Home Screen" install.
5. **Access control**: default Tailscale ACLs (every device on a personal
   tailnet can reach every other device) are sufficient for a single user
   with a handful of personal devices. No additional ACL configuration is
   needed for v1; revisit only if more people/devices join the tailnet
   for unrelated reasons.
6. **Nothing about this app is ever exposed to the public internet.**
   There is no public DNS record, no port-forward on the home router, and
   Tailscale Funnel (which _would_ expose a tailnet service publicly) is
   explicitly not used.

### 4.4 Persistence and backups

- Postgres data lives in a named Docker volume, not an anonymous one, so
  it survives `docker compose down`/`up` and image rebuilds.
- **Backup**: a host-level cron job (or systemd timer) runs `pg_dump`
  against the running Postgres container on a schedule (daily is
  reasonable at this data volume) and writes a timestamped dump to a
  location **outside** the Docker volume — a separate disk/directory on
  the host at minimum (see SPEC.md open question #8 on whether to also
  copy off-site).
- **Restore is a first-class deliverable, not an assumption**: Roadmap
  Phase 5 explicitly requires performing a real restore from a real
  backup at least once, documented as a repeatable procedure. A backup
  that has never been restored is not considered a working backup.
- Backups should exclude secrets (env files) from any location that might
  be synced somewhere less trusted; the dump itself contains personal
  financial/health-adjacent data and should be treated accordingly (e.g.,
  restrict file permissions on the backup directory).

---

## 5. Auth Approach

**Single-account login via Auth.js v5 (NextAuth), Credentials provider,
stateless JWT sessions.**

> **A second credential exists as of T5c-a.** The session is no longer the only
> way in: `/api/calendar/<token>` serves the iCalendar subscribe feed to a bearer
> token, because a calendar app polling a feed has nowhere to put a cookie. It is
> the only route in the app that answers without a session, it is read-only, it
> is scoped to one user's events, and every miss is a 404 so probing learns
> nothing. Regenerating the token is the only revocation there is. See
> `docs/adr/0008-token-authenticated-calendar-feed.md`.

> Implemented in Checkpoint 0.2. This updates the original plan: Auth.js's
> Credentials provider only supports **JWT** sessions, not database sessions,
> so the "delete the session row to log out everywhere" idea below was dropped.
> A bonus simplification — **no Auth.js database adapter and no
> `sessions`/`accounts`/`verification_tokens` tables** are needed; the
> Credentials `authorize` function queries the `users` table directly and the
> user id is carried in the JWT.

Why this is deliberately light:

- The actual security boundary is Tailscale — only devices the user has
  explicitly joined to their tailnet can reach the app's HTTPS origin at
  all. There is no public attack surface for app-level auth to defend
  against.
- App-level login exists for three narrower reasons: (1) scoping data to
  a `user_id` consistently with the rest of the data model, (2) a basic
  guard if another device is ever added to the same tailnet (e.g., a
  family member's laptop joined for something unrelated), and (3) a
  minimal guard if a phone is lost/stolen while still authenticated to
  the tailnet.
- Given that framing, a Credentials provider (email + password hashed with
  **bcryptjs**, cost 12) is sufficient, boring, and reliable. (Argon2id is a
  stronger Later upgrade; bcrypt at cost 12 is fine for this threat model.)
  **Passkeys/WebAuthn
  were considered** as a nicer login experience but rejected for v1: they
  add browser/OS-version-dependent behavior (WebAuthn inside an installed
  iOS PWA has had version-dependent quirks) for a login that isn't
  defending against real remote attackers. Flagged as a reasonable Later
  upgrade once the app is stable.
- **JWT sessions** (signed with `AUTH_SECRET`). Being stateless, there is no
  server-side "log out everywhere" — a lost device's token stays valid until
  it expires. This is well-mitigated by the real perimeter: removing the
  device from the Tailscale tailnet instantly cuts its access regardless of
  token validity. If per-session revocation is ever wanted, a `tokenVersion`
  column bumped on the user row is the Auth.js-compatible upgrade.
- **No public sign-up flow.** The single user account is seeded once via
  a seed script / environment variables at first boot. There is no
  "create account" UI surface at all — one less thing to secure or
  maintain.

---

## 6. PWA Approach

### 6.1 Manifest

A standard `manifest.json` (or `.webmanifest`) with: `name`/`short_name`,
icons (at least 192px and 512px, plus a maskable variant), `start_url`,
`display: "standalone"`, `theme_color`, `background_color`. iOS also needs
explicit `<link rel="apple-touch-icon">` tags and
`apple-mobile-web-app-*` meta tags in the root layout `<head>`, since
Safari's home-screen install has historically relied on these rather than
fully honoring the manifest the way Chromium does.

### 6.2 Service worker strategy (online-first, no offline data)

**Status: implemented in T6b** — `public/sw.js`, registered by
`src/components/pwa/register-service-worker.tsx`. It is **hand-written,
not generated by a plugin**; this section previously pre-committed to a
Workbox-based Next.js plugin, and `docs/adr/0007-hand-written-service-worker.md`
records why that was reversed. The short version: the precache manifest
a plugin generates has nothing to precache here, because every route is
dynamic and auth-gated.

The rule that mattered most is unchanged — it is what keeps the worker
small:

- **Static app-shell assets** (JS/CSS bundles, icons, fonts):
  cache-first. Safe without any manifest because everything Next emits
  under `/_next/static/` is content-hashed, so a URL that is in the
  cache can never be out of date.
- **Everything else — all `/api/*` routes, Server Action calls, and any
  page rendering live data (tasks, events, transactions, macros)**:
  **network-only, never cached.** This is the one rule that matters most
  here: showing stale financial or task data because a service worker
  served a cached response would be actively misleading, not just a
  minor UX nit. There is no offline-write queue, no background sync, and
  no cached "last known" data view — if the network is unreachable, the
  app should clearly show that, not silently serve stale content.

  The app leans on this harder than it looks. `ensureRecurringTasks()`
  materialises and retires rows _during a page read_ (page rendering is
  the scheduler — there is no cron; see ADR-0004), every hub freezes
  "today" into its HTML at render time, `revalidatePath()` cannot reach
  Cache Storage, and signing out cannot clear it. A navigation cache
  would quietly break all four, which is why there isn't one.

- **What was added on top:** a failed **navigation** is answered with
  `public/offline.html`, a self-contained page that names the problem
  instead of leaving an installed PWA on a blank screen. Only a network
  _rejection_ triggers it — a 307 to `/login` or a 500 is passed through
  untouched, so auth redirects and error boundaries still work. The
  fallback keys on `request.mode === "navigate"`, never on the URL,
  because App Router client navigation fetches the same path with
  `?_rsc=` and expects a Flight payload rather than HTML.

So the worker's job is "make the app installable, load its static shell
fast, and fail legibly" — not "make the app work offline." True offline
support is still Later (SPEC.md §6) and would mean a local-first data
layer, not an extension of this.

Caveat worth knowing: it registers **only in production builds**, since
dev chunk filenames are not content-hashed and cache-first would break
HMR. `pnpm test:e2e` therefore cannot reach it; `pnpm test:e2e:prod`
(`playwright.prod.config.ts`) builds and serves for real. The routing
decisions themselves are unit-tested against a fake worker global in
`src/components/pwa/sw.test.ts`.

### 6.3 iOS install caveats to design around

- The device must be joined to the tailnet for the `.ts.net` hostname to
  resolve at all; installation must happen via Safari specifically (iOS
  restricts "Add to Home Screen" PWA installation to Safari, not other
  browser apps on iOS).
- No web push before iOS 16.4, and push is out of scope anyway (SPEC.md
  §6) — no action needed now, just don't assume push works on older iOS.
- iOS can evict a Safari/PWA's local storage after a period of disuse.
  The service worker's caches (§6.2) go with it, but they hold no user
  data — only the static shell and the offline page — so the worst case
  is a slower first load and the browser's own error page instead of
  `offline.html` until the next online visit re-primes it. The main
  consequence is still a potential forced re-login if a session cookie
  is evicted — mitigated by a reasonably long-lived session and the fact
  that re-login is one account, low friction, not a real usability
  problem.
- Standalone mode should keep same-origin navigation inside the installed
  app window (avoid `target="_blank"` on internal links, which can pop
  back out to full Safari).
- Use `viewport-fit=cover` and CSS `env(safe-area-inset-*)` so the layout
  respects the notch/home-indicator safe areas in standalone mode; set
  `apple-mobile-web-app-status-bar-style` for status bar theming.
- If the manifest's `start_url` or icon set changes meaningfully after
  the user has already installed the icon, they may need to remove and
  re-add it — worth a one-line note in the eventual README, not a
  technical problem to solve.

---

## 7. Folder / Module Structure

```
winnow/
├── src/
│   ├── app/                          # Next.js App Router routes only
│   │   ├── (auth)/
│   │   │   └── login/
│   │   ├── (app)/                    # authenticated shell route group
│   │   │   ├── layout.tsx            # nav shell shared by every module
│   │   │   ├── page.tsx              # dashboard — default route, and the ONLY hub
│   │   │   ├── _lib/agenda.ts        # pure: today's tasks + events, merged
│   │   │   ├── _components/          # dashboard-only UI (agenda, tomorrow, cards)
│   │   │   ├── todos/
│   │   │   ├── calendar/
│   │   │   ├── budget/
│   │   │   └── meals/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   └── calendar/[token]/     # the .ics feed — the ONLY unauthenticated route
│   │   └── layout.tsx                # root layout: PWA meta tags, fonts
│   │
│   ├── modules/                      # one folder per domain module
│   │   ├── account/                  # export/import/clear — see §7 note below
│   │   │   ├── payload.ts            # the backup JSON's shape (version, key map)
│   │   │   ├── tables.ts             # user-owned table graph, DERIVED from schemas
│   │   │   ├── import.ts             # pure validation incl. referential integrity
│   │   │   └── clear.ts              # the twenty deletes, shared by clear + restore
│   │   ├── todos/
│   │   │   ├── schema.ts             # Drizzle table definitions
│   │   │   ├── queries.ts            # reads (used by RSC + the dashboard page)
│   │   │   ├── actions.ts            # Server Actions (mutations)
│   │   │   ├── service.ts            # pure business logic (bucketing, overdue calc)
│   │   │   ├── restore.ts            # row → insert-payload map for the undo path
│   │   │   └── validation.ts         # Zod schemas, shared client/server
│   │   ├── goals/                    # same shape, + restore.ts
│   │   ├── calendar/                 # same shape, plus:
│   │   │   ├── service.ts            # recurrence expansion, wall-clock occurrences
│   │   │   ├── ical.ts               # pure RFC 5545 writer (see ADR-0008)
│   │   │   └── feed-token.ts         # the subscribe feed's bearer token
│   │   ├── budget/                   # same shape (+ rollup calc in service.ts)
│   │   ├── meals/                    # same shape, plus the files below
│   │   │   ├── restore.ts            # row → insert-payload maps for every undo path
│   │   │   ├── off-mapping.ts        # pure: OFF product → ImportedFood
│   │   │   ├── off-request.ts        # pure: URL building, error classification
│   │   │   └── off-client.ts         # server-only: owns fetch, never throws
│   │   ├── digest/                   # the once-a-day banner's assembly (T2)
│   │   ├── preferences/              # the singleton user_preferences row
│   │   └── search/                   # the ⌘K palette's cross-module search (T1)
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn primitives, unmodified/lightly themed
│   │   ├── charts/
│   │   │   └── geometry.ts           # pure chart maths, no React/DOM/measurement
│   │   ├── calendar/                 # same contract as charts/
│   │   │   ├── grid-geometry.ts      # pure: slots, overlap lanes, DST notes
│   │   │   └── time-grid.tsx         # week/day grid + drag-to-reschedule
│   │   ├── pwa/
│   │   │   ├── register-service-worker.tsx  # prod-only registration (see ADR-0007)
│   │   │   └── sw.test.ts            # evaluates public/sw.js in a fake worker global
│   │   └── shared/                   # nav, page headers, app-wide shared pieces
│   │       └── sortable-list.tsx     # drag/keyboard reorder (see ADR-0006)
│   │
│   ├── lib/
│   │   ├── db.ts                     # Drizzle client/connection
│   │   ├── auth.ts                   # Auth.js config
│   │   └── utils.ts
│   │
│   └── styles/
│       └── globals.css               # design tokens/theme variables live here
│
├── drizzle/                          # generated SQL migrations
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                         # hand-written service worker (§6.2, ADR-0007)
│   ├── offline.html                  # self-contained fallback page — no build assets
│   ├── fonts/                        # one committed woff2, for offline.html only
│   └── icons/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── docs/
│   └── adr/
├── SPEC.md
├── ARCHITECTURE.md
├── ROADMAP.md
└── README.md
```

Rules this structure is meant to enforce:

- **`modules/*` owns its schema, reads, writes, business logic, and
  validation.** `app/*` routes are thin — they render UI and call into
  `modules/*`, they don't contain business logic themselves.
- **The dashboard may only import other modules' `queries.ts`**, never their
  `actions.ts`, and no module imports from the dashboard. This is §2's
  one-directional rule and it protects the "unified home, not duplicated
  logic" principle from SPEC.md.

  There is no `modules/dashboard` any more: it was one file composing other
  modules' reads, and `app/(app)/page.tsx` does that directly. The rule is
  about direction, not about where the composition lives.

- Unit tests are colocated with the code they test (e.g.,
  `modules/budget/service.test.ts` next to `service.ts`) so there's no
  separate mental map to maintain as a solo developer. Playwright E2E
  tests live separately (e.g., `e2e/`) since they exercise the whole
  running app rather than one module.
- **The five-file shape is a floor, not a ceiling.** `meals/` is the module
  that has outgrown it most, and the extra files exist for one reason each — to
  make something testable that otherwise wouldn't be:
  - `restore.ts` — now in `meals/`, `todos/` and `goals/`. Every `restoreX`
    action re-inserts a deleted row by listing its columns, and that list has
    silently fallen behind the schema four times (`842f420` for tasks, T3-S11
    for transactions, T4-S11 for the account data tools, and T5a-S2 would have
    been the fourth had S1 not moved the lists out first). TypeScript can't catch it: a column omitted from an
    insert is left NULL, which is valid. Hoisting the column lists out of
    `actions.ts` lets `restore.test.ts` assert them against
    `getTableColumns()`, so forgetting one fails a test instead of losing data
    on undo. `src/modules/account/coverage.test.ts` does the same job one level
    up for `deleteAllUserRows` / `exportUserData`.
  - `account/` outgrew the shape for the same reason, when T6a added an import:
    - `payload.ts` — the JSON's shape (version, the one table whose key differs).
      Four things have to agree on what a backup file looks like; before this
      they agreed by coincidence.
    - `tables.ts` — the user-owned table graph **derived** from drizzle metadata:
      which tables a backup covers, which columns point at which other table, and
      the topological insert order. Three lists that would otherwise be written
      down and fall behind, which is the failure above.
    - `import.ts` — pure validation, so the rules are testable without a database
      and nothing reaches SQL until the whole file has been judged.
    - `clear.ts` — the twenty deletes, extracted once a restore needed them inside
      its own transaction. Two copies of that list is the bug being guarded against.
  - `off-mapping.ts` / `off-request.ts` — pure, so the fiddly parts (per-100 g
    vs per-serving basis, kJ → kcal, OFF's sodium in grams → our milligrams,
    URL building, error classification) are unit-tested without a network.
  - `off-client.ts` — `server-only`, and the _only_ place `fetch` is called.
    Keeping the I/O in one file is what lets everything around it be pure.
    Reach for a new file when it buys a test; not otherwise.

---

## 8. Summary of Key Judgment Calls Made Here

(Each restated briefly so they're easy to revisit; none of them block
starting Phase 0.)

- Lists (not many-to-many tags) for to-do organization in v1.
- Binary task status (open/done), no "in progress" state.
- Recurrence expanded on read, not materialized — no per-occurrence edits
  in v1. _(Since revised: calendar events kept read-time expansion and gained
  per-occurrence edits via an exceptions overlay; to-dos and transactions
  materialize instead. See §3.3 and ADR-0004.)_
- Transaction direction stored explicitly (`type`), not inferred from
  category.
- Monthly rollups and daily macro totals are computed queries, not
  stored/materialized tables.
- `tailscale serve` over a dedicated reverse-proxy container, to avoid
  manual certificate renewal chores.
- Credentials-based auth over passkeys, given Tailscale is the actual
  perimeter.
- TanStack Query used only where optimistic UI is genuinely valuable, not
  as the default data-fetching approach.
