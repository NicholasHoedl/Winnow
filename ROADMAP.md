# Winnow — Roadmap

Status: Draft v1 (pre-implementation)
Last updated: 2026-07-21

> **Historical. Preserved as written, not maintained.** This is the plan the project
> started from; it is kept because the _reasoning_ about sequencing is still worth
> reading, and it is deliberately not edited to match what happened.
>
> Two things it says are no longer true, and both matter:
>
> - **"At the end of every phase, the app runs on the home server."** It never did. The
>   deploy happened once, at the end rather than per phase, on **2026-08-25** — that was
>   Checkpoint 0.4, closed long after the phases it was meant to punctuate. One part of it
>   is still unfinished: the host does not bring the stack back by itself after a reboot.
>   See `docs/HANDOFF.md` §1 and `docs/runbooks/deploy.md`.
> - **The visual palette is no longer "a Phase 5 concern".** It was settled after T7:
>   one warm scheme, no picker. See ARCHITECTURE.md §1.3.
>
> For where the project actually stands, read `docs/HANDOFF.md`. For what was built
> after the MVP, read `docs/IMPROVEMENT-PLAN.md`.

This roadmap assumes SPEC.md and ARCHITECTURE.md. Each phase is scoped to
be **independently shippable**: at the end of every phase, the app runs on
the home server, is reachable over Tailscale, and does something real —
nothing is left half-wired between phases.

## How the phases are sequenced, and why

Phase 0 sets up everything (repo, Docker, Tailscale HTTPS, auth, base
schema, app shell + dashboard skeleton). After that, the four modules are
built one at a time, each ending with that module wired into the
dashboard. Recommended order:

**To-dos → Meal Macros → Budgeting → Calendar** — then Dashboard/iPhone/
Backup polish.

Reasoning:

- **To-dos first** (as the brief suggests): the simplest domain model of
  the four, so it validates the entire stack end to end — DB → business
  logic → Server Action → UI → dashboard card — with the least incidental
  complexity. If something is wrong with the foundations, this phase
  finds it cheaply.
- **Meal Macros second**: similar CRUD simplicity to To-dos (a catalog +
  daily entries), but introduces the "sum entries, compare to a target"
  aggregation pattern that Budgeting will reuse and the dashboard needs
  more of. A good second rep of the same muscle before it gets harder.
- **Budgeting third**: a real step up — more entities (accounts,
  categories, transactions, budgets) and real relational integrity
  requirements (money math, account balances), but no new *architectural*
  pattern versus Meal Macros — it's CRUD plus aggregation again, just with
  more moving parts and a correctness bar that matters more (money).
