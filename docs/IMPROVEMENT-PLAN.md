# Winnow — Improvement Implementation Plan

Derived from the full-app product review. This is the **master roadmap**: it groups every
proposed change into **tranches** that are dependency-ordered and independently shippable.
Each tranche is scoped enough to be expanded into a detailed implementation plan when it's
picked up — it is **not** code-level detail yet.

## Status

| Tranche                                       | State      |
| --------------------------------------------- | ---------- |
| T0 — Foundations, cohesion & safety           | ✅ shipped |
| T1 — Frictionless capture & navigation        | ✅ shipped |
| T2 — One product: links, Today hub, reminders | ✅ shipped |
| T3 — Depth: Budget                            | ✅ shipped |
| T4 — Depth: Meals                             | ✅ shipped |
| T5a — Depth: to-dos + goals                   | ✅ shipped |
| T5b — Depth: calendar (grid, drag, split)     | ✅ shipped |
| T5c-a — Calendar: iCal export + feed          | ✅ shipped |
| T5c-b — Calendar: event reminders (Web Push)  | after T7   |
| T6a — Robustness: data durability             | ✅ shipped |
| T6b — Robustness: offline fallback            | ✅ shipped |
| T7a — Net-new: Notes / Journal                | ✅ shipped |
| T7b — Net-new: Routines / templates           | ✅ shipped |
| T7c — Net-new: Habits / streaks               | ✅ shipped |
| T7d — Net-new: Weekly review                  | next       |

T5c-b moved behind T7 deliberately: it is the one remaining item that cannot be verified
without a deployed, installed PWA (iOS only permits Web Push from a home-screen app), and
it needs a scheduler, which this app does not have — page rendering IS the scheduler. Both
are hosting decisions. T7 needs none of that.

Corrections found while implementing, which this document's later tranches should not
repeat:

- **T4 corrected a claim made below and in the T4 plan**: `/today` was believed to be
  stale after every mutation because no module's revalidate helper names it. It isn't.
  Every route is dynamic (`auth()` reads cookies), `next.config.ts` sets no `staleTimes`,
  and Next uses staleTime 0 for dynamic routes — measured by reverting the fix and
  re-running the hub spec, which still passed. `revalidateHubs()` exists for consistency
  and as insurance if `staleTimes` is ever raised, but it is **defensive tidying, not a
  fix**, and the same caveat applies to the pre-existing `revalidatePath("/")` calls.

- **A whole class of e2e flake was locator hygiene, not app behaviour.** React's streaming
  SSR parks completed Suspense content in a `<div hidden id="S:n">` and leaves that div in
  the DOM, so a row exists twice — once rendered, once staged. Playwright's strict mode
  counts matches **before** `toBeVisible()` filters them, so any loose locator
  intermittently failed with "resolved to 2 elements" on a page showing exactly one. It is
  timing-dependent, so the failing spec kept moving around the suite instead of staying
  put, which is what made it look like flakiness rather than a bug. Confirmed by
  instrumentation (3/3: one `visible: true`, one `visible: false` inside `DIV#S:1`) and it
  reproduces against a **production** build, so it is not a dev-server artifact.

  Filtering each locator was whack-a-mole — it recurred across `div.bg-card`, `getByText`,
  `getByTestId`, a class selector and a `section` filter — so the fix is central:
  **`e2e/_test.ts`** wraps `page.goto` and `page.reload` to wait until no staging div
  remains, and every spec takes `test` from there instead of `@playwright/test`. React's
  `$RC` script does remove the div; the window is just short, and it bites hardest on
  DIRECT calls like `locator.innerText()`, because a strict-mode violation throws at once
  rather than retrying. Two cases the fixture can't see are handled at the call site:
  `todos-reorder` reads after a client-side mutation (scoped to `#content`, since the
  staging div sits at body level) and `meals-water-weight`'s water total keeps a
  `visible` filter. `e2e/_card.ts`'s `visibleCard()` stays as the standard card locator.

  **Result: 76/76 on three consecutive full runs**, from a rotating 2–4 failures before.

## How to use this

- Implement **one tranche at a time**, top to bottom (later tranches assume earlier ones).
- When starting a tranche, expand its "Scope" into concrete tasks and follow the normal
  loop: scope → schema/migration → pure logic + tests → validation → queries/actions →
  UI → verify (typecheck, lint, build, unit, browser) → review → commit.
