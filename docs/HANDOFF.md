# Handoff

Last updated: **2026-08-04**.

**`main` is the truth and it is pushed.** T7, T8, the recolour and the deploy runbook were
built on `feat/t7-notes-routines-habits`, which has since been fast-forwarded into `main`
and carries nothing `main` does not — the branch can be deleted whenever you like.

This header does not track commits. It named the tip and listed what was outstanding, and
went stale three times in one day; `git log` cannot be wrong and this can, so ask it.

Read `SPEC.md` for what Winnow is and `ARCHITECTURE.md` for how it is built. This file
covers only what those two can't tell you: where the project actually stands, the working
conventions that are not guessable, and the traps that have already cost real time.

---

> ### If you are Claude Code running on the Windows desktop
>
> You have been cloned onto the deploy target. **Your job is Checkpoint 0.4: get this
> stack running and reachable over Tailscale.** It has never been done, on any machine.
>
> 1. Read **§1 below** — the one thing most likely to be assumed wrong — then
>    **`docs/runbooks/deploy.md`**, which is the actual procedure.
> 2. Settle the Docker-Desktop-login question in §2 **before** you build. If the answer
>    turns out to be "run it under WSL2 as a service", that changes the first step rather
>    than being something to patch later.
> 3. Work through the runbook. It marks which steps only the user can do.
>
> Four things to have straight before you start:
>
> - **You will not type any secret.** `POSTGRES_PASSWORD`, `AUTH_SECRET` and
>   `SEED_USER_PASSWORD` are the user's to enter. Scaffold the file, leave them blank, say
>   so.
> - **`pnpm test:e2e` must not run on this machine.** It is written against the dev server
>   and writes rows into whatever database it can reach. Verification here is the three
>   checks in the runbook, not the suite.
> - **`docs/runbooks/deploy.md` is a first draft that has never been executed.** It was
>   assembled from the compose file, the Dockerfile and ADR-0002. Where reality disagrees
>   with it, reality is right — fix the runbook as you go, and commit that.
> - **The repo on this machine is the deploy directory**, not a scratch checkout. Migrations,
>   the seed script and `backup.sh` all run from it, and it stays.

---

## 1. The one thing most likely to be assumed wrong

**Winnow has never been deployed. There is no home server running it.**

Everything is local: `.env` points at `localhost:5432`, there is no production
environment anywhere in the checkout, and ROADMAP Checkpoint 0.4 (Docker + Tailscale +
iPhone install) has never been completed. Commit `d013006` is _deploy-prep_ — artifacts
staged, nothing shipped.

This matters because three finished features have only ever run on localhost and are
unverified on the device they were built for:

- **T6b's offline page** — the point is an installed iOS PWA with no network.
- **T5c-a's calendar feed** — the point is subscribing from iOS Calendar over the tailnet.
- **The dashboard** — it is a phone-and-desktop surface that has only been seen on a laptop.

Corollary: statements like "migration 0020 is pending on the server" are wrong. The
database is empty of production data because there is no production. The **first** deploy
runs all 31 migrations from scratch plus `scripts/seed-user.ts`.

## 2. Where the work stands

**Every tranche is shipped except T5c-b.** T0–T6b; all of T7, split into T7a Notes → T7b
Routines → T7c Habits → T7d Weekly review and finished in that order at the user's
choosing; then T8 (goal momentum), T9a–T9d (the AI companion) and T10a–T10b, none of which
were on the roadmap. `docs/IMPROVEMENT-PLAN.md` is the master roadmap and its status table
is current.

So the roadmap has run out of code that can be written without a deployment. **Hosting is
now the only thing standing between this app and being used.**

| Next up                                   | Why                                                                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting / Checkpoint 0.4**              | The only remaining work that isn't blocked on it. Host is a **Windows home PC, amd64**, with a discrete NVIDIA GPU (**6GB** VRAM — an earlier note here said 12GB+, and that error is what ADR-0011 reverses). Procedure: **`docs/runbooks/deploy.md`**. |
| **T5c-b** — event reminders over Web Push | Behind hosting, not by preference: iOS only permits Web Push from an installed home-screen app, and it needs a scheduler this app does not have. Both need the deploy first.                                                                             |
| **The §10 soak**                          | A week of real daily use, from the original ROADMAP. Never done, because the app has never been somewhere it could be used daily.                                                                                                                        |
| **The AI companion — complete**           | **T9a–T9d all shipped**: `/companion`, with goal planning, routine building, a narrated week and transaction import. See §5, ADR-0011 and ADR-0012.                                                                                                      |
| **The Activity page — complete**          | **T10a–T10b both shipped**: `/todos` and `/goals` merged into `/activity`, with goals, routines and habits in one rail beside the task list. See §5 and ADR-0013.                                                                                        |

