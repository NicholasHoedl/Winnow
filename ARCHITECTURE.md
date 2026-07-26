# Winnow — Architecture

Status: Implemented through improvement-plan tranche T4
Last updated: 2026-07-26

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
  established in Phase 0 so nothing needs re-plumbing later; the detailed
  palette itself is still a Phase 5 design concern — only the mechanism is
  wired early.
- **Design references.** Visual references for building the UI (shell layout,
  calendar grid, event cards, popovers, category bars) live in
  [`docs/design/ui-reference.md`](docs/design/ui-reference.md) — consult them
  for the 0.3 shell, the Phase 4 Calendar module, and the Phase 5 visual pass.
  They guide layout and interaction patterns; the exact palette is reconciled
  with the "one dominant color + accent" rule in Phase 5.

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
- The **dashboard depends on the four modules' read queries; the modules
  never depend on the dashboard.** This one-directional rule is what keeps
  the "unified home" from turning into duplicated logic — the dashboard is
  an aggregator, never a second implementation of a module's rules.

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

> **The tables below are the v1 plan, not a current reference.** Later work
> added `calendars`, `event_exceptions`, `goals`, `milestones`,
> `task_recurrences`, `transaction_recurrences` and `user_preferences`, and
> never built the planned `accounts` table. `drizzle/` and each module's
> `schema.ts` are the source of truth; the ADRs in `docs/adr/` record why the
> shape changed. What is still worth reading here is the _reasoning_.

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

### 3.2 To-dos

**lists**

| field      | type              | notes               |
| ---------- | ----------------- | ------------------- |
| id         | uuid (pk)         |                     |
| user_id    | uuid (fk → users) |                     |
| name       | text              | e.g. "Work", "Home" |
| sort_order | int               | for manual ordering |
| created_at | timestamptz       |                     |

**tasks**

| field                   | type                        | notes                                    |
| ----------------------- | --------------------------- | ---------------------------------------- |
| id                      | uuid (pk)                   |                                          |
| user_id                 | uuid (fk → users)           |                                          |
| list_id                 | uuid (fk → lists, nullable) | a task may belong to no list             |
| title                   | text, required              |                                          |
| notes                   | text, nullable              |                                          |
| due_date                | date, nullable              | date-only, no time-of-day in v1          |
| priority                | enum(low, medium, high)     | default medium                           |
| status                  | enum(open, done)            | binary for v1, see SPEC open question #4 |
| completed_at            | timestamptz, nullable       | set when status → done                   |
| created_at / updated_at | timestamptz                 |                                          |

### 3.3 Calendar / Events

**events**

| field                   | type                                                 | notes                                     |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------- |
| id                      | uuid (pk)                                            |                                           |
| user_id                 | uuid (fk → users)                                    |                                           |
| title                   | text, required                                       |                                           |
| notes                   | text, nullable                                       |                                           |
| start_at                | timestamptz                                          |                                           |
| end_at                  | timestamptz, nullable                                | nullable to allow open-ended/point events |
| all_day                 | boolean                                              |                                           |
| recurrence_freq         | enum(none, daily, weekly, monthly, yearly), nullable |                                           |
| recurrence_interval     | int, default 1                                       | e.g. every 2 weeks                        |
| recurrence_end_date     | date, nullable                                       | open-ended if null                        |
| created_at / updated_at | timestamptz                                          |                                           |

Recurring **calendar** occurrences are **computed on the fly** for whatever
date range is being viewed (e.g., the visible month), not pre-materialized as
individual rows. This avoids the classic recurrence bug class of stale
materialized instances after an edit. The tradeoff originally accepted here —
no "edit just this one occurrence" — was later bought back with an
`event_exceptions` overlay rather than by materializing.

**This rule turned out to be specific to the calendar.** Recurring to-dos and
recurring transactions both materialize real rows, lazily on read, because a
to-do you can tick off and a payment that hits your ledger have to _exist_.
Their tradeoffs are opposite and deliberate: the task generator keeps exactly
one open instance and retires the rest, while the transaction generator is
insert-only and never rewrites a posted row. See ADR-0004 for the money case
and the constraint it carries (enabling `cacheComponents` would make writing
during a render illegal).

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
`/today` — and `(user_id, created_at)` for the newest-first scan behind quick
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

**Status: not yet implemented.** The app currently ships the web
manifest and install metadata (§6.1) but registers **no** service worker
— installability works, offline caching does not. The strategy below is
the design to build when that work is picked up (a later tranche; see
`docs/IMPROVEMENT-PLAN.md`).