- **Reuse the existing patterns** — they're good and consistent:
  - Module shape: `schema.ts` / `service.ts` (+ `*.test.ts`, pure) / `queries.ts`
    (`server-only`) / `actions.ts` (`"use server"` + `requireUserId` + Zod + `revalidatePath`)
    / `validation.ts`; pages consume only `queries.ts`.
  - Recurrence: the closed-form generator in **`src/lib/recurrence.ts`** (moved out of
    `todos/` once budget's recurring transactions needed it too — a `todos/recurrence.ts`
    survives only inside an abandoned worktree) + `syncRuleInstances`/`ensureRecurringTasks`
    in `todos/queries.ts` (lazy-on-read materialization), and the calendar
    `event_exceptions` read-time overlay (`applyExceptions`).
  - Undo: `useOptimistic` + a `restoreX` action surfaced via a Sonner toast action.
  - **There is no auto-discovery.** Corrected in T7a: `db/index.ts` and `drizzle.config.ts`
    are both hand-maintained lists, not globs, and a new module is ~23 touch points. The
    ones that fail _silently_ are the `drizzle.config.ts` entry (without it `db:generate`
    cannot see the table and may emit a destructive diff) and the `search/queries.ts`
    fan-out (compiles clean, module is simply never searchable). The `account/` block —
    `tables.ts`, `clear.ts`, `queries.ts` — fails loudly, because `coverage.test.ts` scans
    `src/modules/` on disk and goes red the moment a new `schema.ts` exists;
    `tables.test.ts` additionally pins an exact table count that must be bumped.

## Guiding principles

- **No regressions**: every tranche keeps the existing 90 unit tests green and adds its own.
- **Smallest safe change** within each item; follow existing idioms (base-ui, Tailwind
  tokens, integer cents, `YYYY-MM-DD` string dates, tz via `todayInZone`).
- **Cohesion over cleverness**: prefer extending a shared component to a one-off.
- Each tranche ends **committed** and verified before the next begins.

---

## Foundations & cross-tranche decisions

Build these once; multiple tranches depend on them. Where a **library decision** is needed,
it's flagged — confirm the choice when the tranche is picked up (this is a self-hosted app,
so prefer small, dependency-light, no-external-key options).

**Shared code to extract (Tranche 0):**

- `src/lib/date.ts` — hoist `todayInZone`, `isValidDateString`, and the private date helpers
  currently duplicated in `todos/service.ts`, `calendar/service.ts`, and `todos/recurrence.ts`.
- `src/lib/action-result.ts` — one `ActionResult` type + `invalid()` + `fieldErrorsFrom()`
  (currently copy-pasted across `account`, `preferences`, `todos`, `budget`, `calendar`,
  `meals` actions).

**Library decisions (confirm at point of use):**

- **Charts** (T3/T4/polish): hand-rolled SVG for small sparklines/rings vs a lib. Recommend a
  tiny lib only if we need axes/tooltips — candidate: `recharts` (heavier) or a minimal SVG
  chart component set built in-house (preferred for cohesion + bundle size).
- **Command palette** (T1): `cmdk` (small, headless) — pairs well with the existing base-ui.
- **Natural-language dates** (T1): `chrono-node` for "tomorrow 3pm"/"next fri"; keep the
  amount/macro parsing hand-rolled (small, testable regex in a pure `service.ts`).
- **Offline/service worker** (T6): ~~`@serwist/next`~~ — **no dependency taken.** T6b
  hand-wrote `public/sw.js` instead; see `docs/adr/0007-hand-written-service-worker.md`.
  Serwist is viable and maintained (the "needs webpack" objection died in Dec 2025), but its
  precache manifest has nothing to precache when every route is dynamic and auth-gated. The
  ADR records when to revisit: if navigations are ever cached, take the library.
- **External food DB / barcode** (T4): Open Food Facts REST API (free, no key) + `@zxing/browser`
  for camera barcode scan (PWA camera permission).
- **Reminder delivery** (T2): in-app "today digest" (no infra) as the baseline; optional email
  via a cron-hit internal endpoint + SMTP (Docker already present). Web-push stays out of scope.

---

## Tranche 0 — Foundations, cohesion & safety ✅

**Goal:** raise trust and remove inconsistencies before adding surface area. Cheap, high-signal,
and it unblocks later tranches (shared `ActionResult`, Goals module, shared date lib).

**Scope**

- Extract `src/lib/date.ts` and `src/lib/action-result.ts` (see Foundations); refactor callers.
- **Goals → its own module.** Move `goals`/`milestones` table defs + their queries/actions/
  validation from `src/modules/calendar/` into a new `src/modules/goals/`. Tables are unchanged,
  so **no DB migration** (drizzle sees no diff); update imports in `goals/_components/*` and the
  dashboard `goals-summary`.
- **Destructive-action consistency.** Today only single-item task/event/transaction/meal deletes
  have undo. Bring the outliers up to the same bar (undo toast _or_ a confirm dialog): category
  delete, budget delete, food-library delete, goal delete, milestone delete, and recurring-task
  "Stop repeating".
- **Currency correctness (Budget).** Replace the hardcoded `Amount ($)` label and `0.00`
  placeholder with the user's currency; handle **zero-decimal currencies** (JPY/¥) in the
  amount input + `dollarsToCents`/`formatCents`.
- **Wire dead actions.** `updateCategory` (rename/kind) and `updateFood` (edit a library food)
  exist but are unreachable — add the edit affordances.
- **Budget correctness.** Filter the transaction dialog's category list **by type** (no income
  category on an expense); add **min/max = current month** to the transaction date input (and to
  the meals log date) so entries can't silently land in another period.
- **Per-module error/loading boundaries.** Add `error.tsx`/`loading.tsx` to each of the 6 route
  segments so a failure in one module doesn't blank the shell (today there's one `(app)` pair).
