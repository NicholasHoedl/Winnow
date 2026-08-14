# Winnow — Product Specification

Status: Draft v1 (pre-implementation)
Owner: solo developer / single user
Last updated: 2026-07-21

> **Historical, like `ROADMAP.md`. Preserved as written, not maintained.** This is the
> product this project set out to build, and it is still the best statement of _why_ Winnow
> exists — §4's core insight drives decisions being made today. It is not a description of
> what now exists.
>
> The shipped app has passed it in several places, and §6's out-of-scope list is where that
> shows most sharply:
>
> - **"AI features of any kind"** is listed out of scope for v1. The AI companion is now a
>   shipped, first-class feature with its own nav tab — see ADR-0011 for the boundary it
>   works within, which is the part worth reading before touching it.
> - **Barcode lookups and a nutrition database** are listed out of scope. Both shipped
>   (Open Food Facts, ADR-0005).
> - **Recurring-event exceptions** are listed out of scope. They shipped in T5b.
> - **Notes/journal, routines, habits and the weekly review** are absent entirely — they are
>   T7 and T12a, neither of which was on any plan when this was written. Habits in particular
>   are now a quota and a log rather than a kind of task (ADR-0014).
> - **To-dos and Goals are one page**, `/activity`, not the separate modules §7 describes
>   (ADR-0013).
>
> For what is actually built and where it stands, read `docs/HANDOFF.md`.

## 1. Problem Statement

The user currently manages their life across a pile of separate apps: a to-do
app, a calendar app, a budgeting app or spreadsheet, and a macro/nutrition
tracker. Each is fine in isolation, but none of them talk to each other, and
there is no single place to see "what does today look like across
everything I'm responsible for." Switching between four apps to reconstruct
that picture is the actual daily friction Winnow exists to remove.

Winnow is a self-hosted, personal life-organizer web app that replaces that
pile with one place: one login, one navigation shell, one dashboard.

## 2. Vision

Winnow is not four mini-apps bolted together behind a shared login. The
**unified home is the product.** Any dedicated to-do app, calendar app,
budgeting app, or macro tracker can out-feature Winnow on its own turf — that
is not the competition. The thing none of them do is sit next to the other
three and answer, in one glance and one screen load:

> "What do I need to do today, what's on my calendar today, how is my
> spending doing this month, and did I hit my macros today?"

That glance is the dashboard, and it is a first-class citizen of the
architecture from day one — not a page bolted on after the four modules are
"done." Every module phase in the roadmap includes wiring its data into the
dashboard as a concrete deliverable, not an afterthought.

A day in the life once Winnow exists: the user opens the app (browser on the
laptop in the morning, home-screen icon on the phone during the day) and the
dashboard already shows what's due, what's scheduled, whether they're on
budget this month, and where their macros stand today — without opening
anything else.

## 3. Target User

A single user (the developer themself): someone who wants their personal
data (tasks, schedule, finances, nutrition) under their own control, on
their own hardware, reachable from a personal computer and an iPhone,
without depending on a third-party cloud service, subscription, or account
system to manage their own life.