When added, the service worker will be generated by a standard
Workbox-based Next.js PWA plugin rather than hand-rolled (verify current
maintenance/version of whichever plugin is chosen at implementation time
— this is a fast-moving corner of the ecosystem). Its scope is
deliberately narrow given the online-first requirement:

- **Static app-shell assets** (JS/CSS bundles, icons, fonts): cache-first
  or stale-while-revalidate, for faster repeat loads.
- **Everything else — all `/api/*` routes, Server Action calls, and any
  page rendering live data (tasks, events, transactions, macros)**:
  **network-only, never cached.** This is the one rule that matters most
  here: showing stale financial or task data because a service worker
  served a cached response would be actively misleading, not just a
  minor UX nit. There is no offline-write queue, no background sync, and
  no cached "last known" data view in v1 — if the network is unreachable,
  the app should clearly show that, not silently serve stale content.
- This also means the service worker's job in v1 is really "make the app
  installable and load its static shell fast," not "make the app work
  offline." True offline support is explicitly Later (SPEC.md §6) and
  would mean revisiting this caching strategy, likely alongside a
  local-first data layer — not a small addition to this one.

### 6.3 iOS install caveats to design around

- The device must be joined to the tailnet for the `.ts.net` hostname to
  resolve at all; installation must happen via Safari specifically (iOS
  restricts "Add to Home Screen" PWA installation to Safari, not other
  browser apps on iOS).
- No web push before iOS 16.4, and push is out of scope anyway (SPEC.md
  §6) — no action needed now, just don't assume push works on older iOS.
- iOS can evict a Safari/PWA's local storage after a period of disuse.
  Since v1 keeps no offline data, the main consequence is a potential
  forced re-login if a session cookie is evicted — mitigated by a
  reasonably long-lived session and the fact that re-login is one
  account, low friction, not a real usability problem.
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
│   │   │   ├── page.tsx              # dashboard — default route
│   │   │   ├── todos/
│   │   │   ├── calendar/
│   │   │   ├── budget/
│   │   │   └── meals/
│   │   ├── api/
│   │   │   └── auth/[...nextauth]/
│   │   └── layout.tsx                # root layout: PWA meta tags, fonts
│   │
│   ├── modules/                      # one folder per domain module
│   │   ├── todos/
│   │   │   ├── schema.ts             # Drizzle table definitions
│   │   │   ├── queries.ts            # reads (used by RSC + dashboard)
│   │   │   ├── actions.ts            # Server Actions (mutations)
│   │   │   ├── service.ts            # pure business logic (overdue calc, etc.)
│   │   │   └── validation.ts         # Zod schemas, shared client/server
│   │   ├── calendar/                 # same shape (+ recurrence expansion in service.ts)
│   │   ├── budget/                   # same shape (+ rollup calc in service.ts)
│   │   ├── meals/                    # same shape, plus the files below
│   │   │   ├── restore.ts            # row → insert-payload maps for every undo path
│   │   │   ├── off-mapping.ts        # pure: OFF product → ImportedFood
│   │   │   ├── off-request.ts        # pure: URL building, error classification
│   │   │   └── off-client.ts         # server-only: owns fetch, never throws
│   │   └── dashboard/
│   │       └── queries.ts            # composes the other modules' queries.ts only
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn primitives, unmodified/lightly themed
│   │   └── shared/                   # nav, page headers, app-wide shared pieces
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
- **`modules/dashboard` may only import from other modules' `queries.ts`
  files**, never their `actions.ts`, and other modules never import from
  `dashboard`. This is the mechanical enforcement of §2's one-directional
  rule and directly protects the "unified home, not duplicated logic"
  principle from SPEC.md.
- Unit tests are colocated with the code they test (e.g.,
  `modules/budget/service.test.ts` next to `service.ts`) so there's no
  separate mental map to maintain as a solo developer. Playwright E2E
  tests live separately (e.g., `e2e/`) since they exercise the whole
  running app rather than one module.
- **The five-file shape is a floor, not a ceiling.** `meals/` is the module
  that has outgrown it, and the extra files exist for one reason each — to
  make something testable that otherwise wouldn't be:
  - `restore.ts` — every `restoreX` action re-inserts a deleted row by listing
    its columns, and that list has silently fallen behind the schema three
    times (`842f420` for tasks, T3-S11 for transactions, T4-S11 for the
    account data tools). TypeScript can't catch it: a column omitted from an
    insert is left NULL, which is valid. Hoisting the column lists out of
    `actions.ts` lets `restore.test.ts` assert them against
    `getTableColumns()`, so forgetting one fails a test instead of losing data
    on undo. `src/modules/account/coverage.test.ts` does the same job one level
    up for `clearAllData` / `exportUserData`.
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