### Hosting: what is already known

**The full procedure is `docs/runbooks/deploy.md`.** What follows is only the context that
runbook assumes.

Decided with the user, so do not re-litigate:

- **Clone the repo on the desktop and build there.** This replaced an earlier plan to build
  on the laptop, `docker save` to a `.tar` and carry it over. The change is not cosmetic:
  the PC needed the checkout regardless — 31 migrations, `scripts/seed-user.ts`, and
  `backup.sh` all run from the deploy directory — so shipping a tar only ever saved the
  build, at the cost of a manual transfer.
- One consequence: **`docker-compose.prod.yml`'s `up -d --build` usage line is now
  correct.** It was listed here as a gap under the tar plan, because rebuilding on the PC
  defeated the transfer. Under the clone plan that is exactly what you want. If you find a
  note elsewhere calling it a mistake, that note predates this decision.
- `tailscale serve https / http://127.0.0.1:3000` is the chosen path (ARCHITECTURE §4.3):
  Tailscale renews the certificate itself, so there is no renewal cron.
- **The companion no longer waits on hosting, and T9a was built first.** It used to be a
  hard dependency — a local model on this machine's GPU could not be tested until the stack
  was up — and ADR-0011 removed it by moving to a hosted API. The user chose to build
  before deploying; hosting is still the only thing between this app and being used.

Two gaps still unresolved:

1. **Docker Desktop on Windows is tied to a login session.** After a Windows Update reboot
   the stack stays down until someone logs in. ADR-0002 assumed an always-on machine, so
   this is a broken assumption rather than a config detail. Settle it before building — if
   the answer is "run under WSL2 as a service" it changes the first step, not a later one.
2. **Postgres is not published** in `docker-compose.prod.yml` (correct for security), so
   `pnpm db:migrate` from the host cannot reach it. Needs a temporary port publish for the
   first migrate + seed, then removal. The runbook spells this out.

Two repo-side traps the runbook exists to defuse, both found while writing it:

- **`.env.example` was missing `POSTGRES_PASSWORD`**, which `docker-compose.prod.yml`
  requires — so following the example file verbatim produced a stack that would not start.
  Fixed, along with an explanation of the next item.
- **`DATABASE_URL` means two different things.** The app container never reads the one in
  `.env` (compose builds its own, pointing at hostname `postgres`); your shell does, for
  `db:migrate` and `db:seed`, and needs `localhost` plus the **production** password — not
  the `winnow:winnow` dev value the example ships with.

Also: `docs/runbooks/backup-restore.md` schedules with cron/systemd, and `backup.sh` is a
bash script. On Windows that means Task Scheduler and Git Bash/WSL. Rewrite that section
once the host is real rather than guessing at it. Note too that `backup.sh` defaults its
container name to `winnow-postgres`, which is the **dev** name; under the prod compose file
it is `winnow-postgres-1`.

## 3. Working conventions that are not guessable

- **Never run `pnpm format`.** The repo is hand-written semicolon-free but `.prettierrc`
  sets no `semi` key, so `pnpm format` would add semicolons to every file. Use
  `npx prettier --write --no-semi <files>`.
- **e2e specs import `test` from `./_test`, not `@playwright/test`.** That fixture waits
  out React's streaming (see §4). A new spec that imports the base `test` will flake.
- **Use `visibleCard()` from `e2e/_card.ts`** for card/row locators rather than
  `page.locator("div.bg-card")`.
- **The e2e suite runs against the persistent dev database.** Specs create and clean their
  own rows; a failing spec often leaves debris behind, so check
  `SELECT ... WHERE title LIKE 'E2E%'` after a red run.
- **A spec must seed whatever it asserts on**, even when it passes without doing so. The
  suite also _reads_ ambient data, and four specs quietly depended on the account already
  holding events, transactions, categories and a task due today — they all went red together
  the first time it did not, and each failure read as a feature having vanished rather than
  as missing data. If several unrelated specs fail at once and every message says something
  _disappeared_, count rows before reading product code. Anything that seeds a row a real
  user might also own (a budget category, say) must create it only if missing and delete it
  only if it created it.
