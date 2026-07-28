# Winnow — Improvement Implementation Plan

Derived from the full-app product review. This is the **master roadmap**: it groups every
proposed change into **tranches** that are dependency-ordered and independently shippable.
Each tranche is scoped enough to be expanded into a detailed implementation plan when it's
picked up — it is **not** code-level detail yet.

## Status

| Tranche                                       | State       |
| --------------------------------------------- | ----------- |
| T0 — Foundations, cohesion & safety           | ✅ shipped  |
| T1 — Frictionless capture & navigation        | ✅ shipped  |
| T2 — One product: links, Today hub, reminders | ✅ shipped  |
| T3 — Depth: Budget                            | ✅ shipped  |
| T4 — Depth: Meals                             | ✅ shipped  |
| T5a — Depth: to-dos + goals                   | ✅ shipped  |
| T5b — Depth: calendar (grid, drag, split)     | ✅ shipped  |
| T5c — Calendar: reminders + iCal              | next        |
| T6a — Robustness: data durability             | ✅ shipped  |
| T6b — Robustness: offline reads               | not started |
| T7 — Net-new modules                          | not started |

Corrections found while implementing, which this document's later tranches should not
repeat:

- **T4 corrected a claim made below and in the T4 plan**: `/today` was believed to be
  stale after every mutation because no module's revalidate helper names it. It isn't.
  Every route is dynamic (`auth()` reads cookies), `next.config.ts` sets no `staleTimes`,
  and Next uses staleTime 0 for dynamic routes — measured by reverting the fix and
  re-running the hub spec, which still passed. `revalidateHubs()` exists for consistency
  and as insurance if `staleTimes` is ever raised, but it is **defensive tidying, not a
  fix**, and the same caveat applies to the pre-existing `revalidatePath("/")` calls.

## How to use this

- Implement **one tranche at a time**, top to bottom (later tranches assume earlier ones).
- When starting a tranche, expand its "Scope" into concrete tasks and follow the normal
  loop: scope → schema/migration → pure logic + tests → validation → queries/actions →
  UI → verify (typecheck, lint, build, unit, browser) → review → commit.
- **Reuse the existing patterns** — they're good and consistent:
  - Module shape: `schema.ts` / `service.ts` (+ `*.test.ts`, pure) / `queries.ts`
    (`server-only`) / `actions.ts` (`"use server"` + `requireUserId` + Zod + `revalidatePath`)
    / `validation.ts`; pages consume only `queries.ts`.
  - Recurrence: the closed-form generator in `src/modules/todos/recurrence.ts` +
    `syncRuleInstances`/`ensureRecurringTasks` (lazy-on-read materialization), and the
    calendar `event_exceptions` read-time overlay (`applyExceptions`).
  - Undo: `useOptimistic` + a `restoreX` action surfaced via a Sonner toast action.
  - Auto-discovery: new module schemas are picked up via `db/index.ts` spread +
    `drizzle.config.ts` glob — no wiring needed.

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
- **Offline/service worker** (T6): `@serwist/next` (maintained Workbox successor) — read-only
  precache + runtime GET caching first; offline writes are a separate, larger effort.
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
- **Docs:** fix the false "a service worker is registered" claim in `ARCHITECTURE.md §6.2`
  (align with reality until T6 ships one).
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

## Tranche 5 — Depth: planning modules (Calendar, Goals, Todos) — T5a ✅ / T5b ✅ / T5c

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

**T5c owes** the two deferred features, and both need a decision before any code:

- **Event reminders have nowhere to be delivered.** No service worker (T6 owns that), no
  Web Push, no cron, no SMTP. The only notification surface is a once-a-day in-app banner,
  and `computeDigest` reads a single day with no forward window — so "30 minutes before"
  has no data path even in principle.
- **iCal subscribe needs a security posture the app does not have.** `requireUserId()` is
  the only auth mechanism in the codebase; a subscribe feed means a public unauthenticated
  URL and has to invent tokens or signed URLs. Worth its own ADR.
- The RRULE mapping also has five known gaps, written down in the T5b plan so they are not
  rediscovered: the implicit BYDAY in `recurrence_weekdays = 0`; `nth_weekday` not storing
  its ordinal; no `COUNT` column; `recurrence_end_date` being a date where `UNTIL` is a UTC
  date-time; and events carrying no zone of their own for `DTSTART;TZID=`.

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
- **Dashboard polish:** stat cards drill in on click; optional Week view.

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

**T6b owes** the offline read cache, and two things have to be decided before any code:

- **`/sw.js` would be gated by the proxy.** `src/proxy.ts`'s matcher exempts `api`,
  `_next/static`, `_next/image`, `favicon.ico` and paths ending
  `.png|.svg|.ico|.webmanifest` — but **not `.js`**. An unauthenticated request for a root
  service worker gets a 307 to `/login`, which browsers refuse to register. Widening that
  matcher is a security decision.
- **`ARCHITECTURE.md` §6.2 currently argues the opposite case** — pages rendering live data
  are "network-only, never cached", and there is "no cached 'last known' data view".
  Offline reads replace that design rather than extending it. Every `(app)` route is
  authenticated and its layout awaits four queries before rendering, so any cached
  navigation is a fully-rendered page full of user data; what may be cached, and what
  happens when the session expires behind it, **is** the design. SPEC §6 also defers
  offline explicitly, so this deserves a deliberate revisit and probably an ADR.

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