- ~~**Docs:** fix the false "a service worker is registered" claim in `ARCHITECTURE.md §6.2`
  (align with reality until T6 ships one).~~ Done twice over: T6a corrected §6.2 to "not yet
  implemented", and **T6b** then actually registered one, so §6.2 now describes what runs.
- **Micro-polish:** the Goals `0/0` empty progress bar (show "no milestones yet" or hide the bar);
  add a skip-to-content link.

**Verify:** existing tests green; new confirm/undo flows tested in-browser; typecheck/lint/build;
currency round-trips for a zero-decimal currency; Goals still renders after the module move.

---

## Tranche 1 — Frictionless capture & navigation ✅

**Goal:** make getting data _in_ and getting _around_ nearly instant. Biggest daily-use payoff.

**Scope**

- **Command palette (⌘K) + global search.** Headless `cmdk` overlay: fuzzy nav to any page,
  "Create task/event/transaction/meal/goal", and search across tasks, events, foods,
  transactions, goals. Back it with a `search(query)` server action that fans out to each
  module's queries (title/name/description match, user-scoped, capped).
- **Global shortcuts:** ⌘K (palette), `n` (context-aware new), `g` then `t/c/g/b/m/d` to
  navigate. Small global key handler in the app shell; respect input focus.
- **Quick-capture bar** on the dashboard (and a persistent "New" affordance) that routes to the
  right module.