- **The month grid caps chips per day.** An e2e that creates several events on today will
  find them hidden behind "+N more" — use the **day view** (`/calendar?view=day`) for
  creation and cleanup.
- **Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm test:run` · `pnpm test:e2e` ·
  `pnpm test:e2e:prod` (separate config, real production build — the service worker only
  registers in production, so the normal suite structurally cannot reach it).
- **Lint has 4 known warnings**, all `react-hooks/incompatible-library` from
  react-hook-form's `watch()`. Judge lint by errors, which should be 0.
- **Do not commit or push unless asked.** The user drives that explicitly.

Current green baseline: **751 unit tests, 124 e2e, 0 lint errors** (T12d, 2026-08-11).

Two e2e are chronically flaky and neither has been solved: `quick-add-burst:42` and
`todos-reorder:86`. They pass on retry and a full run therefore exits 0. Treat a non-zero
flaky count as a triage item rather than a pass, and do not assume a new flake is one of
these two without reading its trace.

The companion's e2e needs a second server — `e2e/_ai-stub.mjs`, a stand-in provider that
Playwright starts alongside the app. `AI_BASE_URL` in `.env` points at it. A real model
cannot be tested (its output is non-deterministic by design), so what is under test is
everything around it: the route handler, the Zod parse, the renderer, the renumbering, and
the writes. Model **quality** is permanently unverified in CI, and ADR-0011 accepts that
rather than pretending otherwise.

## 4. Traps that have already been paid for

Each of these cost hours. Do not re-discover them.

**`todos/schema.ts` and `routines/schema.ts` cannot both import each other.** Routines
already imports `lists` and `priorityEnum` from todos, and `priorityEnum` is read EAGERLY at
table-definition time rather than through a lazy `() => …` callback. So adding a
`.references(() => routines.id)` on the todos side makes the pair circular, and whichever
module ESM evaluates second sees `priorityEnum` as `undefined` and crashes — including
inside drizzle-kit, the tool that generates migrations. `tasks.routine_id` (T12e) is
therefore declared as a plain `uuid()` with **no `.references()`**, and its foreign key is
written by hand in migration `0033`. Two consequences travel with that:

- drizzle-kit cannot see the constraint, so it will never alter or regenerate it. Changing
  that column's target means hand-writing the migration too.
- `account/tables.ts` derives the backup's reference graph from drizzle metadata, so this
  link would be invisible there — which would stop the importer checking that a restored
  task's routine came from the same file, the exact cross-account hole
  `findDanglingReference` exists to close. `UNDECLARED_REFERENCES` restates it, and
  `tables.test.ts` asserts the restatement is still there.

If you ever need a real declared reference, the fix is to move `priorityEnum` (and `lists`)
somewhere neutral so routines stops importing todos — not to add the import and hope.

**React's streaming staging div.** Fizz emits each completed Suspense boundary as
`<div hidden id="S:n">` plus a `$RC(...)` script that relocates the content. In between,
the DOM holds everything **twice**, and Playwright's strict mode counts both — so a loose
locator intermittently fails with "resolved to 2 elements" on a page showing one. It is a
race, so the failing spec **moves around the suite**, which reads as flakiness. It
reproduces against a production build, so it is not a dev-server artifact. `e2e/_test.ts`
waits it out on `goto`/`reload`; anything that reads after a _client-side_ mutation needs
scoping to `#content` (the staging div sits at body level).

**A disabled submit button silently kills Enter.** A form whose submit button is
`disabled` performs no _implicit submission_, so while an action is in flight the keyboard
path into the form is simply gone. Every text quick-add did this. Type a second entry
inside that ~300ms window and it vanished — no row, no toast, no error, with the text
still visibly sitting in the box. Measured: 0ms and 150ms gaps lost the entry, 300ms and
up survived, which is well inside a fast typist's reach on the one surface built for
typing fast.

The fix is `aria-busy={pending}`, never `disabled`, plus clearing the field
**synchronously on submit** rather than after the await — so a second Enter has nothing
left to resubmit, and the failure path restores the text only if the field is still empty
(`restoreIfEmpty` in `src/lib/forms.ts`). `e2e/quick-add-burst.spec.ts` covers all four
bars and must **not** wait between entries; a wait reopens the gap and the spec stops
testing anything.

The first diagnosis was wrong — a late `setText("")` clobbering newer typing — and the fix
built on it changed nothing. What settled it was a submit-event listener proving only
**one** submit event fired for two Enters. Reach for that probe early.

