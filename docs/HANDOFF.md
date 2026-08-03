# Handoff

Last updated: **2026-08-03**, at commit `b931ae5` (pushed; working tree clean).

Read `SPEC.md` for what Winnow is and `ARCHITECTURE.md` for how it is built. This file
covers only what those two can't tell you: where the project actually stands, the working
conventions that are not guessable, and the traps that have already cost real time.

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
runs all 22 migrations from scratch plus `scripts/seed-user.ts`.

## 2. Where the work stands

Tranches T0–T6b are shipped except **T5c-b**. `docs/IMPROVEMENT-PLAN.md` is the master
roadmap and its status table is current.

| Next up                                   | Why                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting / Checkpoint 0.4**              | The user's stated priority. Host is a **Windows home PC, amd64**; they want to **build the image elsewhere and ship it**, since they are usually on a laptop. |
| **T5c-b** — event reminders over Web Push | The last of T5. Decided: Web Push, not email or in-app.                                                                                                       |
| **T7** — net-new modules                  | Breadth.                                                                                                                                                      |

### Hosting: what is already known

Decided with the user, so do not re-litigate:

- Build on the laptop (`docker build --platform linux/amd64`), `docker save` to a `.tar`,
  carry it over. A private GHCR package is the tidier long-term option.
- **The PC needs the repo checked out regardless of the image** — 22 migrations against an
  empty database, `scripts/seed-user.ts` for the account, and `backup.sh` runs from the
  deploy directory. Shipping the image saves the _build_, not the checkout.
- `tailscale serve https / http://127.0.0.1:3000` is the chosen path (ARCHITECTURE §4.3):
  Tailscale renews the certificate itself, so there is no renewal cron.

Three gaps flagged to the user and not yet resolved:

1. **Docker Desktop on Windows is tied to a login session.** After a Windows Update reboot
   the stack stays down until someone logs in. ADR-0002 assumed an always-on machine.
2. **Postgres is not published** in `docker-compose.prod.yml` (correct for security), so
   `pnpm db:migrate` from the host cannot reach it. Needs a temporary port publish for the
   first migrate + seed, then removal.
3. **`docker-compose.prod.yml`'s own usage line says `up -d --build`** — which would
   rebuild from source on the PC and defeat the point. Use plain `up -d` with a loaded image.

Also: `docs/runbooks/backup-restore.md` schedules with cron/systemd, and `backup.sh` is a
bash script. On Windows that means Task Scheduler and Git Bash/WSL. Rewrite that section
once the host is real rather than guessing at it.

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

Current green baseline: **488 unit tests, 78 e2e, 0 lint errors.**

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

**The palette store's server snapshot.** `usePalette` returns `DEFAULT_PALETTE` as its
server snapshot, so the first client render reports indigo whatever the device holds.
Anything that believes it before hydration acts on a lie — `AppearanceSync` wrote the
default into the account on **every** page load because of this. Read `localStorage`
directly inside an effect; it is already correct there. **Do not** reach for a
`useSyncExternalStore` hydration flag in a component that sits above `{children}` in the
`(app)` layout: the re-render it forces re-triggers the Suspense boundary around every
page. `useHydrated()` exists for `ModeToggle`, where that is not a concern.

**`git checkout <file>` on uncommitted work discards it.** Used it to undo a deliberate
sabotage and lost the real edit underneath. Prefer re-applying the inverse edit.

**`.next` goes stale after a route is deleted.** `next build` fails on a generated
`validator.ts` still importing the removed page. `rm -rf .next/types .next/dev/types`.

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

## 6. Known caveats worth stating before someone finds them

- The dashboard **opens on the month view each visit** — the month/week toggle keeps its
  state in the URL. Making it stick means a `user_preferences` column.
- On the one visit a day the **digest banner** appears it adds ~180px and the dashboard
  scrolls that once.
- **1280×800 overflows by ~19px.** Every size from 1366×768 up fits.
- **The export file contains a live credential** — the calendar feed token rides along
  deliberately, so a restore keeps an existing subscription working (ADR-0008).
- **`getEventOptions()` is unbounded.** Every event's id, title and start date ships in the
  RSC payload of every authenticated page, for a picker usually closed. It grows forever
  and nothing caps it. Not a problem at current data size; it will be.

## 7. Where the reasoning lives

`docs/adr/` (0001–0008) records why non-obvious choices were made — read 0006 (dependency
bar), 0007 (hand-written service worker) and 0008 (feed token, floating time) before
touching those areas. `docs/IMPROVEMENT-PLAN.md` carries a "corrections found while
implementing" list at the top that is worth two minutes.
