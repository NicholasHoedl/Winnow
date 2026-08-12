# Winnow — Improvement Implementation Plan

Derived from the full-app product review. This is the **master roadmap**: it groups every
proposed change into **tranches** that are dependency-ordered and independently shippable.
Each tranche is scoped enough to be expanded into a detailed implementation plan when it's
picked up — it is **not** code-level detail yet.

## Status

| Tranche                                           | State             |
| ------------------------------------------------- | ----------------- |
| T0 — Foundations, cohesion & safety               | ✅ shipped        |
| T1 — Frictionless capture & navigation            | ✅ shipped        |
| T2 — One product: links, Today hub, reminders     | ✅ shipped        |
| T3 — Depth: Budget                                | ✅ shipped        |
| T4 — Depth: Meals                                 | ✅ shipped        |
| T5a — Depth: to-dos + goals                       | ✅ shipped        |
| T5b — Depth: calendar (grid, drag, split)         | ✅ shipped        |
| T5c-a — Calendar: iCal export + feed              | ✅ shipped        |
| T5c-b — Calendar: event reminders (Web Push)      | after hosting     |
| T6a — Robustness: data durability                 | ✅ shipped        |
| T6b — Robustness: offline fallback                | ✅ shipped        |
| T7a — Net-new: Notes / Journal                    | ✅ shipped        |
| T7b — Net-new: Routines / templates               | ✅ shipped        |
| T7c — Net-new: Habits / streaks                   | ⤳ retired by T12a |
| T7d — Net-new: Weekly review                      | ✅ shipped        |
| T8 — Goal momentum from linked tasks              | ✅ shipped        |
| T9a — AI companion: shell + goal planning         | ✅ shipped        |
| T9b — companion: routines                         | ✅ shipped        |
| T9c — companion: weekly synthesis                 | ✅ shipped        |
| T9d — companion: transaction import               | ✅ shipped        |
| T10a — Activity: /todos and /goals merged         | ✅ shipped        |
| T10b — Activity: routines and habits in rail      | ✅ shipped        |
| T11 — AI configured from Settings, not env        | ✅ shipped        |
| T12a — Habits: a quota and a log                  | ✅ shipped        |
| T12b — Goal momentum counts habit sessions        | ✅ shipped        |
| T12c — Companion proposes habits, not dates       | ✅ shipped        |
| T12d — Activity revisited for the habit primitive | ✅ shipped        |
| T12e — Agenda groups routine work, and reorders   | ✅ shipped        |
| T12f — A routine can drop its own stale tasks     | ✅ shipped        |
| T12g — The e2e suite gets a database of its own   | ✅ shipped        |
| T12h — Companion settings: no URL, a model list   | ✅ shipped        |
| T12i — Dead-code sweep, and the edits it exposed  | ✅ shipped        |

**T7 is complete.** The remaining roadmap work is Checkpoint 0.4 (hosting) and then T5c-b —
but T12b and T12c sit ahead of both, since they finish what T12a started.

**T10** was not on this roadmap either. `/todos` and `/goals` had been describing the same
rows from opposite ends since T2 gave tasks a `goalId`, and each had grown a compromise to
cover for the split — a read-only task list inside the goal card, with exactly one row made
actionable in T5a. `/activity` puts the goals in a rail beside the real task list and
retires the compromise. It also freed the first nav slot since the bar filled at seven.
ADR-0013 has the reasoning, including the three shapes that were rejected.