- **Calendar last**: recurrence expansion is the single trickiest piece of
  logic in the whole MVP, and "long-term scheduling" is the one module
  with an open scope question (SPEC.md §9 #1). Doing it last means it
  benefits from a proven stack *and* gives the user a few weeks of daily
  use of the rest of the app to figure out whether calendar/events is
  really what "long-term scheduling" meant before locking in the design.

This order is a recommendation, not a constraint — if, say, budgeting is
the single most painful gap in daily life right now, it's reasonable to
swap it earlier. The point is the reasoning above, not the exact order.

---

## Phase 0 — Foundations

**Goal**: an empty-but-real, secured, installable app running on the home
server, reachable from both laptop and iPhone, with nothing module-specific
built yet.

This phase has more infrastructure surface than the others, so it's broken
into checkpoints below — each one is a point where progress can actually be
verified before moving to the next.

### Checkpoint 0.1 — Project scaffold
- Deliverables:
  - Next.js (App Router) + TypeScript project, pnpm-managed.
  - Tailwind CSS + shadcn/ui installed and configured with light/dark
    theme tokens and a working theme toggle (base theme only — the detailed
    visual palette is still Phase 5; only the light/dark mechanism is wired
    now).
  - ESLint/Prettier (or Biome) configured.
  - Repo structure matches ARCHITECTURE.md §7.
- Acceptance criteria:
  - `pnpm dev` runs a default page locally.
  - `pnpm build` succeeds with no type errors.

### Checkpoint 0.2 — Data layer and auth
- Deliverables:
  - Postgres running via Docker Compose locally.
  - Drizzle configured against it; base migration tooling works
    (`drizzle-kit generate`/`migrate` or equivalent).
  - `users` table migrated (JWT sessions — no Auth.js adapter tables needed).
  - Auth.js configured with a Credentials provider; single user seeded via
    a seed script reading credentials from environment variables.
  - Login page; authenticated route group redirects unauthenticated
    requests to it.
- Acceptance criteria:
  - Correct credentials log in and reach the (still-empty) authenticated
    shell; incorrect credentials are rejected.
  - Restarting the Postgres container does not lose the seeded user
    (volume persistence confirmed locally).

### Checkpoint 0.3 — App shell and dashboard skeleton
- Deliverables:
  - Root layout with PWA meta tags; authenticated layout with a responsive
    nav shell — sidebar on desktop, bottom tab bar on mobile — linking to
    Dashboard, To-dos, Calendar, Budget, Meals, plus the theme toggle.
  - Dashboard page at the authenticated root, with four placeholder cards
    (one per module) — empty/stub state is fine, but the **layout and
    card structure are real**, since Phase 1+ will fill them with live
    data rather than rebuild them.
- Acceptance criteria:
  - Navigating between all five destinations works and the shell/nav
    persists.
  - Nav renders as a sidebar on desktop and a bottom tab bar on mobile;
    the light/dark toggle works and the choice persists across reloads.
  - Dashboard renders four distinct card slots.

### Checkpoint 0.4 — Docker Compose deploy + Tailscale HTTPS + PWA install
- Deliverables:
  - Multi-stage `Dockerfile` for the app; `docker-compose.yml` with `app`
    + `postgres` services and a named volume, matching
    ARCHITECTURE.md §4.2.
  - Deployed to the actual home server hardware.
  - Tailscale installed on the host; MagicDNS + HTTPS certificates enabled
    in the admin console; `tailscale serve` forwarding the tailnet HTTPS
    origin to the app container, per ARCHITECTURE.md §4.3.
  - `manifest.webmanifest`, icon set, and a minimal service worker
    registered per ARCHITECTURE.md §6 (static-shell caching only,
    network-only for everything dynamic).
    *(The manifest and icons shipped here; the service worker did not —
    this line over-claimed until **T6b**, which registered `public/sw.js`
    on exactly those terms and added an offline fallback page.)*
- Acceptance criteria:
  - App is reachable at `https://<hostname>.<tailnet>.ts.net` from the
    laptop, over Tailscale, with a browser-trusted certificate (no
    warnings).
  - Same URL is reachable from the iPhone (Tailscale app installed and
    connected on the phone).
  - App is confirmed **not** reachable from a device/network outside the
    tailnet.
  - On the iPhone, Safari → Share → "Add to Home Screen" produces a home
    screen icon that launches standalone (no Safari address bar/chrome).
  - Login works identically from both devices.

**Phase 0 is done** when Checkpoints 0.1–0.4 all pass. At this point the
app is a real, secured, installable shell with no module features yet —
which is itself a meaningful, demonstrable milestone (the hardest
infrastructure risk — Tailscale HTTPS + iPhone install — is retired before
any module work begins).

---

## Phase 1 — To-dos

**Goal**: the first real, live-data vertical slice — including its
dashboard card.

- Deliverables:
  - `lists` and `tasks` tables + migration (ARCHITECTURE.md §3.2).
  - `modules/todos`: queries, Server Actions (create/update/delete task,
    toggle status, create/rename/delete list), a `service.ts` with the
    overdue/due-today logic, Zod validation shared by form + action.
  - UI: task list view (filter by list/status), quick-add input, task
    edit form (title, notes, due date, priority, list) using shadcn Form +
    React Hook Form, list management (create/rename/delete).
  - Dashboard "Tasks" card wired to real data: overdue count + due-today
    list, linking through to the full To-dos view.
  - Tests: Vitest unit tests for the overdue/due-today calculation
    (including timezone edge cases per SPEC.md open question #9), an RTL
    test for the quick-add form, one Playwright happy path (create a
    task → appears in list → mark done → drops out of active view).
- Acceptance criteria:
  - Can create, edit, complete, and delete a task from both laptop and
    iPhone.
  - Overdue/due-today logic is correct (test-verified) and consistent
    with the configured timezone.
  - Dashboard's Tasks card shows accurate live counts, not placeholder
    data.
  - Data persists across a container restart.

---

## Phase 2 — Meal Macros

**Goal**: second module live, reinforcing the CRUD + aggregation pattern
the dashboard depends on.

- Deliverables:
  - `foods`, `meal_entries`, `macro_targets` tables + migration
    (ARCHITECTURE.md §3.5).
  - `modules/meals`: queries, Server Actions (CRUD foods, add/remove
    entries, set macro targets), `service.ts` with the daily-totals
    calculation (sum of entries scaled by servings, joined to foods).
  - UI: food catalog (search/create), quick "log an entry" flow
    (food + servings + date, defaulting to today), daily log view with
    totals-vs-targets progress display.
  - Dashboard "Macros" card wired to today's live totals vs. targets.
  - Tests: Vitest unit tests for the totals calculation (including
    fractional servings), RTL test for the add-entry flow, one Playwright
    happy path (create a food → log an entry → totals update correctly).
- Acceptance criteria:
  - Totals math is correct, including fractional servings (test-verified).
  - Logging a meal from the phone takes at most 3 taps once the food
    already exists in the catalog (quick-add is actually quick, not just
    technically functional).
  - Dashboard's Macros card shows live totals vs. targets for today.
  - Data persists across a container restart.

---

## Phase 3 — Budgeting

**Goal**: third module live — the first one where correctness of money
math matters in a way that would be genuinely bad to get wrong.

- Deliverables:
  - `accounts`, `categories`, `transactions`, `budgets` tables + migration
    (ARCHITECTURE.md §3.4), all monetary fields as integer cents.
  - `modules/budget`: queries, Server Actions (CRUD accounts/categories/
    transactions/budgets), `service.ts` with account balance calculation
    and the monthly rollup (spent vs. budgeted per category, navigable by
    month).
  - UI: accounts list with balances, transaction quick-add + list (filter
    by account/category/month), budget setup screen, monthly summary
    view.
  - Dashboard "Budget" card wired to the current month's status (e.g.
    total spent vs. budgeted, and/or categories at risk).
  - Tests: Vitest unit tests for balance calculation and monthly rollup
    (explicitly including cent-precision edge cases, e.g. repeated
    fractional-dollar amounts, to prove there's no float rounding drift),
    RTL test for the transaction form, one Playwright happy path (add an
    account → add a transaction → see updated balance and monthly
    summary).
- Acceptance criteria:
  - Adding a transaction correctly updates its account's balance and the
    relevant monthly rollup.
  - Money math has zero floating-point rounding error across the test
    suite (integer-cents arithmetic verified, not assumed).
  - Dashboard's Budget card reflects live current-month data.
  - Data persists across a container restart.

---

## Phase 4 — Calendar / Long-term Scheduling

**Goal**: fourth module live, including the trickiest logic in the MVP
(recurrence), with the scope ambiguity resolved before or at the start of
this phase rather than mid-build.

- Pre-phase step: revisit SPEC.md open question #1 with the user
  (calendar/events vs. also goals/milestones) now that three modules and
  the dashboard have been in daily use. Confirm calendar/events is still
  the right v1 scope before writing the schema.
- Deliverables:
  - `events` table + migration (ARCHITECTURE.md §3.3).
  - `modules/calendar`: queries (including recurrence expansion for a
    given date range), Server Actions (CRUD events), `service.ts` housing
    the recurrence-expansion logic as pure, independently testable
    functions.
  - UI: month view (primary) + simple agenda/list view, event create/edit
    form with a simple recurrence picker (none/daily/weekly/monthly/
    yearly + optional end date).
  - Dashboard "Today" (events) card wired to live data, including
    correctly expanded recurring instances landing on today.
  - Tests: Vitest unit tests for recurrence expansion — specifically
    edge cases (monthly recurrence anchored on the 31st, yearly leap-day
    events, far-future single events several years out), RTL test for
    the event form, one Playwright happy path (create a recurring event →
    confirm it appears correctly across several months in the view).
- Acceptance criteria:
  - Recurring events expand correctly across the tested date range,
    including the specific edge cases above.
  - A single event dated years in the future displays correctly.
  - Dashboard's events card is correct for today, including any
    recurring instances landing today.
  - Data persists across a container restart.

---

## Phase 5 — Dashboard Polish, iPhone Install Polish, Backups

**Goal**: the "unified home" insight gets its finishing pass, the iPhone
experience gets hardened, and backup/restore stops being theoretical.

- Deliverables:
  - **Dashboard**: finalize layout across all four live cards; empty and
    loading states; responsive layout tuned for both phone and laptop; a
    single quick-add entry point from the dashboard if it doesn't feel
    redundant with per-module quick-adds (judgment call to make in the
    moment, not a hard requirement).
  - **Visual design pass**: apply the intended distinctive direction
    (display/body/mono fonts, one dominant color + accent, an
    orchestrated page-load reveal) using the design-focused skill/process
    the user already has for this — intentionally deferred until now so
    it's applied once, across a complete app, rather than four times.
  - **iPhone install polish**: verify icons/splash rendering, status bar
    theming, safe-area handling on an actual notch/Dynamic Island device,
    standalone-mode link behavior, and that login sessions survive
    app relaunch from the home screen icon.
  - **Certificate renewal check**: confirm (per ARCHITECTURE.md §4.3)
    that `tailscale serve`'s managed certificate is renewing itself with
    no manual action; if the manual `tailscale cert` path was used
    instead, set up and document the renewal cron now.
  - **Backups**: implement the host-level `pg_dump` cron/systemd timer
    (ARCHITECTURE.md §4.4), confirm dumps land outside the Docker volume,
    and — the actual bar — **perform one real restore into a fresh
    Postgres instance and confirm the data matches**. Document the
    restore steps as a short runbook.
  - Full Playwright smoke pass across all four modules + dashboard
    together.
- Acceptance criteria:
  - Dashboard is the default landing page and accurately reflects all
    four modules' "today" state at a glance, with no placeholder data
    anywhere.
  - App installs cleanly on iPhone and behaves like a standalone app in
    real use, not just in a quick test.
  - A backup exists on a schedule, and a restore from it has actually
    been performed successfully at least once, with steps documented.
  - HTTPS certificate renewal is either automatic (confirmed) or has a
    documented, scheduled manual process.

**This phase is the end of the planned MVP.** Anything beyond this point
belongs in SPEC.md's Later section, revisited only after real daily use
surfaces an actual need.

---

## Summary Table

| Phase | Focus | New risk retired |
|---|---|---|
| 0 | Foundations, shell, deploy pipeline | Tailscale HTTPS + iPhone install (the biggest infra unknown) |
| 1 | To-dos | Full stack proven end to end on the simplest domain |
| 2 | Meal Macros | Aggregation pattern (totals vs. targets) |
| 3 | Budgeting | Money-safe math, more relational complexity |
| 4 | Calendar | Recurrence expansion; scope ambiguity resolved |
| 5 | Polish + backups | Visual identity, iPhone hardening, proven restore |

Every phase ends with something real running on the home server and
reachable from the phone — there is no phase where the app is "in
progress" and unusable end to end.