Winnow is designed single-user throughout. It is **not** designed for
teams, families sharing data, or public use in v1 (see Non-Goals and
ARCHITECTURE.md's single-user data model note).

## 4. Core Insight (repeated, because it drives every downstream decision)

The value is the **unified home** — one cohesive app shell and dashboard —
not the individual modules. Concretely, this means:

- The dashboard is built in Phase 0 (as a skeleton) and refined in every
  subsequent phase, not left until the end.
- Navigation between modules must feel like moving within one app (shared
  shell, shared nav, shared visual language), not like switching between
  four separate tools that happen to share a login.
- The dashboard aggregates **read-only data** from each module; it does not
  duplicate business logic. (See ARCHITECTURE.md for the dependency rule
  this implies.)
- New modules are only worth adding later if they can genuinely feed the
  dashboard's "today at a glance" picture — that is the bar for scope
  creep, not "would be a nice standalone feature."

## 5. In Scope (v1)

- **To-dos**: tasks with title, notes, due date, priority, status, and
  simple lists for grouping.
- **Calendar / long-term scheduling**: events with title, start/end,
  all-day flag, notes, and simple recurrence, supporting far-future dates.
- **Budgeting**: accounts, transactions, categories, budgets per
  category/period, monthly rollups.
- **Meal macros**: a food catalog, daily meal entries, daily totals vs.
  macro targets.
- **Unified dashboard**: today's tasks, today's events, this month's budget
  status, today's macros vs. targets, all in one view.
- Single-account login (data scoping + basic guard, not a security
  perimeter — see ARCHITECTURE.md).
- Installable PWA: usable in a laptop browser and installed to an iPhone
  home screen via Safari.
- Light and dark themes: follows the device's system setting, with a
  manual toggle. (Confirmed design decision.)
- Equal-priority responsive design: both laptop and phone are first-class
  surfaces — every screen is deliberately designed for both breakpoints,
  not merely made to not break on mobile. A deliberate trade of some build
  speed for a genuinely good experience on both devices. (Confirmed design
  decision.)
- Self-hosted via Docker Compose on the user's own home hardware.
- Private-only access over the user's Tailscale mesh, with valid HTTPS.
- A basic, actually-tested backup/restore procedure.

## 6. Out of Scope for v1 ("Later")

Explicitly deferred. Do not design for these now; revisit only after the
MVP is in real daily use.

- Offline / local-first support and background sync.
- Native iOS app / App Store distribution.
- Multi-user, sharing, or any per-record permissions model.
- Third-party integrations: bank/transaction imports, calendar
  import/sync (Google/Apple Calendar, etc.), nutrition database or barcode
  lookups.
- Push notifications (iOS supports PWA web push from 16.4+, but it's not a
  v1 need).
- AI features of any kind (auto-categorization, natural-language entry,
  smart suggestions, etc.).
- Recurring-event exceptions ("edit just this one occurrence" of a
  recurring event).
- Historical versioning of macro targets or budget amounts (v1 tracks only
  the current target/budget going forward).
- Public/internet-exposed access, Tailscale Funnel, or any path that takes
  the app outside the private tailnet.
- Passkey/WebAuthn login (plausible near-term upgrade, not a v1 requirement
  — credentials-based login is sufficient given the network boundary).
- Recurring / repeating tasks. v1 tasks are one-off; anything time-based
  and repeating is modeled as a calendar event instead. Recurring tasks
  are a natural fast-follow once the calendar recurrence engine exists
  (see ROADMAP Phase 4). (Confirmed design decision.)
- Tag-based (many-to-many) task organization beyond simple lists.
- Reporting/analytics/charts beyond simple totals-vs-targets and
  spent-vs-budgeted views.

## 7. Modules (Feature Level)

### 7.1 To-dos

- Create/edit/delete tasks with: title (required), notes (optional), due
  date (optional, date-only — no time-of-day in v1), priority
  (low/medium/high), status (open/done).
- Group tasks into simple **lists** (e.g., "Work", "Home", "Errands") —
  each task belongs to at most one list. Cross-cutting tags are **not**
  v1 scope (see ARCHITECTURE.md §Data Model for the reasoning).
  Judgment call: lists are simpler to build, simpler to browse, and cover
  the common "buckets" use case; many-to-many tags add a join table and a
  tag-management UI whose value is unproven for a single user. Flagged as
  an open question below in case the user's actual mental model is
  tag-first rather than list-first.
- Mark tasks done/not done; done tasks drop out of default "active" views
  but remain queryable.
- Views: all active tasks, by list, overdue, due today.
- Feeds the dashboard: count (and short list) of tasks due today and
  overdue.

### 7.2 Long-term Scheduling (Calendar / Events)

- Create/edit/delete events with: title (required), notes (optional),
  start date/time, end date/time, all-day flag, and simple recurrence
  (none / daily / weekly / monthly / yearly, with an optional end date).
- Supports far-future single events and far-future recurring series
  (e.g., a birthday recurring yearly, a mortgage payment recurring
  monthly) without any practical date-range limit.
- Views: month view (primary), and a simple agenda/list view.
- Feeds the dashboard: today's events.
- **Ambiguity flag** (see Open Questions #1): "long-term scheduling" as a
  phrase could mean either (a) a calendar of dated events/appointments, or
  (b) something closer to goals/milestones without a fixed date ("run a
  marathon eventually," progress-tracked rather than calendar-anchored).
  This spec treats it as (a) — a calendar/events module — for v1, because
  it reuses well-understood patterns and directly satisfies "supports
  far-future dates." If the user actually wants (b) as well, that is a
  distinct, additive module for Later, not a v1 redesign.

### 7.3 Budgeting

- **Accounts**: name, type (checking/savings/credit/cash/other), starting
  balance.
- **Categories**: name, kind (income/expense).
- **Transactions**: amount, date, account, category, income/expense type,
  optional description.
- **Budgets**: an amount per category per month.
- **Monthly rollups**: spent vs. budgeted per category for the current
  month (and browsable past months), computed from transactions — not a
  separately maintained ledger.
- All monetary values are handled as integer cents internally (see
  ARCHITECTURE.md) to avoid floating-point rounding bugs — this is a
  correctness requirement, not a nice-to-have, given this is real personal
  financial data.
- Feeds the dashboard: current month's budget status (spent vs. budgeted,
  at minimum in total, and/or categories at risk of going over).

### 7.4 Meal Macros

- **Foods**: name, serving label (e.g., "1 cup", "100g"), calories,
  protein (g), carbs (g), fat (g).
- **Meal entries**: a food + date + number of servings (+ optional meal
  type: breakfast/lunch/dinner/snack).
- **Macro targets**: one current calorie/protein/carb/fat target per user
  (no historical target versioning in v1).
- Daily log view: entries for the day with running totals vs. targets.
- Feeds the dashboard: today's totals vs. targets.

### 7.5 Unified Dashboard

- Default landing page after login.
- Shows, without navigation: tasks due today/overdue, today's calendar
  events, this month's budget status, today's macros vs. targets.
- Each card links through to its module for detail/edit.
- Built as a thin **aggregator** of each module's own read queries (see
  ARCHITECTURE.md) — it must never become a place where module business
  logic is reimplemented or duplicated.

## 8. Non-Functional Requirements

- **Online-first**: requires a live connection to the home server over
  Tailscale; no offline read/write support in v1.
- **Single-user**: data model is user-scoped throughout (every table
  carries a `user_id`) so multi-user is a smaller lift later, but no
  multi-tenant behavior (sharing, permissions, invites) is built now.
- **Self-hosted**: runs on the user's own always-on home hardware via
  Docker Compose; no managed cloud dependency.
- **Private-only**: reachable exclusively over the user's Tailscale
  tailnet; never exposed to the public internet.
- **Installable**: usable as a normal web app in a laptop browser, and
  installable to an iPhone home screen as a standalone PWA via Safari.
- **Maintainable solo**: every technical choice should be justifiable to a
  single maintainer with normal life constraints — see ARCHITECTURE.md's
  stack rationale and the "guard against over-engineering" framing that
  runs through this whole plan.

## 9. Open Questions

These should ideally be answered before or during the relevant roadmap
phase — none of them block starting Phase 0.

1. **"Long-term scheduling" scope** (see §7.2): calendar/events only, or
   also goals/milestones? Recommendation: build calendar/events now
   (Phase 4, last of the four modules by design — see ROADMAP.md), and
   decide on goals/milestones as a distinct Later module once daily use
   makes the real gap (if any) obvious.
2. **Lists vs. tags for to-dos** (see §7.1): is a single list per task
   enough, or does the user's actual task-organizing habit need
   cross-cutting labels (multiple tags per task)? Assumed: lists are
   enough for v1.
3. **Priority levels**: assumed 3-level (low/medium/high). Confirm before
   Phase 1, trivial to change either direction.
4. **Task status granularity**: assumed binary (open/done). Confirm
   whether an "in progress" state is actually wanted, or whether that's
   over-engineering a to-do list. Default answer: binary is enough.
5. **Budget period**: assumed monthly-only for v1 (matches "monthly
   rollups" in the brief). Weekly/yearly budget periods are a Later
   option if the user wants them.
6. **Food catalog scope**: assumed manual entry only (name + macros typed
   in by the user), consistent with "no third-party integrations." No
   barcode/nutrition-API lookups in v1.
7. **Host hardware**: which physical machine is this running on (Pi,
   mini PC, NAS, existing desktop)? Doesn't change the plan, but
   determines Docker image architecture (arm64 vs. amd64) before Phase 0
   infrastructure work starts.
8. **Backup destination**: local-disk-only backup (separate disk/volume
   on the same machine) is the assumed v1 minimum. Off-site backup (e.g.,
   copied to cloud storage or another physical location) is a
   straightforward Later addition, flagged here so it's a deliberate
   choice rather than an oversight.
9. **Timezone handling**: assumed the user operates in a single, fixed
   timezone (timestamps stored in UTC, rendered in one configured local
   timezone). If the user travels across timezones regularly and expects
   due dates/events to track that, this needs a small design addendum
   before Phase 1/4.

## 10. MVP Definition of Done / Success Criteria

Winnow's v1 is done when **all** of the following are true:

1. All four modules (to-dos, calendar, budgeting, meal macros) support full
   create/read/update/delete on their core entities, backed by Postgres,
   scoped to the single user.
2. The dashboard is the default landing page and shows, with no further
   navigation: tasks due today/overdue, today's events, this month's
   budget status, and today's macros vs. targets — all from live data.
3. `docker compose up` on the home server brings up the full stack, and
   Postgres data survives container restarts and a full host reboot.
4. The app is reachable only via the Tailscale tailnet at a stable HTTPS
   URL (MagicDNS name), and is verified **not** reachable from outside the
   tailnet.
5. The app installs to an iPhone home screen via Safari "Add to Home
   Screen," launches standalone (no Safari chrome), and supports doing
   real daily entry (add a task, log a meal, add a transaction, check
   today's events) from the phone alone.
6. Single-account login gates access; wrong credentials are rejected.
7. At least one full backup has been taken **and a restore from it has
   actually been performed successfully** — "we have a backup script" does
   not count until a restore has been proven to work.
8. The user has used Winnow for real daily tasks (not test/seed data)
   across all four modules for at least one full week, with no data loss.

If all eight hold, v1 is complete and any further work belongs in the
Later backlog, not the MVP.