**Anything read from localStorage during render will mismatch on hydration.** The server
has no localStorage, so it renders the default; the client reads the real value on its
FIRST render, not in an effect. React reports the mismatch and — in its own words —
"won't be patched up", leaving those attributes frozen at the server's answer for the
life of the page.

It is worse than it sounds, because later state updates still re-render: the settings
theme control ended up showing **two** buttons with `aria-pressed="true"` at once, the
stale server one and the freshly clicked one. It had a comment claiming `theme ?? "system"`
matched SSR and the first client render. It does not — next-themes reads storage
synchronously. Gate on `useHydrated()` (`src/components/shared/use-hydrated.ts`) so the
first client render matches the server by construction and the correction lands as an
ordinary update.

**Do not** reach for a hydration flag in a component sitting above `{children}` in the
`(app)` layout, though: the re-render it forces re-triggers the Suspense boundary around
every page. That constraint is why `AppearanceSync` reads storage inside an effect
instead. The retired palette store had the same bug in a nastier form — its server
snapshot reported the default, so it wrote that default into the account on every
authenticated page load.

**`git checkout <file>` on uncommitted work discards it.** Used it to undo a deliberate
sabotage and lost the real edit underneath. Prefer re-applying the inverse edit.

**`.next` goes stale after a route is deleted** — and after one is ADDED, if the dev
server is killed mid-compile. `tsc` fails on a generated `validator.ts`, and Turbopack
fails to write an endpoint for a route that no longer exists at all.

`rm -rf .next/types .next/dev/types` clears the first symptom but **not** the second, and
in T7b it made things worse: typecheck went clean while the build cache stayed
inconsistent, and the next e2e run spent 22 minutes producing three failures and an
aborted spec. When the server was killed mid-compile, delete the whole of `.next`.

Budget for what that costs: the first run against a cold `.next` compiles every route on
first visit and takes ~10.5 minutes instead of ~7, which is long enough to reopen the
streaming race below — a cold run in T7b produced two calendar failures that both passed
when re-run on their own, and the full suite then went 84/84 on a warm re-run. Judge a red
run against a cold cache accordingly, and re-run before believing it.

**A dev server left running for hours degrades.** One full e2e run took 1.7 hours versus
5.5 minutes and failed specs that pass on a fresh server. If timings look absurd, restart
it before diagnosing anything else.

**Never start a dev server with Bash** — use the preview tooling and
`.claude/launch.json` (`winnow-dev`, port 3000).

## 5. Decisions the user has already made

Do not reopen these without new information:

- **No `.ics` import** — writing an RRULE is a mapping problem, reading one back into five
  columns is a representability problem (ADR-0008).
- **Reminders go over Web Push**, not email or in-app only.
- **Account deletion is dropped**, not deferred — a single-user app on hardware the user
  owns already has `clearAllData` and `docker compose down -v`.
- **No offline data caching.** The service worker caches the static shell and an offline
  page and nothing user-owned (ADR-0007).
- **Dependencies need an argument, not a preference** (ADR-0006). Two named dependencies
  have been reversed at implementation time on this basis — `@serwist/next` and an iCal
  library. A plan naming a library does not settle it.

### The Activity page (T10a–T10b, revisited by T12d)

**ADR-0013 is the authority.** The short version, and the parts that bite:

**`/todos` and `/goals` do not exist.** Both redirect permanently to **`/activity`**, one
page: the task list, with goals as a rail beside it. Selecting a goal filters the list to
that goal's work. `/activity/routines` and `/activity/habits` moved with their parent.

Four things worth knowing before touching it:

- **Selection is `?goal=<id>`, written with `history.replaceState`, not `router.replace`.**
  Every route here is dynamic, so a router navigation would refetch on every filter click
  for data that did not change. If you "fix" this to a proper navigation you will add a
  server round-trip to a click that needs none.
- **The rail is two components** — `GoalRail` (desktop column) and `GoalChips` (mobile
  scroller) — not one responsive one. They render the same state and are therefore the pair
  most likely to drift; `e2e/activity.spec.ts` exercises both.
- **A goal's milestones live in a dialog**, not on the card. There is no goal page. The
  linked-task list that used to sit inside the goal card is **gone**, deliberately: the
  filtered list beside the rail is that list, and every row in it is actionable.
- **Goals have their own e2e locator, `goalCard`** — a rail card changes background when
  selected, and `cn` drops `bg-card` when it does, so the utility-class locator would stop
  matching exactly the goal a test just clicked.