**T12** was not on this roadmap either, and it came out of the companion's OUTPUT rather than
from the code. Asked to break down a goal it proposed milestones dressed as tasks ("Learn
words 1-250") and dated commitments you don't control ("Drill mount and side control on Aug
31") — not carelessness, but the only well-formed answer available, because
`goalPlanTaskSchema` requires a `dueDate` and Winnow could not express "3 classes a week" at
all. T12a builds that primitive and retires T7c's derived habits with it. T12b wires it to
goal momentum, which today reads **Stalled** on any goal whose work is a habit. T12c reshapes
the companion payload. ADR-0014 has the reasoning and supersedes ADR-0009.

**T8** was not on this roadmap. It came out of a question about associating tasks with
goals — an association that already existed (`tasks.goalId`, T2) but measured nothing.
Goals now carry a second reading, movement, alongside the untouched progress figure:
see ADR-0010 for why the two are kept separate rather than blended.

**T9** was not on this roadmap either, and it is the first work built ahead of hosting
rather than behind it. An AI companion that proposes structured work you approve — never
writes on its own, never sees the journal (ADR-0011). T9a shipped the spine and one job;
T9b routines, T9c synthesis and T9d interpretation each reuse it and ship alone.

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
- ~~**Wire dead actions.** `updateCategory` (rename/kind) and `updateFood` (edit a library
  food) exist but are unreachable — add the edit affordances.~~ Half of this was already
  false when written: `food-manager.tsx` has called `updateFood` since T8. `updateCategory`
  was real and is done in **T12i**, along with `renameList`, `unarchiveHabit` and
  `updateTransactionRecurrence`, which the same sweep found in the same state.
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

**T7c — shipped, and RETIRED by T12a.** No migration either way. Everything below was true of
the _derived_ habits view, which no longer exists: a habit now has its own tables and states a
RATE rather than a schedule. Two of its three decisions survived the rewrite, restated in
periods instead of cycles; the third dissolved rather than moved. Kept here because the
reasoning was sound for what it described, and because T12a inherited half of it — see
ADR-0014 and the T12a notes below.

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

**T12a — shipped**, migration `0032` (`habits` + `habit_entries`; 25 → 27 tables):

- **A quota is a rule plus a log**, not N materialized tasks. Generating "3 a week" as three
  instances collides with `unique(tasks.series_id, occurrence_date)`, with the same
  constraint on `task_recurrence_exceptions`, and with `cyclesInRange`'s dedupe — three
  places that treat `occurrenceDate` as the unit of identity and agree with each other. It
  also renders as three identical rows, all soft-due Sunday, which is not what "three times
  this week" looks like. ADR-0014 has the alternatives.
- **`habit_entries` deliberately has no unique constraint** on (habit, date): two classes on
  Tuesday is two rows, and a quota of three is only meaningful if the third can land on a day
  that already has one. The price is that `+1` is not idempotent, so the button disables in
  flight and undo deletes the exact id the action returned rather than "today's entry".
- **The e2e caught a design bug the unit tests could not.** The streak's floor rounded a
  partial first period UP — the right rule for the ring's denominator, the wrong one for a
  streak — so a habit created today sat below its own floor and read _"3/3 this week · Streak
  0"_ however many times it was logged. A partial period is an unfair denominator; a target
  met inside one was harder to hit, not weaker. `windowAdherence` still rounds up;
  `habitStreak` does not.
- **The screenshots caught what neither could**: the ring read "0%" for a habit with no
  completed period yet, which every habit is for its first. Reads "—" now.
- **The rail rule survived unchanged and got stronger.** _The rail never offers an action the
  task list beside it already offers_ — a habit generates no tasks at all now, so the `+1` is
  the rule applied rather than an exception to it. It still gets no checkbox, and
  `e2e/activity.spec.ts` asserts both halves.
- **`unit` and `targetAmount` ship unread**, and are kept OUT of `habitInputSchema` so that
  is structural rather than aspirational: `z.object()` strips them, so nothing can write a
  value nothing reads. Without that, a T12c proposal setting `targetAmount: 20` would produce
  a habit reading "1 of 1 done" after a single word.
- **Ordering was the safety mechanism.** `reopenWouldDestroy` moved to `todos/service.ts` and
  `dateRange` to `lib/date.ts` BEFORE anything was deleted, so `tsc` could prove the rest
  unreferenced. Nothing was removed on judgement.
- Retiring T7c **deleted no user data**: those repeating tasks still repeat: they just stop
  rendering a streak.

**T12b — shipped**, no migration:

- **A logged habit session is movement**, alongside a completed task and a ticked milestone.
  One new input on `goalMomentum`, one extra query in `getGoals`, and every surface that
  already read `goal.momentum` — the rail marker, the mobile chip, the detail sentence, the
  dashboard card — corrected itself with no UI change at all.
- **The scoped plan was wrong and was dropped.** T12a's plan said goals with habits should
  read "2 of 3 this week". They should not: the rail's HABITS block shows that exact number
  a few pixels away, and putting it on the goal card too is the duplication the rail's own
  rule exists to prevent. ADR-0010's split — progress is _how far_, momentum is _is this
  alive_ — has no room for a third question, and adherence is one.
- **`loggedOn` is a separate input from `completedAt`, and has to be.** An entry's `on_date`
  is ALREADY a local wall date; pushing it through `todayInZone` as if it were an instant
  reads it as UTC midnight and lands it a day earlier in every negative-offset zone. There is
  a unit test that fails if the two are ever merged.
- **The join is LEFT, deliberately.** A habit with nothing logged still has to arrive, because
  that is what makes its goal read _stalled_ rather than unmeasurable — an inner join would
  silently drop exactly the goals the badge exists to flag.
- Archived habits stop counting, matching `getHabitsView`: retiring a practice lets its goal
  go quiet rather than keeping it alive on something you no longer do.

**T12c — shipped**, no migration. The line closes where it opened:

- **`goalPlanPayloadSchema` is now `{ milestones, habits, setupTasks }`.** The old shape made
  every proposed task carry a `dueDate`, so a plan of dated appointments was the only
  well-formed answer available — which is why the model produced milestones in disguise
  ("Learn words 1-250") and commitments the user does not control ("Drill mount and side
  control on Aug 31"). It was answering the question it was asked.
- **The `setupTasks: max 3` cap is the fix, more than the prompt is.** It makes the failure
  mode structurally unavailable: there is nowhere to put a twenty-item checklist however the
  prompt is read. Prompt wording nudges; a cap decides. `habits` deliberately has no minimum
  — forcing one onto a project-shaped goal would invent a fake practice, and over-constraining
  costs a bare `malformed` the user cannot edit their way out of.
- **`planWarnings` gained a plan-level check**: a proposal with no habits at all is flagged.
  A ladder with nothing climbing it is the exact failure this line exists to prevent, and
  noticing it is the app's job — the same division as every date check.
- **`milestoneIndex` retired, and `finalizePlan` got dull.** Half its unit tests existed to
  pin down renumbering; nothing points at an array position any more, so a whole class of
  off-by-one went with it. Worth noticing that the correct model was also the simpler one.
- **A stale test stub cost a debugging round.** `_ai-stub.mjs` runs as a long-lived process
  and `reuseExistingServer` kept an old one alive, so three specs failed against the
  pre-T12c payload while the new one sat unread on disk. The stub is now never reused: it
  starts in milliseconds, so reuse bought nothing and cost correctness.
- Not built: a rate-feasibility warning ("at 20 words a day you reach 5000 in February, not
  December"). It needs `targetAmount` on a proposed habit, which is the measured variant
  deferred from T12a. Named here rather than left as a gap someone rediscovers.

**T12d — shipped**, no migration. T12a made habits a primitive and nothing revisited the page
around them, so the rail still treated one the way it did when a habit _was_ a repeating task:

- **A habit could not be logged from `/activity` on a phone.** The rail is `lg:flex`; below
  that the page offered a tile reading "Habits 3". Logging a practice is the most phone-shaped
  action in the app and it was the one action the page could not do. Habits are now a **strip
  above the task list at every width** — one component, no `lg:` in it — placed below the
  quick-add so a phone never stacks two horizontal scrollers. ADR-0013 is amended: the rail's
  rule is unchanged, its habit example was simply wrong at a width the original never checked.
- **The rail's routines block became one line with a single `Run…` picker.** A Run button per
  routine is what let the rail reach 724px for three goals, two routines and three habits. The
  action survives at a height independent of routine count; the directness does not, and that
  is recorded as a deliberate loss rather than a tidy-up.
- **`getHabitStrip` replaces `getHabitsView` on the two surfaces that show only done/target.**
  400 days of entries and a thirteen-column row per habit became ~37 days and four fields. Safe
  because `adherence` for the period containing today is identical under every window
  containing today — the surfaces agree by construction, where a _streak_ genuinely would not.
  `currentPeriodFloor` derives the bound, and it is the min of the week and month starts, not
  the month's: a week straddles the boundary, so the month alone undercounts weekly habits for
  the first days of most months.
- **The log handler existed twice, verbatim.** `useLogHabit` is now the one copy, feeding three
  surfaces. It gained `pendingId` instead of a boolean — a shared flag greyed out _every_
  habit while one write was in flight, invisible in a rail of three and plainly broken in a
  strip of eight.
- **Habits became reachable from outside their own page**: ⌘K search (title only, archived
  excluded, no service import), a "New habit" create command, and a dashboard card that logs.
  The card carries a `3 of 8 short` line because it truncates at three and `+N more` cannot say
  whether what it hid still needs you.
- **`revalidateHabitViews` gained `revalidateHubs()`**, and a comment claiming T12b would add it
  was corrected. T12b shipped without it, and `goals/queries.ts` has read `habit_entries` ever
  since — so the claim had been false for a tranche.
- Incidental: six functions wrapped in React `cache()` (`requireUserId` ran ~20× per
  `/activity` render, `getUserPreferences` 4×), and `GoalWithProgress.nextAction` deleted as
  genuinely dead. `linkedTaskTotal` looked equally dead and is **not** — it feeds
  `goalMomentum`'s `trackableCount`, and removing it would have flipped goals from stalled to
  unmeasurable and reddened `goal-momentum.spec.ts` for an unrelated-looking reason.
- **Four specs were asserting on data they never created**, and went red together the first
  time the account was sparse — `navigation` (nothing due today, so `TodayAgenda` swaps
  itself and its heading for an empty state), `task-links` (no events, so the Event picker is
  not rendered), `budget-trends` (no transactions, so there is no `<svg>` at all), and
  `companion`'s import (no categories, so all three stub rows land uncategorised and every
  count is off by one). Each read as a feature having vanished. All four now seed and clean
  up; `ensureFoodCategory` creates the category **only if missing and removes it only if it
  created it**, because deleting it outright would take a real category's budgets with it.
  `_ai-stub.mjs` had recorded that assumption as a fact — _"a category the seed account
  actually has"_ — and now says where it is seeded.
- **The new routines-picker spec was flaky, and the cause was older than it.** Its
  routine-item "Add" click was never awaited, so `/activity` could render from a read taken
  before the INSERT landed and the run dialog offered "Create 0 tasks". That race predates
  T12d; what T12d did was remove the `"1 step"` assertion that used to catch it in ten
  seconds, leaving only a locator whose exact wording derives from the same count — which
  turned a fast, legible failure into a silent 60-second hang. Fixed with
  `await expect(itemDialog).toBeHidden()` and by asserting the Create button is visible
  before clicking it. No product change: a user cannot navigate faster than the awaited
  round trip, because the dialog stays open until it resolves.

**T12e — shipped**, migration `0033` (`tasks.routine_id`). The dashboard's agenda mixed a
routine's steps in with everything else due today, so a five-step morning routine read as
five unrelated chores:

- **A task now records the routine whose run created it**, which is what makes grouping
  possible at all — nothing linked the two before. **Only tasks created after 0033 carry it;
  there is no backfill**, deliberately: matching old tasks by title against a routine's steps
  would claim hand-written tasks that happen to agree, and nothing afterwards could tell them
  apart. The cost is one cycle of a daily routine looking ungrouped.
- **The column is declared without `.references()`** and its foreign key is hand-written in
  the migration, because `routines/schema.ts` already imports `priorityEnum` from todos and
  reads it eagerly — a reference back would make the two circular and crash whichever
  evaluated second, drizzle-kit included. See the trap in HANDOFF §4. `account/tables.ts`
  gained `UNDECLARED_REFERENCES` so the backup importer still checks the link; without it a
  crafted file could point a restored task at a stranger's routine.
- **Each routine becomes its own block** in the agenda — heading, icon, count, tinted
  background — rather than a per-row badge, which at five rows reads as noise rather than
  structure. Tinted rather than indented: `Gutter` exists to hold every checkbox and event
  time on one x-axis, and indenting only the grouped rows broke it by 10px, which looked
  like a bug rather than like hierarchy.
- **Tasks reorder by drag**, within a group or among the loose ones, reusing `SortableList`
  and `reorderTasks`. Events are not draggable: an event's position IS its time. The whole
  of today's due tasks are sent on every drop, not just the list that moved, because
  `sortOrder` is shared with /activity and renumbering one group alone would interleave it
  with everything else there.
- **The agenda's "Calendar →" link is gone.** It was the only thing in that header, it went
  somewhere the nav already reaches, and nothing on screen explained why it was there.
- Caught by the existing guards rather than by review: `restore.ts`'s column map, its
  `restoreTaskSchema`, and `tables.test.ts`'s task-reference list all failed the moment the
  column existed. That is three separate mechanisms doing exactly what they were built for.
- **The e2e asserts the drag HANDLES, not the drag.** A first version drove the keyboard
  sensor and polled for the new order; it failed about half the time. The cause was chased
  properly and not found: instrumented runs with an 8-second server delay injected showed
  the component reordering locally in ~50ms, and a tightened announcement assertion
  confirmed dnd-kit dropped the row at position 2 and called `onReorder` — yet the DOM read
  unchanged in the failing runs. Rather than ship a test that is red every other run, the
  assertion was narrowed to what T12e actually added, leaving the drag mechanism to
  `todos-reorder.spec.ts`, which covers the same `SortableList`. **The gap is unexplained
  and is written down here rather than papered over**; reordering is verified by hand.

**Also fixed, unrelated to the agenda and found while verifying it:** a restore silently
rewrote `user_preferences.updated_at`. Carrying the API key across the wipe is an upsert, and
`$onUpdate` restamps the row on its update branch — so the one thing `toInsertRow` goes out
of its way to preserve was overwritten a line later. It stayed hidden because the branch only
runs when a key is STORED, and `import.spec.ts`'s round-trip sorts after `ai-settings.spec.ts`,
whose `afterEach` clears the key. Run that spec alone with a real key and it fails, as it
always would have. `updatedAt` is now set explicitly from the file being restored.

**T12f — shipped**, migration `0034` (`routines.on_unfinished`). A routine can now choose
what becomes of the tasks a run created that were never finished, once their day has passed:
leave them overdue, as always, or delete them.

- **It deletes, and the form says so.** Hiding them would grow an invisible heap the All
  filter slowly fills with; completing them would claim you did something you did not and
  would inflate the weekly review. Neither is honest, so the option is a real delete with no
  undo — and the field's helper text states that plainly, because the form is the only place
  that can warn before it happens.
- **`keep` is the default and every existing routine got it**, so this can only be opted
  into. A half-finished morning routine still goes overdue unless you say otherwise.
- **Swept lazily on read**, beside `ensureRecurringTasks`, because page rendering is this
  app's scheduler (ADR-0004). One bounded DELETE in `getTasks`, so every surface that could
  have shown the row clears it.
- **The boundaries are the feature.** All five must hold: the routine is the caller's and is
  set to `drop`; the task is `open`; its due date is non-null; and it is strictly before
  today in the user's zone. A hand-written task has a NULL `routine_id`, and `NULL IN (…)` is
  NULL rather than true, so nothing outside a drop routine can be reached.
- **The e2e's negative assertions carry the weight.** A `keep` routine's stale task and a
  hand-written overdue task are both in exactly the state the sweep looks for and both have
  to survive it. A negative day offset is what makes any of this testable — the task is born
  past due, so the sweep is reachable without waiting for midnight. One case is NOT covered
  and is named in the spec: a completed routine task ageing past its due date, which the UI
  cannot reach because visiting /activity runs the sweep before the task can be ticked.

**T12g — shipped**, no migration. The e2e suite ran against the owner's real database for
its entire history. That is finally over, and it should have been done long before:

- **The vector was `reuseExistingServer`, not the connection string.** Playwright ATTACHED
  to whatever dev server was already running — the one pointed at real data — so no amount
  of overriding `DATABASE_URL` in the config could have helped. The env of a process you did
  not start is not yours to set. The suite now starts its own server, on **port 3001**, and
  never reuses one.
- **The test URL is derived from `DATABASE_URL`** (`winnow` → `winnow_test`) rather than
  configured separately, because a second connection string is a second thing to drift, and
  the run it drifts on is the run that eats real data. `assertSafeToDestroy` refuses to
  start unless the target name ends in `_test`.
- **`global-setup.ts` creates, migrates, EMPTIES and re-seeds the database before every
  run.** Starting from empty is the point: it makes T12d's seeding work mandatory rather
  than merely tidy, and closes the ambient-data class of failure permanently.
- **`next.config.ts` gained an env-driven `distDir`.** Two `next dev` processes sharing one
  `.next` race on the same artifacts, and the whole point is that the owner keeps working on
  3000 while a suite runs.
- **A fresh database immediately found a latent bug.** `writeAiConfig` did an UPDATE with no
  WHERE, which assumed a `user_preferences` row already existed — true on a database used by
  hand, false on a newly seeded account, where the row is created lazily on first save. It
  matched zero rows and the failure surfaced an assertion later as "Companion heading not
  visible". Now an upsert.
- Several comments across `e2e/` and `account/coverage.test.ts` asserted the old arrangement
  as a live fact and justified decisions with it. They are corrected rather than deleted —
  including the note that a clear-all e2e was impossible, which is now merely unwritten.

**T12h — shipped**, no migration (the provider column is plain text, as its comment
predicted). The companion's setup asked for two things nobody should have to know: the
provider's base URL, and a model id typed from memory.

- **Base URL is written from the provider on save**, never typed. `resolveBaseUrl` ignores
  whatever the form sent for `anthropic` and `openai` — the field is not even rendered for
  them — and honours it only for the new `custom` provider.
- **`custom` is the escape hatch made explicit.** ADR-0011 records the local-model decision
  as reversible because "a local endpoint is one setting away"; that setting used to be an
  editable URL on every provider, which meant the door was open by accident. Now it is a
  choice you make.
- **Settings choice and wire protocol are now different types.** `AiProvider` is a protocol
  and there are exactly two, because Anthropic is not an OpenAI dialect; `AiProviderChoice`
  is what the user picks and there are three. `wireProtocol()` maps `custom` → `openai`.
  Conflating them would produce a 400 with no obvious cause.
- **The model field is a dropdown fetched from the provider** through a Server Action, so
  the key never reaches the browser. It takes the provider being CONSIDERED rather than the
  one saved — otherwise switching provider and opening the list would offer the old one's
  models. The saved model is always kept in the list, so an unreachable provider cannot
  silently wipe the setting on save.
- **Not filtered to chat-capable models**, deliberately: nothing in either response says
  which is which, and any heuristic that hid OpenAI's embedding models would also hide
  whatever a local endpoint calls its own.
- **The e2e stub now answers `/models`.** A stand-in provider that 404s there leaves the
  settings page with an empty dropdown — it stopped standing in for enough.
- Found while verifying, and unrelated to the change: **the account's stored Anthropic key
  returns 401**. It is structurally intact (108 chars, `sk-ant-` prefix, no whitespace or
  encoding damage) and the AI teardown had completed cleanly, so this is a revoked or
  expired key rather than fixture damage. The old form could not have told anyone; the new
  dropdown says so on arrival.

**T7d — shipped**, migration `0024` (`milestones.completed_at`):

- **`src/modules/review/` owns no tables**, copying `digest/`: a pure `service.ts`, an
  orchestrating `queries.ts`, and nothing else. No `actions.ts` — the page only reads, and
  an unused server action is dead code, so the plan's "thin actions.ts" was dropped.
- **The prerequisite was real.** "Goal movement" had no temporal data at all: `done` was a
  bare boolean and `goals.currentValue` is overwritten in place, so nothing could say what
  changed in a week rather than what is true now. `completed_at` is **forward-only** —
  anything ticked before the migration has no timestamp and can never honestly get one, and
  the Goals card says so instead of showing a zero.
- **`summarizeMonth` was reused verbatim** for the week, as scoped — despite the name it
  takes rows and never reads a date. But `getRangeSummary` passes **no budgets**: they are
  stored per calendar month, and a seven-day slice of a monthly grocery budget is a number
  nobody set. The review shows the month it belongs to alongside, which is a figure that
  actually exists.
- **`targetsForDate` was extracted** so each day is scored against the target in force
  **that day**. Resolving once for the week would score a week straddling a target change
  entirely against whichever end happened to be asked for — the specific bug the plan
  flagged, now covered by a test that walks a week across a change.
- **`completedAt` is an instant, not a wall-date** — the only such date in todos and goals.
  Which local day it belongs to depends on the user's zone and cannot go in a where clause,
  so both range queries bound generously in UTC and do the exact membership test in JS
  through `todayInZone`.
- Week stepping is **`?week=`, a link rather than client state**, which is what makes a
  given week reloadable and shareable. `revalidateHubs()` gained `/review` — the second hub
  the indirection was kept for, exactly as its comment predicted.
- Incidental fix: the milestone checkbox had **no accessible label**, announcing as a bare
  "checkbox" while every other checkbox in the app names what it acts on.

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

**T12i — shipped**, no migration. A cleaning pass that was asked for as "remove unused code"
and turned into two different jobs, because a function with no callers is ambiguous evidence.

- **Deleted, because nothing needed them**: `charts/sparkline.tsx`, `getMonthBudgets`,
  `getProposal`, `closeGoalDetail`, `APP_CURRENCY` (a note left in its place — older
  `.env.example` files still set it and it now does nothing), `CATEGORY_ACCENT_COUNT`,
  `UserPreferencesRow`, and the `@testing-library/user-event` dependency. `shadcn` moved to
  devDependencies.
- **`TransactionRecurrence` was kept**, and the reason it looked dead is the point below.
- **Four capabilities were not dead code — they were unfinished features.** Each had a
  working, tested, user-scoped action and no way to reach it:
  - `unarchiveHabit`. Archiving was wired, and its toast said "its history is kept" — but
    every read filtered `archivedAt` and no surface listed a retired habit, so archiving was
    a one-way disappearance under a reassuring sentence. `/activity/habits` now has a "Show
    archived" section fed by a new, deliberately thin `getArchivedHabits`.
  - `renameList` and `updateCategory`. Both managers offered create and delete and nothing
    between, so fixing a typo meant deleting the row — which unfiles every task or
    transaction under it — and starting again. Both now use `CalendarManager`'s shape: the
    create form doubles as the edit form.
  - `updateTransactionRecurrence`. Reachable now through a scope toggle on the transaction
    dialog, the one `TaskDialog` already had. Changing a rent amount previously meant
    stopping the schedule and rebuilding it from memory.
- **A category's KIND stays locked while editing**, though the action accepts it. Flipping it
  under existing transactions leaves them pointing at a category that no longer matches their
  type: the transaction dialog filters its picker by kind, so re-opening one of those rows
  silently drops its category, and `budget-view` stops offering the category a budget.
  Allowing it needs a migration path for the rows that already reference it. The e2e asserts
  the lock, so it stays a decision rather than an omission.
- **`getMonthTransactions` now joins the rule** the way `getTasks` does — separate read,
  in-memory join, scoped to the `seriesId`s actually on screen rather than the whole rule
  table. That is what makes the scope toggle possible; without the rule in hand the only
  thing the UI could offer a repeating transaction was "Stop repeating".
- **The `*Input` types were kept.** Several are exported and unreferenced, but they are the
  module convention (`z.infer` beside each schema) and a convention with holes in it is worse
  than one that is uniformly redundant.
- **The habits e2e teardown had a hole this change opened.** An archived row carries
  `data-rail`, so `visibleCard` cannot see it, and an archived habit has no Delete menu — a
  test that archived and then failed before restoring would leave a row nothing swept, and
  the next run's "0 strays" would be a lie. The teardown now unarchives first.
