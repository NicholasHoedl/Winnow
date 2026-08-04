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
runs all 27 migrations from scratch plus `scripts/seed-user.ts`.

## 2. Where the work stands

**Every tranche is shipped except T5c-b.** T0–T6b; all of T7, split into T7a Notes → T7b
Routines → T7c Habits → T7d Weekly review and finished in that order at the user's
choosing; then T8 (goal momentum), which was not on the roadmap and came out of a question
about linking tasks to goals. `docs/IMPROVEMENT-PLAN.md` is the master roadmap and its
status table is current.

So the roadmap has run out of code that can be written without a deployment. **Hosting is
now the only thing standing between this app and being used.**

| Next up                                   | Why                                                                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting / Checkpoint 0.4**              | The only remaining work that isn't blocked on it. Host is a **Windows home PC, amd64**, with a discrete NVIDIA GPU (12GB+ VRAM). Procedure: **`docs/runbooks/deploy.md`**. |
| **T5c-b** — event reminders over Web Push | Behind hosting, not by preference: iOS only permits Web Push from an installed home-screen app, and it needs a scheduler this app does not have. Both need the deploy first.                                                |
| **The §10 soak**                          | A week of real daily use, from the original ROADMAP. Never done, because the app has never been somewhere it could be used daily.                                                                                           |
| **The AI companion**                      | Scoped, not built, and deliberately behind hosting — it runs a local model on the host's GPU, so it cannot be tested until the stack is up. Locked decisions are in §5.                                                     |

### Hosting: what is already known

**The full procedure is `docs/runbooks/deploy.md`.** What follows is only the context that
runbook assumes.

Decided with the user, so do not re-litigate:

- **Clone the repo on the desktop and build there.** This replaced an earlier plan to build
  on the laptop, `docker save` to a `.tar` and carry it over. The change is not cosmetic:
  the PC needed the checkout regardless — 27 migrations, `scripts/seed-user.ts`, and
  `backup.sh` all run from the deploy directory — so shipping a tar only ever saved the
  build, at the cost of a manual transfer.
- One consequence: **`docker-compose.prod.yml`'s `up -d --build` usage line is now
  correct.** It was listed here as a gap under the tar plan, because rebuilding on the PC
  defeated the transfer. Under the clone plan that is exactly what you want. If you find a
  note elsewhere calling it a mistake, that note predates this decision.
- `tailscale serve https / http://127.0.0.1:3000` is the chosen path (ARCHITECTURE §4.3):
  Tailscale renews the certificate itself, so there is no renewal cron.
- **Sequencing: hosting before the AI companion.** The companion is designed to run a local
  model on that machine's GPU, so it cannot be honestly tested until the stack is up.
  Building it first would stack a GPU-passthrough container onto a deploy that has never
  been done once.

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
- **The month grid caps chips per day.** An e2e that creates several events on today will
  find them hidden behind "+N more" — use the **day view** (`/calendar?view=day`) for
  creation and cleanup.
- **Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm test:run` · `pnpm test:e2e` ·
  `pnpm test:e2e:prod` (separate config, real production build — the service worker only
  registers in production, so the normal suite structurally cannot reach it).
- **Lint has 4 known warnings**, all `react-hooks/incompatible-library` from
  react-hook-form's `watch()`. Judge lint by errors, which should be 0.
- **Do not commit or push unless asked.** The user drives that explicitly.

Current green baseline: **625 unit tests, 95 e2e, 0 lint errors.**

## 4. Traps that have already been paid for

Each of these cost hours. Do not re-discover them.

**React's streaming staging div.** Fizz emits each completed Suspense boundary as
`<div hidden id="S:n">` plus a `$RC(...)` script that relocates the content. In between,
the DOM holds everything **twice**, and Playwright's strict mode counts both — so a loose
locator intermittently fails with "resolved to 2 elements" on a page showing one. It is a
race, so the failing spec **moves around the suite**, which reads as flakiness. It
reproduces against a production build, so it is not a dev-server artifact. `e2e/_test.ts`
waits it out on `goto`/`reload`; anything that reads after a _client-side_ mutation needs
scoping to `#content` (the staging div sits at body level).

**A disabled submit button silently kills Enter.** A form whose submit button is
`disabled` performs no *implicit submission*, so while an action is in flight the keyboard
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

### The AI companion (scoped, not built)

A large feature scoped in conversation and deliberately parked **behind hosting**. Nothing
is implemented; no ADR yet, because the design stopped at an agreed understanding rather
than a chosen architecture. Four decisions are locked and should not be reopened without
new information:

- **A local model, not a hosted API.** ADR-0002 says no public internet exposure at any
  point, and the data is a personal journal, body weight and a complete financial ledger.
  Privacy is the one irreversible constraint here — every other consideration (quality,
  latency, cost) is a config change. The host has a discrete NVIDIA GPU with 12GB+ VRAM,
  which makes a 14B-class model viable, so the trade-off is affordable.
- **Behind an OpenAI-compatible seam**, configured exactly like the `OFF_*` keys in
  `src/lib/config.ts` — `AI_ENABLED` / `AI_BASE_URL` / `AI_MODEL`. Ollama, llama.cpp and
  the hosted providers all speak it, so the provider stays a config change.
- **Propose-only.** The model never writes to the database. It emits a proposal, that
  proposal is validated by the module's existing Zod schemas, the user edits and approves,
  and the write goes through the actions the UI already calls. This is what makes a weak
  local model safe: a bad generation is a rejected suggestion, never corrupted data.
- **Task-shaped, not a chat.** A "Plan this goal" button producing a proposal — no message
  history, no context-window management, no intent detection. Those three are what local
  models are worst at and what is hardest to test.

First slice is **goal planning**: the thinnest cut through every layer, and everything
after it reuses the same spine. Later slices, in rough value order: an LLM fallback when a
quick-add parser returns `null` (invisible, and it would have caught the `abc278c` →
278-carbs trap in §6); journal-aware retrospectives, which are the one thing a query
genuinely cannot do; and cross-module questions the UI has no page for.

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
- **Nav is full at seven items.** `bottom-nav.tsx` is a plain flex with `flex-1` and no
  overflow handling; seven labels fit a 375px phone with nothing to spare. An eighth
  top-level route needs a More sheet or a scroller first.
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

`docs/adr/` (0001–0010) records why non-obvious choices were made — read 0006 (dependency
bar), 0007 (hand-written service worker) and 0008 (feed token, floating time) before
touching those areas. `docs/IMPROVEMENT-PLAN.md` carries a "corrections found while
implementing" list at the top that is worth two minutes.