**T10b put routines and habits in the rail too**, under one rule worth keeping: _the rail
never offers an action the task list beside it already offers._ A routine gets a Run control,
because running one creates tasks.

**T12d moved habits out of the rail, and the rule did not change.** Read ADR-0013's T12d
amendment before touching this. The short version: the rule never mentions a viewport, and
the rail is `lg:flex` — so "the rail is the only place a habit can be logged" was true on a
laptop and meaningless on a phone, where the page offered a tile reading "Habits 3" and no way
to log anything. Four things follow:

- **Habits are a strip above the task list, at every width** (`habit-strip.tsx`). One
  component, no `lg:` inside it, below the quick-add so a phone never stacks two horizontal
  scrollers. A habit still gets **no checkbox** — a quota is not done-or-not-done — and
  `e2e/activity.spec.ts` asserts that, plus "exactly one button", plus "creates no task".
- **Routines are one line with a single `Run…` picker**, not a card per routine with a Run
  button each. That is what let the rail reach 724px. The action survives at a fixed height;
  the directness does not, and the file says so.
- **`/activity` and `/` use `getHabitStrip`, not `getHabitsView`.** ~37 days of entries and
  four fields instead of 400 days and a thirteen-column row. Safe only because those surfaces
  show `adherence` for the current period, which is identical under every window containing
  today. **A cheaper window for a STREAK would still be the bug T10b said it was.**
- **One log handler, `useLogHabit`**, shared by the strip, the habits page and the dashboard
  card. It returns `pendingId`, not a boolean: a shared flag disabled every habit at once.

**The e2e suite's `visibleCard` excludes `[data-rail]`.** Every rail entry carries it, and so
does every habit chip in the strip. The attribute no longer means "in the rail" — what it has
always meant to that selector is **"not a row in the task list"**, and the rail was simply the
only place that was true. Without it a spec cleaning up by title prefix matches the chip as
well as the row and hangs on a "Task actions" button it does not have — which happened once in
T10a with goals and again in T10b with habits. Renaming it to `data-aside` is the honest fix
and was deliberately not taken: a rename is invisible to TypeScript, so one missed card fails
later as a hang in an unrelated spec. If it is ever done, do it alone, with a
`rg -c 'data-rail'` count either side.

### The AI companion (T9a–T9d, complete)

**ADR-0011 is the authority** on the provider and the data boundary, **ADR-0012** on why
generation runs in a route handler. This is the short version.

**What exists.** `/companion` — a two-pane page: job buttons plus a refinement box on the
left, the proposal renderer above the pending queue on the right. Four jobs. Three of them
run end to end — generate → prune → edit inline → Apply, which writes through the modules'
own actions and lands you on the result:

- **Plan a goal** → milestones, the recurring **habits** that reach them, and at most three
  genuine setup tasks — via `addMilestone`, `createHabit` and `createTask`, then `/activity`.
  Reshaped in T12c; see the note below, because the old shape is what started the T12 line.
- **Build a routine** → a routine and its items, via `createRoutine` and `addRoutineItem`,
  then `/activity/routines`.
- **Read my week** → a narrated summary. **The odd one out: nothing to apply.** A paragraph
  is not a row, so there are no checkboxes, no Apply, and no arm in `applyProposalSchema` —
  one Done button, which discards it.
- **Read transactions** → rows pulled out of pasted text, via `createTransaction`, then
  `/budget`. A dense row list rather than the spine: forty transactions are a table you
  scan, not a sequence you read.

Off by default. With the companion switched off in Settings the route renders no content
and nothing in the app hints the feature exists. (It answers 200, not 404 — `(app)/loading.tsx`
streams the shell before `notFound()` can set a status. Observable behaviour is the same.)

**It has a nav tab now**, directly after Activity, spending the slot T10 freed (§6). It is
gated on the same `aiReady(...)` reading as everything else about the feature, so it simply
is not there when the companion is off. The ⌘K palette and the dashboard button still reach it too — the dashboard
button is now a second door rather than the only one, and is kept deliberately.

**The one prompt that sends your own detail.** Every other job sends titles, descriptions
or already-summed figures; transaction import sends the text you paste, because that is
the feature. The UI says so above the box rather than leaving it to be discovered. ADR-0011
described the weekly review as sending "rollups, not rows" — T9d deliberately widens that,
and the journal boundary is untouched.