- **Natural-language quick-add** (pure, tested parsers in each module's `service.ts`):
  - Tasks: "call mom tomorrow", "gym every mon" (dates via `chrono-node`; recurrence keywords
    reuse the recurring-tasks vocabulary).
  - Budget: "coffee $4", "rent -1200 #housing" → amount/description/category.
  - Meals: "lunch 600cal 40p" or "banana ×2" (match a library food).
- **Meals capture overhaul** (the module's biggest friction): **food search** (filter the
  library), a **recent/frequent** list, and **one-tap re-log** — the `mealEntry.foodId` link is
  already stored "for re-log convenience" but nothing uses it; add the re-log path.
- **Budget quick-add** transaction (inline row) parallel to the todos quick-add.
- **Jump-to-date** pickers for Meals and Budget (today they only have prev/next chevrons).

**Deps:** T0 (shared date lib, currency). **Decisions:** `cmdk`, `chrono-node`.
**Verify:** parser unit tests; browser tests of palette nav/create/search and re-log; a11y of the
palette (focus trap, ESC).

---

## Tranche 2 — One product: links, Today hub, reminders ✅

> **Later correction (post-T5c-a): the `/today` hub is gone — folded into the dashboard.**
> T2 shipped it as a separate route on the reasoning below, that a focused agenda was
> "distinct from the dense dashboard". In daily use it read as two pages doing one job:
> they ran five of the same queries (`getTasks`, `getDayEvents`, `getCalendars`,
> `getMacroSummary`, `getBudgetSummary`) and shared a header, the capture bar and the stat
> cards. The only thing one had that the other didn't was the merged agenda, so the agenda
> moved to the dashboard and the route was deleted (`/today` now 308s to `/`). The
> dashboard's `UpNext` panel narrowed to `Tomorrow` at the same time — it had shown today's
> events too, which the agenda now covers, and keeping both printed them twice on one page.
>
> The dashboard's task card narrowed at the same time, to "Coming up": the agenda pins
> overdue and lists today's tasks inline, so leaving the card listing everything meant a
> task due today rendered twice on one screen — the same duplication one page down. It now
> shows only what the agenda doesn't, filtered against the agenda's own output rather than
> a second definition of "due today", and its overdue/due-today tallies are gone with it.
>
> **Two follow-up passes on the same surface, after using it:**
>
> 1. **It filled a third of the screen and scrolled.** `max-w-7xl` centred everything in
>    1280px, leaving ~270px dead each side of a 1920 display. Widened to `max-w-[120rem]`
>    (measured gutters: 0px). The height fix was structural rather than padding —
>    per-column measurement showed the centre carrying 706px against the right column's
>    464px, so the page height was set by an imbalance; moving the stat cards across fixed
>    it. The agenda came out of its full-width row into the first column at the same time.
>    Fits without scrolling from 1366×768 up. See ARCHITECTURE §2.1.
> 2. **A month/week toggle**, state in the URL so the server renders the chosen view.
>
> Both are documented in ARCHITECTURE §2.1 rather than here, because they describe how the
> page is built rather than what a tranche decided.
>
> The rest of T2 stands: the cross-module links and the digest engine are untouched, and
> the digest banner simply points at `/` now. `buildTodayAgenda` moved rather than changed.

**Goal:** make the modules feel like one app and start _prompting_ action instead of just showing it.

**Scope**

- **Cross-module links.** Add nullable references (explicit FKs, not a generic link table, for
  type-safety): `task.goalId → goals` (a task counts toward a goal), and a task↔event association
  ("work on this task at this time"). Surface both directions (goal page shows its tasks; task
  dialog picks a goal/day).
- **"Today" hub** — a first-class view merging today's due tasks, events, macro status, and budget
  glance into one focused agenda (distinct from the dense dashboard). Likely a new `/today` route
  or the dashboard's default focus.
- **Reminder / daily-digest engine.** Baseline = in-app: on first load of a new local day, compute
  a digest (overdue/today tasks, today's events, targets not yet met) and surface it (banner or the
  Today hub). Optional email digest via a cron-hit internal endpoint (Docker) + SMTP. Add
  **notification/reminder preferences** to Settings.

**Deps:** T0 (goals module), T1 (Today hub reuses capture). **Decisions:** email vs in-app-only for
digest; `/today` route vs dashboard mode.
**Verify:** link integrity (delete a goal → tasks detach cleanly); digest correctness across the
midnight boundary; prefs persistence.

---

## Tranche 3 — Depth: Budget ✅

**Goal:** turn month-in-isolation budgeting into something with memory and insight.

**Scope**

- **Recurring transactions** (bills/subscriptions) — mirror the recurring-tasks engine: a
  `transaction_recurrences` rule table + lazy materialization of due instances, "This / Series"
  edit, and skip. Reuse the `recurrence.ts` cycle logic where possible.
- **Trends & charts:** spend-over-time, income-vs-expense, and per-category trend across months
  (first real charts — see charting decision).
- **Transaction search / filter / sort** (text, category, type, amount, date range) + optional
  pagination.
- **Copy-last-month budgets**; **payee/merchant** field + **tags**; **income budgeting / savings
  target** view; make the multi-budget save **atomic** (single action, not N round-trips).

**Deps:** T0 (currency, category edit), charting decision. **Verify:** recurrence unit tests;
rollup still correct with recurring instances; chart data snapshots; search correctness.

---

## Tranche 4 — Depth: Meals ✅

**Goal:** remove the "empty hand-typed library" wall and add the tracking people expect.

**Scope**

- **External food database + barcode** (Open Food Facts + `@zxing/browser`): search a real DB and
  import a food into the library; scan a barcode on mobile (PWA camera).
- **Copy-yesterday / duplicate a day**; **over-target color/warning** on the macro summary (Budget
  already has it); **micronutrients** (fiber/sugar/sodium/sat-fat) as optional fields.
- **Water tracking** and **body-weight tracking** (small new tables; weight pairs naturally with a
  trend chart).
- **Macro-target history** (currently one row/user, no history) so trends and target changes are
  meaningful.

**Deps:** T0, T1 (food search/re-log baseline), charting (from T3). **Decisions:** Open Food Facts,
`@zxing/browser`. **Verify:** food-import + barcode happy paths; snapshot integrity preserved;
weight/water trends; over-target styling in light+dark.

**Shipped** — migrations `0015`–`0018`; all of the above plus:

- **ADR-0005**: Open Food Facts is called from a **Server Action**, not the browser or a route
  handler. This is the app's first outbound HTTP of any kind — see `ARCHITECTURE.md §1.1a`, and
  note §4.2: the app container now needs egress where it previously needed none.
- **Imperial by decision** (`weight_lb`, `amount_fl_oz`). No units preference, no conversion
  layer; the unit lives in the column name.
- **Micros are nullable, not `DEFAULT 0`** — "unknown" is the normal state, so `sumMicros`
  returns a known-count alongside each total and the UI qualifies the number.
- Two **pre-existing** bugs surfaced by T4's acceptance checks, both the same class as the
  `task_recurrences` miss in T3: `calendars` survived "Clear all data" entirely, and both
  `calendars` and `event_exceptions` were absent from the backup — so any restore silently
  reverted every per-occurrence event edit. `src/modules/account/coverage.test.ts` now derives
  the check from the schema, so a table added later fails a test rather than being forgotten.
- `niceScale` gained an optional `baseline: "data"`. It forced zero into every domain (a
  money-chart assumption), which renders a 181–186 lb series as a flat line at the top of a
  0–200 axis. The money charts are unchanged.

---

## Tranche 5 — Depth: planning modules (Calendar, Goals, Todos) — T5a ✅ / T5b ✅ / T5c-a ✅ / T5c-b

**Goal:** deepen the three "planning" modules to match their real-world use.

**Scope**

- **Calendar:** a **week/day time-grid** view (only month + agenda exist); **event reminders**
  (wired to the T2 engine); **drag-to-reschedule**; **"this and following"** recurrence edits
  (currently only This/All); **iCal import/export/subscribe** (`.ics`).
- **Goals:** **milestone due dates**; **numeric/percent progress** for non-milestone goals;
  **ordering**; a **target-date urgency** indicator; surface **linked tasks** (from T2).
- **Todos:** **subtasks/checklists**; **manual reorder** (add a `sortOrder` column — tasks have
  none today); a **"Someday" (no-date)** bucket distinct from overdue; **per-occurrence "skip
  once"** for recurring tasks.

**Deps:** T2 (reminder engine, task↔goal links). **Decisions:** time-grid library vs hand-rolled;
drag lib (`@dnd-kit`) vs native. **Verify:** recurrence "this & following" unit tests; iCal
round-trip; drag reorder persistence; week-grid across DST.

**Split into T5a and T5b.** As written this was 14 features across three modules — larger
than T4, and several items are each T4-sized on their own. T5a took to-dos and goals
together because both are list-shaped, so ordering, drag and the checklist pattern got
built once and shared. Calendar became T5b.

**T5a — shipped**, migration `0019`:

- **Todos:** subtasks (a flat one-level checklist, shaped like a goal's milestones);
  manual reorder within a date section; a **Someday** bucket, with the list regrouped into
  overdue / today / upcoming / someday sections and the four filter chips cut to two;
  per-occurrence **skip-once** for recurring tasks.
- **Goals:** milestone due dates; numeric progress (`current / target unit`) for goals that
  aren't broken into milestones; ordering; a target-date urgency indicator; and the linked
  tasks block gained an open count, due badges and a click-through.
- **ADR-0006** records taking `@dnd-kit` — native HTML5 drag does not fire on touch at all,
  and this is an installed iOS PWA, so a hand-rolled or native implementation would have
  given an affordance that silently does nothing on the primary device. The keyboard path
  is the other half of the argument and is tested.
- **Skip-once needed a different mechanism from the calendar's.** Calendar occurrences are
  expanded on read, so an overlay can drop one; tasks are materialized, so an exception has
  to suppress the insert. See `ARCHITECTURE.md §3.2`.
- A **Repeating tasks manager** was added mid-tranche, unplanned: skipping a task's only
  instance left its rule unreachable, because both routes to a rule hung off a generated
  row. The same hole already existed for a rule whose start date hadn't arrived.
- `dueStatus` moved to `@/lib/date` so goals could reuse it without importing across
  modules, and the sortable list moved to `components/shared/`.
- Two pre-existing defects fixed on the way: `addMilestone` never wrote `sort_order` (a
  column with no writer since 0004), and the dashboard rail rendered a literal "0/0" plus a
  2%-wide bar for a goal with no milestones — T0's polish item fixed only the `/goals` page.

**T5b — shipped**, and split again on the same reasoning. The calendar third was five
features, two of which are not really calendar work. T5b took the three that are:

- **A week/day time-grid.** The app had no time-of-day layout anywhere — every view was a
  chip list keyed on a date string. Positioned in fractions of a column, with the pure
  geometry (including overlap lanes) unit-tested in `components/calendar/grid-geometry.ts`.
- **View and date in the URL** (`?view=`/`?date=`), so a week is linkable, survives a
  reload and works with the back button. `?month=` still resolves for existing links.
- **Drag-to-reschedule**, pointer and keyboard, in a second `DndContext` that shares
  almost nothing with `SortableList` but its sensors — see ADR-0006.
- **"This and following"**, as a three-write transaction.
- **No migration.** A `moved_to_date` column was planned and dropped: an override already
  stores a full `start_at`, so the day it lands on is in the data. Two homes for one fact
  is a fact that can disagree with itself.

Found and fixed on the way, none of it planned:

- **`expandOccurrences` dropped recurring multi-day occurrences** whose span reached into
  the range but whose start date did not — a recurring Mon–Wed event was invisible in a
  week beginning Tuesday while an identical one-off was not. Latent since T2; a week view
  exposes it on day one.
- **`SortableList` broke hydration on every render of `/todos` and `/goals`.** dnd-kit
  falls back to a module-level counter for `aria-describedby` when given no `id`, and the
  server's counter climbs while the client's restarts. React's own wording is that it
  "won't be patched up" — so the attribute stayed wrong, pointing at a description element
  that isn't there, which is precisely the accessibility story ADR-0006 was justified on.
- **A cross-user data-loss vector.** `createEvent`/`updateEvent`/`setEventException` wrote
  a client-supplied `calendar_id` straight through. `events.calendar_id` cascades on
  delete, so an event pointed at someone else's calendar is an event _they_ can destroy.
  Same class as the to-do link hole closed in T5a.

**T5c split into T5c-a (iCal) and T5c-b (reminders).** The two features share nothing but a
tranche number, and each is about the size of T5b — the same split T5 and T6 both needed.

**T5c-a — shipped.** `.ics` download at `/settings/calendar.ics` and a subscribe feed at
`/api/calendar/<token>`, plus a Calendar section in Settings. `docs/adr/0008-*.md` records
the decisions.

- **The "public unauthenticated URL" framing above was wrong, and it made this look bigger
  than it was.** Nothing becomes public: the subscriber is the user's own iPhone, on the
  tailnet, so SPEC §6's no-public-access constraint is untouched. What was real is the
  smaller half — iOS Calendar sends no cookie, so the URL is the credential. That is the
  app's first non-session auth and its first `crypto` use, hence the ADR.
- **`/api` was already outside the proxy matcher**, so no auth regex had to be widened for
  the feed. The matcher's own comment warns why that mattered.
- **All five RRULE gaps are closed for export**, and two of them dissolved rather than being
  solved: emitting **floating local time** (no `Z`, no `TZID`) means no per-event zone is
  needed and `UNTIL` inherits the inclusive date directly. Floating is also the faithful
  serialization — the app renders wall-clock in the saved zone and never converts, so a
  subscribed device shows exactly what the app shows.
- **Import is deliberately not offered.** Writing an RRULE is a mapping problem; reading an
  arbitrary one into five columns is a representability problem. The ADR says when that is
  worth reopening.

**T5c-b owes** event reminders. One blocker of the original two is now stale — T6b shipped a
service worker — but the rest still stands, verified: no Web Push code anywhere, no cron
inside the app, no SMTP, and `computeDigest` still reads a single day with no forward
window, so "30 minutes before" has no data path yet. Decided: delivery is **Web Push**.
What it needs is a `web-push` dependency and VAPID keys, a subscriptions table, `push` /
`notificationclick` listeners added to a service worker ADR-0007 deliberately kept short, a
per-event lead time, and a scheduler. The scheduler is less than it sounds: a host cron
already runs daily for backups (`docs/runbooks/backup-restore.md`) and the app binds
`127.0.0.1:3000`, so a cron-hit internal endpoint is a second crontab line rather than new
infrastructure. The sharp part is the send-once ledger — recurring occurrences are not rows,
so it has to be keyed by `(event_id, original_date)` like every other per-occurrence record.

---

## Tranche 6 — Robustness & data — split into T6a ✅ / T6b

**Goal:** close the durability gaps and make the app trustworthy to _rely_ on.

**Scope**

- **In-app data import** — round-trip the existing JSON export (validate `version`, upsert into
  each module) so a restore doesn't require shell + Docker.
- **Offline read cache** — add a service worker (Serwist): precache the shell, runtime-cache GET
  navigations/data so the installed PWA opens and reads offline. (Offline _writes_ = a later,
  bigger effort; scope this to read-first.)
- **Appearance settings backup/sync** — theme + palette live only in `localStorage` today (in
  neither the export nor the DB backup); move to (or mirror in) `user_preferences` so they survive
  a device change and appear in the export.
- **Account deletion** (only "clear data" exists today); finish any remaining per-module
  error/loading boundaries not done in T0.
- ~~**Dashboard polish:** stat cards drill in on click; optional Week view.~~ Both done —
  the stat cards were already whole-card links by T6a, and a month/week toggle landed with
  the dashboard consolidation (see the T2 note).

**Deps:** T0. **Decisions:** `@serwist/next`; import conflict policy (merge vs replace).
**Verify:** export→import round-trip fidelity; offline open of the installed PWA; appearance
persists across devices; account-deletion transactional + irreversible-confirm.

**Split into T6a and T6b**, on the same reasoning as T5: the service worker is a different
kind of work with a dependency decision, a security decision and an ADR of its own.

**Two of the five items were already done** before T6a started, and are recorded here
rather than re-invented:

- **Error/loading boundaries** — all six module segments plus `settings` already have
  both, delegating to `components/shared/route-error.tsx`. T0 finished this; the roadmap
  text was stale. (`(auth)/login` still has neither, deliberately: it renders no data.)
- **Stat cards drill in on click** — both dashboard cards were already whole-card `Link`s
  with an `ArrowUpRight` affordance.

**Account deletion is dropped, not deferred.** There is no service to leave. `users` is the
only row in `db/schema.ts` and there are no Auth.js adapter tables, so deleting it cascades
all twenty user-owned tables away and locks the owner out of their own install —
recoverable only by re-running `scripts/seed-user.ts`. The operations that matter already
exist: `clearAllData` for a fresh start, `docker compose down -v` to destroy the volume.

**T6a — shipped**, migration `0020`:

> **Defect found later and fixed:** the appearance mirror wrote on every authenticated
> page load. `AppearanceSync` compared against the palette store's value before hydration,
> which is `DEFAULT_PALETTE` regardless of what the device holds — so each navigation wrote
> indigo into the account and corrected it a tick later. Two writes per page, plus a window
> where a second device would read the wrong palette. It reads localStorage directly in
> the effect now — a hydration flag also fixes the write, but this component sits above
> `{children}` in the (app) layout, so the re-render it forces re-triggered the Suspense
> boundary around every page and left two copies of the page body mounted in dev
> (`e2e/task-links.spec.ts` caught that). It surfaced as
> `e2e/import.spec.ts` reporting that a **rejected** import had changed the data — the one
> assertion in the suite that must never cry wolf, and it was right to.

- **In-app import**, replace-mode: validate the whole file, then clear and insert in ONE
  transaction. A rejected file costs nothing because nothing is deleted until it passes.
  The acceptance bar is a round trip — export → import → export, byte-identical, ids and
  timestamps included. Note this is the no-shell convenience path; `pg_dump` /
  `scripts/restore.sh` remains the proven disaster-recovery route.
- **Referential integrity is checked _within the payload_**, which makes the cross-user FK
  hazard structural rather than per-column. A crafted `tasks.goal_id` naming someone else's
  goal satisfies Postgres perfectly well; it is only wrong relative to the file. Third
  sighting of this class, after `checkTaskLinks` (T5a) and `checkCalendar` (T5b).
- **The table graph is derived, not written down** (`account/tables.ts`): which tables a
  backup covers, the foreign-key edges, and the topological insert order all come from
  drizzle metadata. Three more lists that would otherwise fall behind the schema.
- **Appearance mirrored** into `user_preferences` — mirrored rather than moved, because the
  pre-paint scripts run above any session lookup. A device with no stored preference adopts
  the account's; one with a preference keeps it and writes through.
- **`serverActions.bodySizeLimit` raised to 8 MB.** A measured export is ~350 bytes/row, so
  the 1 MB default is roughly 3,000 rows — reachable after a few years of daily use, and a
  ceiling nobody would find until a restore failed.
- Tidying found on the way: `(app)/error.tsx` now delegates to `RouteError` like its six
  siblings; the export route catches so a failure isn't an HTML 500 delivered as
  `winnow-export.json`; and the dashboard's week toggle is gone (~110 lines) now that
  `/calendar?view=week` exists — it could only ever show the week containing today.
  _(A week view came back later, on the same reasoning being outweighed: the dashboard
  calendar column is full height now, so the strip shows more than the month grid can.
  It still cannot navigate. See the T2 note.)_

**T6b — shipped, and deliberately narrower than "offline reads".** Both blockers this
section raised turned out to point at the same answer: **cache the static shell and an
offline fallback page, and no user data at all.**

- The second blocker resolved itself. Caching a navigation means caching a fully-rendered
  page full of user data — and the app depends on those pages being live in four separate
  ways that are easy to miss: `ensureRecurringTasks()` materialises rows _during a read_
  (page rendering is the scheduler; there is no cron), every hub freezes "today" into its
  HTML, `revalidatePath()` cannot reach Cache Storage, and sign-out cannot clear it. So
  `ARCHITECTURE.md` §6.2's network-only rule was not overturned — it was kept, and doing so
  is what made the tranche small. §6.2 now documents what shipped.
- The first was real and got slightly worse on contact. `src/proxy.ts` gated `/sw.js`,
  **and** `/offline.html`, **and** `/fonts/*.woff2` — the last one found by the font 307ing
  mid-implementation. Because `cache.addAll` is all-or-nothing and `cache.put` rejects a
  redirected Response, one missing exemption means no offline support at all, silently.
  Fixed with anchored exact-path exemptions (plus a `fonts/` prefix) rather than by widening
  the extension class, which already over-matches routes. `src/components/pwa/sw.test.ts`
  drives the real install handler and asserts every path it requests is un-gated, so the
  next precache addition cannot repeat it.
- The ADR this section predicted exists: `docs/adr/0007-hand-written-service-worker.md`,
  which reverses the pre-committed `@serwist/next` dependency.

**Still not done, and still Later:** offline _reads_ of real data. That needs a local-first
data layer, not an extension of this worker — SPEC §6 keeps deferring it, correctly.

---

## Tranche 7 — Net-new modules

**Goal:** breadth — the pillars a life-organizer is still missing.

**Scope**

- **Notes / Journal** module (the obvious missing pillar): free-form notes and/or a dated daily
  entry that can feed the Today hub. Full module (schema/queries/actions/validation/UI + nav).
- **Routines / templates:** define a named set of tasks (+ events) and spin them up in one action
  ("Morning routine", "Trip prep"); complements recurring tasks.
- **Habits / streaks:** build a streak + heatmap view on top of the recurring-tasks engine (the
  completion data already exists) — turns habits into something visible and motivating.
- **Weekly review:** a guided cross-module summary (tasks done, spend vs budget, macro hit-rate,
  goal movement) — leans on the T3/T4 trends and the T2 digest.

**Deps:** T2 (digest/links), T3/T4 (trends for the review). **Verify:** per-module standard suite;
routine spin-up idempotency; streak math unit tests.

**Split into T7a–T7d**, for the same reason T5 was split: as written this is four full
modules, and the per-module wiring alone is ~23 touch points. The order is dependency-led —
Notes and Routines stand alone, Habits needs work in the recurrence engine, and the Weekly
review aggregates everything including the modules above it.

**T7a — shipped**, migration `0022`:

- **Notes and journal entries are one table**, not two. `entry_date` nullable is the only
  difference between them, and one-per-day falls out of a plain `unique(user_id,
entry_date)` with no partial index needed — Postgres treats NULLs as DISTINCT in a
  unique constraint, so free-form notes never collide. `transactions_series_occurrence`
  already leans on the same property for one-off transactions.
- `/notes` is the **seventh and last** nav entry. `bottom-nav.tsx` is a plain flex with
  `flex-1` and no overflow handling; seven items fit on a 375px phone, eight would not.
  T7b–T7d therefore live at sub-routes and in the palette, not in the tab bar.
- Search fans out over title **and** body. Search still does not import another module's
  service — the display title is built from its own `snippet` helper.
- The dashboard's Journal card sits in the **left** column. In the right rail it was the
  sixth card and fell below the fold, which would have undone the "every column caps
  itself, the page does not scroll" property the dashboard was tuned for.
- `weekRange()` was added to `src/lib/date.ts` here rather than in T7c, since habits and
  the weekly review both need it and `lib/date.ts` had no week helper at all.

**T7b — shipped**, migration `0023` (`routines` + `routine_items`):

- **Tasks only; events deferred.** The scope line above says "tasks (+ events)", and event
  items would need start/end, all-day and a calendar — roughly doubling both the item
  schema and the spin-up. Additive later, so nothing here blocks it.
- **`due_offset_days` is signed and nullable**, and the two mean different things: null is
  "no due date", 0 is "due the day you run it", and negative is the point of the column —
  "book the kennel" is a week before the trip, so the anchor is the departure date.
- **No run history and no idempotency guard.** Running "Trip prep" twice for two trips is
  legitimate, so nothing records a run. The misclick case — which is what a guard would
  really have been for — is covered by the undo on the success toast, which deletes
  exactly the ids that run created.
- The **run dialog is the confirmation step**; it previews every task and its resolved
  date from the same `previewRun` the action uses, so it cannot promise something other
  than what lands. A separate `ConfirmDialog` on top would have said strictly less.
- Lives at **`/todos/routines`**, reached from an icon button on `/todos` and from the
  palette. No nav entry — see T7a on why seven is the ceiling. `isNavActive` keeps To-dos
  highlighted on the sub-route with no extra work.
- **No search fan-out.** Deliberate: routines are few and named, and you reach them from
  the page you were already on. Recorded here rather than left as an oversight.

**T7c — shipped**, no migration:

- **No new table was needed**, as scoped. `syncRuleInstances` deletes only rows matching
  `eq(tasks.status, "open")` and the lazy path inserts with `onConflictDoNothing`, so a
  completed cycle is never retired or re-created. Skips live separately in
  `task_recurrence_exceptions`, keyed on the same `occurrenceDate`, which makes the whole
  calculation a set intersection rather than date arithmetic.
- **Streaks count CYCLES, the heatmap counts DAYS, and the two never mix.** This is the
  load-bearing decision. A weekly habit's streak is consecutive weeks, and for a `flexible`
  rule `occurrenceDate` is the period START — so a day grid drawn from it would put every
  completion on a Sunday. Days come from `completedAt` through `todayInZone`, and only feed
  the heatmap. Separating the two dissolved the flexible-rule trap instead of handling it.
- **A skip is neutral and a trailing miss is forgiven once.** The first is why skip-once is
  its own table; the second is because the final cycle is usually the current one, still in
  progress, and counting it would report a broken streak every morning. Both are in
  **ADR-0009** with the alternatives that were rejected.
- **Fixed a real destruction path:** `toggleTaskStatus` re-opening an off-cycle completed
  instance turned it into an open row that the next render deleted — silent history loss.
  The action now refuses, via the pure `reopenWouldDestroy`.
- **`repeatLabel` was hoisted into `todos/service.ts`.** It existed character-for-character
  in `task-item.tsx` and `recurrence-manager.tsx`, and the habit cards would have made three.
- `ringArc` went into `charts/geometry.ts`; **`heatmapLayout` did not.** Everything in that
  file is unit-agnostic coordinate maths, and a heatmap grid is calendar structure — putting
  it there would have handed every budget and meals chart a date dependency for one
  consumer. It lives in `todos/habits.ts`; `charts/heatmap.tsx` only positions squares and
  takes the colour as a class, the same division bar-chart and line-chart use.
- Known and left alone: deleting a rule orphans its completed rows (`seriesId` is
  `onDelete: "set null"`), so the habit disappears from the view. Defensible — you deleted
  the habit — and recorded in ADR-0009 rather than discovered later.

---

## Cross-cutting polish (woven into every tranche)

Not a standalone tranche — apply opportunistically as each area is touched:

- **Empty states:** upgrade the plain one-liners to an icon/illustration + a primary CTA (the
  todos "add an event/task" pattern) for the key screens.
- **Per-module loading skeletons** that mirror each page's shape (only one generic skeleton exists).
- **Reusable data-viz components** (bar, sparkline, ring, trend line) built once, themed with the
  existing OKLCH tokens + palette, so charts are cohesive in light/dark.
- **Micro-interactions & a11y:** consistent "New" affordance, focus-ring quality, skip-to-content,
  reduced-motion respect (already partially there via `Reveal`).

---

## Dependency & sequencing summary

```
T0 Foundations/safety ─┬─> T1 Capture & nav ─┬─> T2 Links/Today/reminders ─┬─> T5 Planning depth
                       │                     │                            └─> T7 Net-new
                       ├─> T3 Budget depth ──┤ (charting shared)
                       ├─> T4 Meals depth ───┘
                       └─> T6 Robustness/data (mostly independent; can slot anytime after T0)
```

- **T0 first, always** (shared libs + trust).
- **T1 next** (highest daily payoff).
- **T2** turns it into one product; **T3/T4** add depth and share the charting foundation;
  **T5** deepens planning modules (needs T2); **T6** hardens; **T7** is breadth on top.
- T3/T4/T6 are largely parallelizable after T0 if you prefer to reorder by appetite.