**The rule the whole thing hangs off**, and the one to preserve in anything added next:
**the app does the arithmetic, the model does the language.** `planWarnings` in
`companion/service.ts` judges the model's dates against `goals.targetDate` using `dayDiff`
— the model is never asked to assess its own output, because it would sometimes be wrong
and confident and there would be no way to tell.

Five things worth knowing before touching it:

- **A plan is `{ milestones, habits, setupTasks }` since T12c**, and the caps are the design
  rather than a guard rail. `setupTasks` is capped at **three**, which makes the old failure
  mode structurally unavailable: the model cannot answer with a dated checklist however it
  reads the prompt, because there is nowhere to put one. Prompt wording nudges; a cap of
  three decides. `habits` has no minimum on purpose — forcing one onto a project-shaped goal
  ("renovate the kitchen") would invent a fake practice, and a rejected payload surfaces as
  a bare `malformed` the user can only escape by regenerating.
- **`milestoneIndex` is gone, and `finalizePlan` no longer renumbers.** Tasks used to carry
  a position into the milestones array, so dropping a middle milestone silently repointed
  every task after it — the one piece of index arithmetic here, and the reason that function
  was unit-tested so heavily. Habits and setup tasks attach to the GOAL, which is where
  tasks always attached in the data model anyway; the grouping was only ever presentational.
  Nothing points at a position now, so a whole class of off-by-one went with it.
- **`planWarnings` judges the plan's shape, not only its dates.** A proposal with no habits
  at all gets a plan-level warning — a ladder with nothing climbing it is exactly the failure
  T12 exists to prevent, and noticing it is the app's job, not the model's.
- **The renderer's exclusion state is keyed on a version counter** so a refinement remounts
  it. Without that, rows pruned from the old plan arrive pre-pruned in the new one.
- **A routine's `dueOffsetDays` has three distinct meanings** and nothing may collapse
  them: `null` is no due date, `0` is the day you run it, negative is preparation
  beforehand. `offsetLabel` renders them in words for that reason, and the e2e asserts all
  three separately.
- **Routines get no date warnings, and that is deliberate.** A routine has no dates until
  it is run, so there is no deadline for anything to be late against — inventing a warning
  there would be inventing a judgment. The plan's warnings exist because a goal has a
  `targetDate` to measure against.
- **`summaryReadiness` refuses a thin week before spending a call.** A model handed three
  data points writes a confident paragraph about your habits and never volunteers that
  there was not much there, so the app decides. Consequence for tests: a summary spec has
  to seed its own week — `e2e/companion.spec.ts` completes three tasks first.
- **Money reaches the summary prompt pre-formatted** by `formatCents`. The model never
  sees integer cents and is never asked to divide by a hundred. Import runs the same rule
  the other way: the model emits a positive major-unit `amount` with `type` carrying the
  direction, and `createTransaction` converts with `amountToMinor`.
- **An unmatched category lands uncategorised, never on the nearest name.** A wrong
  category is harder to spot than a missing one. `resolveCategory` matches case- and
  space-insensitively and returns null otherwise; the footer counts how many that is.

**Adding a fifth kind** means: a payload schema in `validation.ts`, a prompt in
`service.ts`, a renderer body, an arm in the route handler, an arm in `applyProposal`, a
job button, a stub branch, and a value on the `proposal_kind` enum. The transport, the
proposal table, the pending queue and the test harness are already there — none of T9b,
T9c or T9d rebuilt any of them.

**Three traps in the e2e harness**, all of which cost time and all of which will recur:

- **Editing `e2e/_ai-stub.mjs` is not enough — kill the process.** Playwright's
  `reuseExistingServer` reuses a stub already listening on 3100, so a change has no effect
  until the old one stops. The symptom is misleading: the tests fail as though the app is
  broken.
- **The companion spec clears the pending queue in `beforeEach`, by reloading.** `/companion`
  opens the oldest pending proposal, so a proposal left behind by a failed test hijacks the
  next test's starting state. The reload matters: asserting against local state after a
  dismiss passes whether or not the write landed, which is precisely how the optimistic
  discard bug hid.
- **Never run a second Playwright invocation while a suite is going**, and understand how
  far the damage travels. The config is `workers: 1` and serial because both runs share one
  dev server and one database. Doing it produced four failures in unrelated specs and a
  16.6-minute run against a normal ~9.7 — which reads convincingly as four regressions and
  is not.
  Worse, the wreckage outlives the run: a spec that dies mid-test leaves its rows behind,
  and the NEXT clean run fails on them. That is exactly what happened to
  `calendar-following.spec.ts` — one abandoned `E2E split keep …` event in September 2027
  broke all three of its tests on a subsequent untainted run, and they passed the moment it
  was deleted. **When a clean run fails in a spec you did not touch, look for that spec's
  own leftovers before believing you broke something.**

- **A hosted API, not a local model** (ADR-0011). This reverses an earlier decision that
  was made on wrong hardware information — the host has **6GB** of VRAM, not the 12GB+
  recorded here previously, which caps a local model at 7–8B and costs exactly the
  judgment the feature exists for.
- **Journal and note content never leaves the machine.** Not a preference — a hard
  boundary, and one that has to be _enforced_ rather than intended. Prompt payloads are
  built from named fields, never spread from raw rows, and the notes module must be
  unreachable from the prompt-building path. Journal-aware retrospectives are deferred,
  not cancelled: they are the one feature that would justify a local model later.
- **Behind a two-protocol seam, configured in Settings** (T11) — `user_preferences.ai_*`,
  not the environment. `src/lib/config.ts` holds nothing about AI any more; `getAiSettings`
  / `getAiConfig` read it per request and `aiReady` decides whether it is usable. A local
  endpoint is one settings field away.
  **The provider is `openai` or `anthropic`, and they are not interchangeable by URL** —
  different path, `x-api-key` vs bearer, a required version header, `system` outside the
  messages, a required `max_tokens`, and tool-use instead of `response_format`. Both
  protocols are unit-tested in `companion/ai-request.test.ts`; the e2e stub speaks OpenAI
  only, so that file is the ONLY coverage the Anthropic path has.
  Nothing is forwarded through `docker-compose.prod.yml` any more: the configuration is in
  the database, so it survives a redeploy and is set once, from the app.
- **Propose-only.** The model never writes to the database. It emits a proposal, that
  proposal is validated by the module's existing Zod schemas, the user edits and approves,
  and the write goes through the actions the UI already calls. A bad generation is a
  rejected suggestion, never corrupted data.
- **Task-shaped, not a chat.** A "Plan this goal" button producing a proposal — no message
  history, no context-window management, no intent detection.

First slice is **goal planning**: the thinnest cut through every layer, everything after it
reuses the same spine, and it is also the least sensitive thing in the app to send anywhere
— a goal title and its milestones. Later slices, in rough value order: an LLM fallback when
a quick-add parser returns `null` (invisible, and it would have caught the `abc278c` →
278-carbs trap in §6); cross-module questions the UI has no page for; and — only behind a
local model — journal-aware retrospectives.

The API key is **not** an environment secret. T11 moved it into the app: it lives in
`user_preferences.ai_api_key`, entered on the Settings page, and there is nothing to add to
`.env` or to the compose file. It is excluded from the account export, and a restore
carries the existing key across rather than clearing it.

Two limits that are structural rather than temporary, and worth knowing before planning
around them:

- **There is no scheduler** (§2), so an AI review that arrives unprompted on a Sunday is
  blocked on the same thing T5c-b is. Running it when `/review` is opened is not.
- **A Server Action is the wrong shape for a 30-second call.** ADR-0005 documented the
  500ms version of this: an outbound call inside a Server Action blocks the React
  transition it is in. Streaming from a route handler is the honest answer and it
  contradicts ADR-0005's reasoning for choosing a Server Action, so it needs an ADR that
  supersedes rather than a quiet exception.

### The colour scheme (post-T7)

One warm scheme — deep teal on linen, one terracotta accent, graphite chrome — and **no
palette picker**. The five `[data-palette]` blocks, `lib/palettes.ts`, `use-palette.ts`
and the `user_preferences.palette` column are all gone (migration `0025`). Theme
(light/dark/system) is the whole of "appearance" now.

Two things carry meaning rather than brand and are deliberately NOT drawn from the
palette: `--destructive` (over budget, overdue, over target, delete) and `--success`
(money in, positive net). The palette's only red is too muted to read as an error, and
its greens are the two teals — one of which is the primary. `--success` also replaced the
split where the dashboard used `cat-5` and the budget module used `emerald-600` for the
same idea; there are now **no** stock Tailwind colour utilities anywhere in `src/`.

Colour is duplicated by hand in five places that cannot import `globals.css`, and nothing
enforces them: `manifest.ts`, `layout.tsx`'s `viewport.themeColor`, `public/offline.html`
(five tokens × four blocks), `global-error.tsx` (five inline hexes), and
`scripts/generate-icons.mjs`. Re-run that script after changing `--primary`.
**`src/app/favicon.ico` is generated by nothing and has to be replaced by hand — it is
still the old indigo.**

## 6. Known caveats worth stating before someone finds them

- The dashboard **opens on the month view each visit** — the month/week toggle keeps its
  state in the URL. Making it stick means a `user_preferences` column.
- **The dashboard's week view is the real `TimeGrid`**, the same component `/calendar`
  renders, but read-only: no `onReschedule`, so nothing drags, and clicks navigate. It
  needs BOTH `fill` and `maxHeight` — `fill` alone caps nothing, because `h-full` needs a
  definite height and the dashboard's column chain is built from `min-h`. Measured: with
  `maxHeight` the week view's page overflow matches the month view's exactly (0px at
  1440×900, 12px at 1366×768); without it the week ran 293px over.
- **Day columns on that grid are ~58px wide**, so event titles truncate to a few
  characters. It answers "where are the gaps"; `Open ↗` goes to the full view.
- **The six category accents are less mutually distinguishable than the old scheme's.**
  The palette is deliberately low-contrast and warm, so caramel, brown and rust sit close
  together. Inherent to the palette, not a mapping error — if a calendar with several
  coloured calendars becomes unreadable, the honest fixes are fewer categories or one
  admitted out-of-palette hue.
- On the one visit a day the **digest banner** appears it adds ~180px and the dashboard
  scrolls that once.
- **The dashboard overflows below ~1400px wide.** Measured on the current dev account
  (August 2026, a full month of recurring events): 231px at 1280×800, 12px at 1366×768, 0
  at 1440×900 and up. The ~19px figure recorded here previously was against less data, so
  this number tracks what is in the database rather than being fixed. T7a's Journal card
  is **not** a contributor — hiding it leaves both numbers identical.
- **Nav is back at seven items, the measured ceiling.** `bottom-nav.tsx` is a plain flex
  with `flex-1` and no overflow handling; seven labels fit a 375px phone with nothing to
  spare, and an eighth needs a More sheet or a scroller first. T10 merged To-dos and Goals
  into Activity, freeing the first slot since T7a, and the Companion tab immediately spent
  it. `e2e/navigation.spec.ts` measures the fit rather than trusting it.
- **The Companion tab is conditional and is NOT in `navItems`.** `/companion` renders
  nothing unless the companion is configured in Settings, so `navItemsFor(companionEnabled)`
  splices the tab in at render. The `(app)` layout resolves `aiReady(await getAiSettings())`
  once and passes it to the sidebar, the bottom nav and the palette — those three must
  agree, which is why they share one `COMPANION_NAV_ITEM`.
- **The export file contains a live credential** — the calendar feed token rides along
  deliberately, so a restore keeps an existing subscription working (ADR-0008).
- **A goal measured only numerically gets no momentum reading**, and never will without a
  progress-log table. `goals.currentValue` is overwritten in place, so there is no history
  to read; showing "stalled" there would be a lie. Milestones or linked tasks give a goal
  something to measure. See ADR-0010.
- **The meal quick-add parser reads digits-then-`p`/`c`/`f` anywhere in the string**, not
  just as a standalone token, so a food named `abc278c` logs 278 carbs and loses that part
  of the name. Over 100000 the action rejects the whole entry with "Please fix the errors
  below." — which looks exactly like a dropped entry. Cost real time to tell apart from a
  genuine capture bug; a word-boundary guard would fix it if it ever bites a real name.
- **`getEventOptions()` is unbounded.** Every event's id, title and start date ships in the
  RSC payload of every authenticated page, for a picker usually closed. It grows forever
  and nothing caps it. Not a problem at current data size; it will be.

## 7. Where the reasoning lives

`docs/adr/` (0001–0013) records why non-obvious choices were made — read 0006 (dependency
bar), 0007 (hand-written service worker) and 0008 (feed token, floating time) before
touching those areas, and **0011 before writing a single line of the AI companion**: it
sets a hard boundary on what may leave the machine, and that is far easier to violate by
accident than to notice afterwards. **0013** explains why `/todos` and `/goals` no longer
exist, which is the first question anyone asks after a `git pull`. `docs/IMPROVEMENT-PLAN.md` carries a "corrections found while
implementing" list at the top that is worth two minutes.
