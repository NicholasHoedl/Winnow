# Handoff

Last updated: **2026-08-13**.

**`main` is the truth, it is pushed, and it is now the only branch.** Every tranche through
T12i is merged into it. The seven stale branches that used to sit beside it are gone, as are
two abandoned worktrees under `.claude/worktrees/`; `git branch` should show exactly `main`,
and `git worktree list` exactly one entry. If you find otherwise, someone has been working
since this was written.

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
> - **`pnpm test:e2e` must not run on this machine**, though the reason changed in T12g.
>   It is no longer that it eats real data — it now creates and destroys its own
>   `winnow_test` database. It is that the suite starts `pnpm dev` on port 3001 and needs a
>   dev toolchain, neither of which belongs on a deploy target. Verification here is the
>   three checks in the runbook, not the suite.
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
runs all 39 migrations from scratch plus `scripts/seed-user.ts`. A first deploy therefore
runs `0022`, which CREATES the notes table, and later `0035`, which drops it again. That is
correct and deliberate: migration history is append-only, so the sequence is replayed rather
than rewritten to skip a table no longer wanted.

## 2. Where the work stands

**Every tranche is shipped except T5c-b.** T0–T6b; all of T7, split into T7a Notes
→ T7b Routines → T7c Habits → T7d Weekly review and finished in that order at the user's
choosing; then T8 (goal momentum), T9a–T9d (the AI companion), T10a–T10b, T11 and T12a–T12i
— none of which were on the roadmap. `docs/IMPROVEMENT-PLAN.md` is the master roadmap and
its status table is current; read it rather than trusting the summary here.

**T13 is shipped**, in four phases: **1** notes removed, Review took the freed nav slot ·
**2** the companion spine extracted with no visible change · **3** `/goals` returned as a
page and the rail left `/activity` · **4** the remaining three tools dispersed and
`/companion` deleted. **ADR-0015 is the authority** on the arrangement and on what was
rejected.

**T14 is shipped**, three unrelated asks in one pass, sharing migration `0036`:

- **Macro targets can balance themselves.** With `balanceMacroTargets` on (the default),
  saving a target derives carbs from calories, protein and fat so the grams account for the
  calories. Three things about it are load-bearing and easy to undo by accident:
  **(a)** it is skipped entirely when any of the three is 0, because a 0 means "not tracked"
  here and enforcing would make "protein only" impossible; **(b)** the SERVER derives the
  number — the dialog's field is read-only and deliberately _unregistered_, so the client
  cannot author it and the two cannot disagree; **(c)** `restoreMacroTargetPeriod` and the
  account importer bypass the rule, because undo and restore are faithful replays. It is a
  write-path rule, not an invariant of the table.
- **The dashboard's month calendar is `lg:` only.** `page.tsx` and `loading.tsx` carry the
  same visibility; change one and you must change the other, or the phone flashes a 384px
  skeleton card the page never fills.
- **`/calendar` opens on `defaultCalendarView`.** An explicit `?view=` still wins.
  `calendarHref` now **always** emits `view=`, including month — it used to omit it on the
  grounds that month was the default, which inverts the moment the default is configurable:
  with a week preference, the Month button produced a URL that resolved back to week.

**T15 is shipped: the dashboard's goals and habits cards are one card.**
`GoalsPracticeCard` puts each habit under the goal it serves, with unattached habits named
as such in a trailing group. **Nothing is truncated** — the habits card capped at three with
a `+N more`, and the goals card capped at four SILENTLY, which was worse. Losing the caps
also retired the unmet-first re-sort, which existed only to make a cut safe.

**T16 is shipped: `Slate`, and events you can highlight.** Migration `0037`.

- **One card replaces three.** `today-agenda`, "Coming up" and `Tomorrow` were three
  components answering one question — _what has a date on it?_ — split along an arbitrary
  line, and the event row in two of them was character-identical. `buildSlate` in
  `(app)/_lib/agenda.ts` returns `{ overdue, bands }`, a band per day out to the horizon
  plus a trailing `Later`. It **calls `buildTodayAgenda`** for the today band rather than
  reimplementing it, which is what keeps that function's 13 tests load-bearing.
- **It closed a live bug rather than fixing one.** `page.tsx` filtered "Coming up" by a set
  built from the agenda's `overdue` and `items` but never its `groups`, so a task a routine
  created for today was drawn twice. One function assigning every task to exactly one band
  makes that class of bug unreachable.
- **`events.highlighted`, plus a NULLABLE `event_exceptions.highlighted` that wins when
  set.** The `??` in the overlay merge is deliberate and not interchangeable with `||`: an
  override of `false` un-highlights one date of a highlighted series, which is the entire
  reason the column is nullable. `rescheduleOccurrence` deliberately does **not** write it —
  dragging an occurrence must leave it inheriting.
- **The horizon governs highlighted events only.** Today and tomorrow show everything, so no
  row disappears at any `slateHorizonDays` setting; days 2..N carry only what is flagged.
  Without that restraint the card would flood with routine calendar noise and the flag would
  be worth nothing.
- **Filter after `applyExceptions`, never in SQL.** `eq(events.highlighted, true)` in
  `candidateWhere` would drop a series whose only highlighted occurrence lives in
  `event_exceptions` — the same silent loss `calendar/queries.ts` already documents for
  inbound reschedules.

**T17 is shipped: every dashboard card folds to its header, and remembers.** Migration
`0038`. **ADR-0016 is the authority**, including on what it costs.

- **`user_preferences.dashboard_collapsed` is `jsonb` holding a LIST of folded card keys**,
  and it is the only preference here that is not one column per setting. The dashboard's
  card set churns faster than anything else in the app — T13 deleted three cards, T15 merged
  two, T16 merged three more — so a column per card means a migration every time and a dead
  column on every deletion. `parseCollapsedCards` filters what comes back against
  `DASHBOARD_CARDS`, so a key for a card that no longer exists stops matching instead of
  erroring, and deleting a card stays a one-file change.
- **`DashboardCard` is a client shell holding SERVER-RENDERED children.** That is the whole
  design: the fold is instant instead of waiting on a Server Action plus
  `revalidatePath("/")` to redraw the page, and `CategoryBars` and the stat tiles stay
  server components. A chevron as a small client island in each card cannot do this, because
  nothing on the client would own the content. Read ADR-0016 before "simplifying" it.
- **The write is a single atomic statement each way** — `|| '["macros"]'::jsonb` to fold,
  `- 'macros'` to unfold. Not defensive: the fold is optimistic, so one person in one tab
  can start a second write before the first commits. `parseCollapsedCards` deduplicating on
  read is **load-bearing** because of it.
- **The settings form is deliberately NOT a writer.** `dashboardCollapsed` is absent from
  `userPreferencesSchema`, so saving anything on `/settings` cannot touch the column. The
  chevron is the only control; there is no second surface to keep in step.
- **The stat tiles stopped being whole-tile links** — a `<button>` inside an `<a>` is
  invalid, so the link moved to the header arrow. A real regression in click target, and the
  one part of T17 a user could reasonably dislike.

**T18 is shipped: a habit's quota is drawn as one box per log.** No migration.

`QuotaMeter` (`components/ui/quota-meter.tsx`) replaces the `2/3 this week` text and the
continuous bar on all three habit surfaces — the dashboard card, `/activity`'s strip and
`/activity/habits`. A continuous bar was the wrong shape for the thing: a 66% fill implies a
quantity you are partway through accumulating, when what you have is two logs made and one
to go. ADR-0014 already said a habit is a quota and a log; this is that idea drawn.

- **Exceeding the target GROWS the meter**, surplus segments in the accent colour, rather
  than clamping. A clamped bar drew 3-of-2 identically to 2-of-2.
- **Above ten segments it falls back to a continuous bar and brings the numbers back**,
  because thirty slivers are not countable and a bar with no figure beside it says nothing.
  It was TWELVE until T19 made the segments a fixed size — see below; the number is now a
  measurement of the narrowest surface rather than a judgement about countability.
- **The numbers are gone from the DOM**, so the meter is a `progressbar` carrying the count
  in `aria-valuetext` — otherwise a screen reader gets nothing. The specs assert on that,
  which tests the number and its accessibility together. Hunting for the old text is how
  three assertions were missed; `e2e/_habits.ts` is where the locator lives now.

**T19 is shipped: a habit can be an amount, and its quota is drawn in fixed squares.**
No migration — `habits.unit`, `habits.target_amount` and `habit_entries.amount` have been in
the schema since T12a, deliberately unwritable.

This is audit item 4.6, and the audit's own correction of it is the useful part: it was
scoped as "one validation entry and one form field", and that was wrong by a whole tranche.
`adherence` counted ROWS, so a habit carrying `targetAmount: 20` read **"1 of 1 done" after
a single word** — a number that looks right and is nonsense. Writing those columns without
teaching the maths to sum amounts would have shipped exactly that.

- **The maths changed in two functions and nowhere else.** `tallyByPeriod` sums a
  contribution (1 for a session, the `amount` for a measured entry) and `resolveQuota`
  decides which target a habit is judged against. `habitStreak` and `windowAdherence` were
  not touched at all — they compare a tally to a target and never needed to know which kind
  of number they held. If a future variant does not fit in those two functions, that is a
  signal about the variant.
- **`Adherence` carries `measured` and `unit`.** That is what kept this out of four card
  shapes: every surface that draws a quota already receives a `now`, so the meter, the
  figures and the log control all learn the variant from one object. `HabitStripCard`
  gained no field.
- **An entry with no amount is worth NOTHING to a measured habit**, and the dialog says so
  before you switch one. Switching is allowed on the same reasoning `updateHabit` already
  allows a cadence change: it rewrites history, and that is acceptable because it is a
  visible edit. Sessions logged before the switch genuinely recorded no quantity; counting
  each as one word would invent data.
- **`+ Log` could not express "fifteen pages"**, so the control changed. `LogHabitButton`
  (`components/habits/`) replaces the four near-identical buttons: unchanged for a session
  habit, a small popover prompt for a measured one. `aria-label` stays exactly `Log {title}`
  in both branches — four specs address it by that name and it is their only handle.
- **The action is what refuses a mismatch**, not the client: a measured habit REQUIRES an
  amount and a session habit rejects one. Both are reachable from a page left open while
  the habit was edited in another tab, and there is no constraint that would catch the row.
- **The companion could not propose one, and now can — see T20 below.**

**The squares became a fixed size in the same pass, and `MAX_SEGMENTS` is now measured.**
They were `flex-1`, so the same three-a-week quota drew fat segments in a wide card and thin
ones in a narrow chip — a segment's width was a fact about its container, not about the
habit. Fixed 8px squares make a longer row mean a bigger commitment, at a glance, across
every habit on a page. The cost is that the row has a real width now:

- `/activity`'s 192px habit chip gives its meter **108px**. At 8px a square plus a 2px gap,
  twelve squares need **118** and overflowed by ten. Ten squares need 98 and fit.
- **The layout sweep did not catch it and cannot.** The chip lives inside an
  `overflow-x-auto` scroller, and a scroller is allowed to hold content wider than itself.
  This was found by measuring the box in a throwaway probe spec, which is the only way. If a
  surface narrower than 192px ever draws a quota, measure the bar — `mobile-layout.spec.ts`
  will stay green either way.

**T20 is shipped: the companion proposes measured habits, and the app judges the rate.**
No migration.

This is the item IMPROVEMENT-PLAN has carried as unbuilt since T12c — _"at 20 words a day
you reach 5000 in February, not December"_ — which was blocked on a proposed habit being
able to state an amount at all. T19 removed the blocker; this builds the thing.

- **`goalPlanHabitSchema` gained `targetAmount` and `unit`**, and the interesting part is
  what it did NOT gain. The both-or-neither rule cannot live in that schema: it is converted
  by `z.toJSONSchema` and sent as a `strict: true` structured-output schema, and Zod refuses
  outright — _"Transforms cannot be represented in JSON Schema"_. A `.transform()` or
  `.superRefine()` there would break **every plan request in the app**, not degrade one
  field. Tested before writing it, not discovered afterwards.
- **So the rule lives in `proposedQuota` (companion/service.ts)**, read by both the review UI
  and `finalizePlan`. A half-stated habit — an amount with no unit, or the reverse — is read
  as a SESSION habit rather than rejected, which is the same asymmetry
  `goalPlanPayloadSchema` already documents about its minima: a rejected payload reaches the
  user as a bare `malformed` they can only escape by regenerating.
- **Both fields are `.nullable().default(null)`, and both halves matter.** `nullable` because
  `strict: true` requires every property present and `.optional()` drops it out of
  `required`; `.default(null)` because a plan already sitting in `ai_proposals` from before
  these fields existed has neither key. Without the default, every pending plan in the
  database would have become `malformed` on upgrade — unreadable, and _un-discardable_,
  because the renderer that offers Discard never renders.
- **`buildGoalContext` now sends the goal's numbers.** It selected `title`/`notes`/
  `targetDate` only, so the model never learned a goal was "2000 kanji". It sends what is
  LEFT rather than the total, since a goal part-done needs a rate for the remainder. Still
  named columns, never the row — ADR-0011's rule, and `service.test.ts`'s exact-string
  prompt assertion is the tripwire that enforces it.
- **`planWarnings` gained `rate-short`**, and it is a list of reasons to stay SILENT with one
  reason to speak. It needs a numeric target with something left, a future target date, and
  **units that match** — `goals.unit` is free text and purely a display suffix, so this app
  converts nothing and must not start by inference. "30 minutes a day" against "2000 kanji"
  is not slow, it is incomparable. Rates SUM across habits sharing the goal's unit, because
  two practices toward one goal genuinely do add up.
- **The review UI shows every plan-level warning, not the first.** That was a latent
  shortcoming before — an empty plan produces both `no-habits` and `no-milestones` and only
  one ever rendered — and `rate-short` gave it a third way to hide something.

**Deliberately still not built:** month length in the rate maths is approximated at 30 days
(`DAYS_PER_PERIOD`), with a 5% grace so the approximation cannot produce a warning on its
own. Walking real calendar periods is a lot of machinery for an estimate of a plan nobody
has started.

**T20 also uncovered a leak that had been there since T12c, and it is the more useful
finding.** `companion.spec.ts` had no `afterEach` at all. `habits.goal_id` is
`ON DELETE SET NULL` by design — giving up a target must not delete the practice that served
it — so `removeGoal` deleted the goal and left every habit an applied plan had created,
permanently, for the rest of the run, in `/activity`'s strip where other specs can see them.

It stayed invisible for eight tranches because the only leaked habit was WEEKLY, and its
meter caption reads "this week". The moment the stub proposed a DAILY one the caption became
"today" — and `todos-sections.spec.ts`, which found its Today section with
`locator("section").filter({ hasText: "Today" })`, matched the habit strip as well and died
on strict mode. Two faults, both fixed: `deleteHabitsMatching` in `e2e/_habits.ts` with an
`afterEach` that calls it, and a `sectionBody` helper that scopes by the exact HEADING
instead of by text. **Playwright's `hasText` is case-INSENSITIVE** — worth remembering before
writing another one.

**T7a Notes/Journal was REMOVED in T13**, not retired-in-place like T7c. The module, the
pages, the dashboard card and the `notes` table are all gone (migration `0035`, dropped
after a verified-empty pre-flight dump — the user had written nothing in it). Anything you
read below or in `IMPROVEMENT-PLAN.md` about a Journal card, a `/notes` route or a notes
module describes something that no longer exists; the history is kept because ADR-0011's
privacy reasoning was built on it and reads oddly without it.

**T7c is marked "retired by T12a", not shipped**, and that is not bookkeeping. T7c derived a
habit from a repeating task, so every habit materialised task rows; T12a rebuilt habits as a
quota and a log that generate nothing (ADR-0014 supersedes ADR-0009). Anything you read about
habits that assumes a task row is pre-T12a and wrong.

The T12 line is what most of §5 now describes:

|               |                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T11**       | The companion's configuration moved from the environment into `user_preferences`. `src/lib/config.ts` holds nothing about AI.                              |
| **T12a–T12c** | Habits became a primitive; goal momentum counts habit sessions; the companion proposes habits rather than a dated checklist.                               |
| **T12d**      | `/activity` revisited for that primitive — habits left the rail for a strip at every width.                                                                |
| **T12e–T12f** | The dashboard agenda groups routine-created tasks and can be reordered; a routine chooses whether its unfinished tasks go overdue or are dropped silently. |
| **T12g**      | **The e2e suite got its own database.** The single most important entry here — see §3.                                                                     |
| **T12h**      | Companion settings derive the base URL and fetch the model list, instead of asking you to type both.                                                       |
| **T12i**      | A dead-code sweep that turned up four finished actions with no UI, and wired them.                                                                         |

**The ROADMAP has run out of code that can be written without a deployment — the work has
not.** T13 through T20 are eight tranches shipped since, none of them on any plan: they came
from the user looking at a screen and saying what was wrong with it, from the pre-deploy
audit that exercise turned into, and from that audit's own list of things it had deferred. Read that as the shape
of the work now, not as a backlog waiting to be worked through. **Hosting is still the only
thing standing between this app and being used**, and everything in the table below is
blocked on it.

| Next up                                   | Why                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting / Checkpoint 0.4**              | The only remaining work that isn't blocked on it. Host is a **Windows home PC, amd64**, with a discrete NVIDIA GPU (**6GB** VRAM — an earlier note here said 12GB+, and that error is what ADR-0011 reverses). Procedure: **`docs/runbooks/deploy.md`**.                                                               |
| **T5c-b** — event reminders over Web Push | Behind hosting, not by preference: iOS only permits Web Push from an installed home-screen app, and it needs a scheduler this app does not have. Both need the deploy first.                                                                                                                                           |
| **The §10 soak**                          | A week of real daily use, from the original ROADMAP. Never done, because the app has never been somewhere it could be used daily.                                                                                                                                                                                      |
| **The AI companion — complete**           | **T9a–T9d shipped**, reshaped by T12c and reconfigured by T11 and T12h. See §5, ADR-0011 and ADR-0012.                                                                                                                                                                                                                 |
| **The Activity page — complete**          | **T10a–T10b shipped**, revisited by T12d and again by T13. `/todos` merged into `/activity`; `/goals` un-merged back to its own page and the rail is gone. Habits are a strip. See §5 and ADR-0013 with both amendments.                                                                                               |
| **Mobile — measured, not finished**       | A `mobile` Playwright project renders every `(app)` route in WebKit at 393px — **ten** since T13 deleted `/notes`; it was eleven when T12i's follow-up added it, and nine of those were already clean. It was also BLIND to anything inside a vertical scroller until T18 (see §4). What it still cannot see is in §6. |

### Hosting: what is already known

**The full procedure is `docs/runbooks/deploy.md`.** What follows is only the context that
runbook assumes.

Decided with the user, so do not re-litigate:

- **Clone the repo on the desktop and build there.** This replaced an earlier plan to build
  on the laptop, `docker save` to a `.tar` and carry it over. The change is not cosmetic:
  the PC needed the checkout regardless — the migrations, `scripts/seed-user.ts`, and
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

**The Docker-Desktop gap is closed** (2026-08-17). It was: Docker Desktop is a Windows GUI
app tied to a login session, so the stack stayed down after a Windows Update reboot until
someone logged in — which falsified ADR-0002's always-on premise rather than being a config
detail. The answer is **Docker Engine inside WSL2, not Docker Desktop**, with systemd in the
distro and a Task Scheduler trigger at _system startup_ rather than logon. ADR-0002's
amendment has the reasoning and rejected alternatives; `deploy.md` §0 has the procedure, and
it now runs before everything else. The trap worth keeping in mind: Docker Desktop's own
"WSL2 backend" setting does **not** fix this — the backend is only where containers run, and
the lifecycle still belongs to the GUI process.

One gap still unresolved:

1. **Postgres is not published** in `docker-compose.prod.yml` (correct for security), so
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
- **The e2e suite runs against `winnow_test`, not your database** (T12g). It also starts its
  own dev server on **port 3001** — 3000 is yours and is never touched, so you can keep
  working while a suite runs. `e2e/global-setup.ts` creates the database if missing,
  migrates it, **empties it**, and re-seeds the account before every run.
  - This was NOT true before T12g, and the old arrangement is why real data kept
    disappearing. The app's `webServer` had `reuseExistingServer`, so Playwright attached to
    whatever dev server was already up — the one pointed at real data. Overriding
    `DATABASE_URL` in the config could never have helped: the env of a process you did not
    start is not yours to set.
  - The connection string is DERIVED from `DATABASE_URL` (`winnow` → `winnow_test`) rather
    than configured separately, so there is no second value to drift. `assertSafeToDestroy`
    in `e2e/_test-db.ts` refuses to run if the target does not end in `_test`.
  - Because the database is emptied each run, **a spec that does not seed what it asserts on
    will fail** — see the next bullet. That is the intended pressure.
  - Debris no longer reaches you, but it still accumulates within a run; the `afterEach`
    sweeps are still worth keeping honest.
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
- **`pnpm test:e2e` runs two projects.** `chromium` is the suite proper. `mobile` renders
  every `(app)` route in **real WebKit at 393px** and is the only thing that has ever
  exercised this app below 768px — `devices["iPhone 15"]` carries
  `defaultBrowserType: "webkit"`, which the runner honours. There is no npm script for it
  alone; use `npx playwright test --project=mobile` (~1 min warm, ~2.5 cold). It depends on `ai-setup`,
  because the tool panels do not render when the companion is unconfigured — `ai.setup.ts`
  proves readiness on `/activity/routines` now that `/companion` is gone.
  - Beware the asymmetry with the CLI: `playwright open --device="iPhone 15"` sets the
    viewport but still launches **chromium**, because `-b` defaults to it. Pass
    `-b webkit` explicitly, and do not maximise the window — a headed viewport follows the
    OS window, and a maximised one silently becomes a desktop render of a desktop layout.
- **Lint has 5 known warnings**, all `react-hooks/incompatible-library` from
  react-hook-form's `watch()`. Judge lint by errors, which should be 0.
- **Do not commit or push unless asked.** The user drives that explicitly.

Current green baseline, measured on a full run: **859 unit tests across 46 files, 167 e2e,
0 lint errors, 5 lint warnings** (2026-08-19, T20; 11.6 minutes wall clock for the e2e,
**zero flaky**). The two runs before those fixes took 19.0 and 22.5
minutes and each retried two tests — a retry is a whole test re-run, so a flaky suite reports
a slower clock as well as a worse result. The
numbers here disagreed with each other before T16 — 784/46/143 in one sentence and 140 in
the next — so re-measure rather than trusting a remembered figure.

**Wall clock is the triage signal, and it is not reliable on this machine.** Full runs on
2026-08-17 came in at 11.4, 11.5, 11.9, 16.7, 26.9 and 46.7 minutes, and one ran 10.1 HOURS
because the machine slept overnight. A slow run produces timeout failures that look exactly
like real ones — three separate times that day a scattered red run turned out to be the
machine — so before debugging a failure, compare the clock to ~12 minutes. The reverse trap
is just as real: one of those slow runs also hid three genuine breakages, so "the machine
was slow" is a reason to re-run, never a reason to dismiss.

The e2e count is **all three** Playwright projects — `chromium`, the ten-route `mobile`
sweep, and `desktop-layout`, which runs the same ten routes at 1280px and 1366px — along
with the setup and teardown projects. A `--project=chromium` run will therefore report
fewer, and that is not a regression.

**The two layout sweeps share one detector**, `e2e/_layout.ts`. It was inside
`mobile-layout.spec.ts` until it needed a second caller, and the extraction is the point:
the detector had been aimed at 393px for its whole life, so every spill at laptop width went
unseen. If you widen what it catches, both sweeps get it.

**A viewport breakpoint cannot answer a question about a column, and `sm:` inside a narrow
column is the second most repeated shape after the negative margin.** `StatCards` used
`sm:grid-cols-2` to decide whether its two tiles sit side by side. `sm:` asks whether the
WINDOW is at least 640px, which on a laptop it always is — but those tiles live in the
dashboard's right column, `minmax(0,1fr)` of a three-column grid, so about 290px at 1280px.
Each tile got 129px for a header needing 134.

Two things about it are worth carrying forward. First, **nothing truncated to absorb it**:
the `h2` carries `min-w-0 flex-1 truncate` and still sat at full width, because `CardHeader`
is a grid and an auto-sized track resolves to its item's max-content and is never squeezed.
Reading the CSS predicted the opposite twice; a probe measuring the real box model settled it
in one run, which is the same lesson `_layout.ts`'s own docstring opens with.

Second, **the narrow fix was a trap.** A `min-w-0` on that row lets the track shrink, clears
the detector, and leaves 13px for the heading — a passing test and a worse UI. The fix is a
container query (`@container` + `@sm:`), because the question was always about the column.

**A negative margin is the most repeated bug in this codebase — four times and counting.**
`-mx-1` reached `habit-strip` and `routines-line` in T13, `-mx-2` sat in Slate's routine
block through T16, and `-mr-1` on the collapse chevron in T17. Every one is the same shape:
the negative margin pulls a container in while the child's border box keeps its full width,
so the child overflows its parent's content box and something scrolls sideways. They are
usually reached for to make a tint or a control bleed past the text it sits beside.

**`mobile-layout.spec.ts` could not see two of the four, and that is now fixed.** It read
`overflow-x` off the computed style in two places — once for the element and once for its
ancestors — and `overflow-y: auto` computes `overflow-x` to `auto` as well, because the CSS
overflow spec promotes a `visible` paired with a non-`visible`. So every VERTICAL scroller
looked like a deliberate horizontal one, excused its own overflow, and excluded everything
inside it. Deliberate horizontal scrollers are now recognised by naming `overflow-x-auto` in
the class list, which is the honest record of intent in a Tailwind-only codebase.

That was verified by injecting a bleeding element and watching the sweep report it —
**narrowing the ancestor check alone changed nothing**, because the element's own check was
still swallowing it, and a green run would have been mistaken for a working guard.

**A failing test costs you two red tests, and the second one lies.** T16 broke
`goal-momentum.spec.ts` (see the `Segmented` trap below); it died at its assertion, which is
_before_ its `deleteTask` cleanup, and left one task behind. `/activity` then had a checkbox
on it for the first time in that run — the e2e database is truncated per run and the seed
creates none — and `mobile-layout.spec.ts` reported a spill on `/activity`, a route the
change never touched. Root-causing that second failure cost half an hour and ended somewhere
unrelated. **When two specs go red and one of them is a layout sweep, fix the other one
first and re-run before believing the sweep.**

That spill was a **false positive that had been latent since July**. `Checkbox` carries
`after:absolute after:-inset-x-3 after:-inset-y-2` — an invisible enlarged tap target — and a
generated box anchored to a `position: relative` parent counts toward that parent's
`scrollWidth` per spec, so a 14px checkbox reports 26. Nothing is drawn, so nothing can
overlap, which is what `layoutFaults` means by "spill". The detector now measures how far an
element's real content reaches (child rects and text-node rects) instead of trusting
`scrollWidth`. **The component was left alone deliberately**: the `::after` is the touch
target, and excluding it from `scrollWidth` while keeping it clickable means moving the
enlargement out to every call site.

**`Segmented` takes a REQUIRED `label`, and that is not decoration.** It used to render a
bare `<div>` of toggle buttons; the `FieldLabel` above each one was associated with nothing.
That survived only while every option string in the preferences form was unique. T16 added
`slateHorizonDays` with "1 week" and "2 weeks" — which `goalMomentumDays` already had — and a
screen reader started announcing "1 week, button, pressed" twice with no way to tell the
controls apart, while `goal-momentum.spec.ts` broke on a strict-mode violation. It is now
`role="group"` + `aria-label`, and specs scope to `getByRole("group", { name })`. **Adding a
segmented preference whose labels collide with an existing one is a live accessibility bug,
not just a test problem.**

**And scoping to the group is only half of it — the group name needs `exact: true`.** Adding
`dashboardCalendarView` in 2026-08-17 gave the form a second Month/Week control, and
`settings-defaults.spec.ts` broke exactly as T16 predicted. Scoping it to
`getByRole("group", { name: "Calendar opens on" })` did **not** fix it: Playwright matches an
accessible name by SUBSTRING unless told otherwise, and the new label —
"Dashboard calendar opens on" — CONTAINS the old one, so the group lookup resolved to two
groups and failed identically. The lesson is narrower than "scope to the group": scope to the
group **and match its name exactly**, because preference labels are naturally one another's
prefixes. `segmented()` in that spec is the helper to copy.

**Fixture teardown goes through the DATABASE, not the UI.** `e2e/_events.ts`, `_goals.ts`
and `_tasks.ts` each expose a `delete…Matching(fragment)` built on `withTestDb` in
`_test-db.ts`, which calls `assertSafeToDestroy` by construction so no caller has to
remember it. `deleteGoalsMatching` and `deleteTasksMatching` take **no `page`** — that is
the fix, not an omission. The UI versions swept a specific page and were silently vacuous
anywhere else, which is how `review.spec.ts` leaked a goal for a whole run after T13 moved
goal cards to `/goals`.

Two rules when extending it:

- **A delete that is the ASSERTION stays in the UI.** `calendar.spec.ts` is literally
  "create and delete a calendar event"; `task-links.spec.ts` covers a goal delete detaching
  its tasks. Both keep driving the real dialog. `calendar.spec` has a teardown hook as a
  SAFETY NET beside it, because its event sits on today — the one date every dashboard spec
  reads.
- **`strpos` for goals and tasks, prefix `LIKE` for events.** The goal and task helpers kept
  the CONTAINS semantics `visibleCard(page, fragment)` gave them, deliberately: changing the
  matching rule at the same time as the mechanism risks a fragment that no longer matches,
  which fails silently and is exactly this helper's known failure mode.

**Removing that teardown exposed a race it had been hiding.** Four navigations per test left
the browser warm and hydrated and put seconds between tests; a `delete` returns in about ten
milliseconds. `calendar-following`'s `openWithScope` went straight from `goto` to `click`
and assumed the dialog opened — a click delivered before React attaches its handler leaves
the button focused and opens nothing. It now clicks until the dialog is actually open.
**If a spec starts failing right after a teardown is made faster, look for a click that
assumes its own effect** rather than putting the slack back.

**All four known flakes were ONE bug, and it is fixed.** `todos-reorder:59`,
`todos-reorder:86` and `calendar-reschedule:74` were listed here as separate unsolved flakes
from 2026-08-13. They shared a single shape:

```
await expect.poll(…)   // reads the OPTIMISTIC DOM, so it passes immediately
await page.reload()    // aborts the write that has not landed yet
expect(…)              // asserts the server agrees. Sometimes it did not.
```

`handleReorder` paints synchronously (`setPendingOrder(ids)`) and writes inside a transition,
so the poll is satisfied while `reorderTasks` is still in flight; the reload then aborts the
POST. `calendar-reschedule` even carried a comment stating the intent it could not enforce —
_"THE point of the test: it came from the database, not from the optimistic paint."_

**This was proved, not inferred.** Holding the Server Action open for two seconds and
reloading immediately loses the reorder every time; the order is byte-identical before and
after. Meanwhile **24 straight repeats of the spec never reproduced it** — so repetition was
never going to find this, and a rare race is not a rare bug. If you are chasing something
like it again, build the experiment rather than running the test more times.

The fix is `serverWrite(page)` in `e2e/_server-write.ts`: arm it BEFORE the interaction, await
it after the optimistic assertion, then reload. It matches the `Next-Action` header rather
than method-and-path, because a Server Action posts to the page's own route and a looser
predicate would resolve on a navigation.

**There was nothing in the DOM to wait on instead**, and that is the part worth carrying:
`reorderTasks` returns `{ ok: true }` with no toast, and clearing the pending order is
visually a no-op once the server agrees. The app gives a successful write no signal at all.

**The app behaviour underneath is now fixed too, and the fix is smaller than it first looked.**
Measuring the exposure changed it: a SOFT navigation does not lose the write. A client-side
route change keeps the JS context alive and the fetch completes — proved by delaying a Server
Action two seconds, soft-navigating mid-flight, and finding the reorder had persisted. Only a
HARD navigation loses it: reload, tab close, an off-site link.

So the guard is a `beforeunload` and nothing larger — `useWriteGuard` in
`components/shared/use-write-guard.ts`, keyed on `isPending` from each surface's own
`useTransition`, on all four optimistic-write surfaces (the task list, the dashboard agenda,
the goal list, drag-to-reschedule). A router guard was rejected: soft navigation is already
safe, so intercepting it would be friction bought for no safety.

`isPending` rather than each surface's optimistic state, deliberately. Slate's `order` overlay
is never cleared, so it is not a pending signal at all — and the transition flag covers every
optimistic write on the page rather than only the reorder.

**Proved in both directions**, because a passing suite shows only that the guard is harmless:
idle reload → 0 dialogs; reload during a held-open write → 1. If you change this, check the
negative case as well, or you will be prompting on every navigation and the suite will still
be green.

**`quick-add-burst:42` was the same bug wearing different clothes.** It looked unrelated —
no reload, no optimistic-then-navigate — and it took reading the file to see it. `burst()`
ended with `waitForTimeout(1_500)`, and the dashboard test is the ONLY one of the four that
navigates afterwards (`page.goto("/activity")`, to assert where quick-capture's dated tasks
actually appear). So the sleep was the thing standing between three in-flight writes and a
hard navigation — and this file measures `/activity` at 1.7–3.4s per render, which is longer
than the sleep.

Measured with the actions held at 2.5s: **the sleep kept 0 of 3 entries; awaiting the writes
kept 3 of 3.** All three, not just the last, because a burst puts them in flight at once.
`burst()` now uses `serverWrites(page, n)` — one listener counting responses, because several
`waitForResponse` calls would all settle on whichever arrived first.

The lesson is the one worth keeping: **a fixed sleep is a guess about a machine, and this one
is documented as varying by more than 2x between identical consecutive requests.** If a spec
sleeps, it is waiting for something it could be observing instead.

**Two OTHERS appeared after that, and both are now fixed as well.** The sentence here used to
read "no known flake remains", which was true of the four above and wrong as a general claim
— it lasted one run. T19's two full suites came in at **19.0 and 22.5 minutes against a ~11
minute baseline** and each produced the SAME two flaky, both passing on retry, neither in a
spec that tranche touched.

**Read this part before diagnosing anything from a log line.** The first pass at these two,
written from the error text alone, got BOTH of them wrong, and both wrong in the same
direction — inventing a plausible mechanism instead of checking a cheap fact:

|                          | Guessed from the log                      | What the trace showed                                                                                                                         |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar-reschedule:59` | "landed two hours early — drag precision" | It never moved. `0.375` is 9/24, which is where the event STARTS. A no-op leaves exactly the number that a two-hour-early drop would produce. |
| `companion:345`          | "the AI stub never answered"              | The stub was never asked. The click worked, the request went out, and the SERVER returned 422.                                                |

- **`calendar-reschedule:59` — the spec dragged before the grid had hydrated.** `page.goto`
  waits for streamed markup to settle (`_test.ts`) and that is not the same thing: at that
  moment blocks are painted, `offsetTop` is right, and React has attached nothing. Measured
  on this machine: hydration lands ~60ms after settle when idle and **1.2 seconds under 4x
  CPU load**, while the spec reaches its mousedown ~550ms after settle. Under a loaded full
  run the drag went first, `PointerSensor` was not listening, and nothing happened — no
  Server Action POST at all, which is what the trace showed and what proves it was a no-op
  rather than a mis-drop. There is a second failure mode behind the same wait: the grid's
  opening scroll MOVES the block 336px, so a `boundingBox()` taken before it aims the mouse
  seven hours off. **Fixed** by waiting for that scroll (`gridReady`), which is an effect and
  therefore cannot fire before hydration. Reproduced 5/5 at 4x throttle and fixed 5/5.
- **`companion:345` — the seed lost a write, and the app was right to refuse.**
  `seedCompletedTasks` completes three tasks, asserts only the `line-through` OPTIMISTIC
  paint, and returns; the caller's `page.goto("/review")` then aborted the third completion's
  in-flight Server Action. `/review` rendered "2 tasks done", `MIN_TASKS` is 3, and
  `summaryReadiness` correctly returned 422 with "There isn't enough in this week to
  summarise". So this IS the lost-write bug from the four above, wearing a disguise: it
  surfaces four steps downstream as "the AI didn't respond". Both callers seed exactly
  `MIN_TASKS`, so there was no margin for one lost write. **Fixed** with `serverWrites(page,
count * 2)` — the helper that already existed.

The lesson generalises past these two. **`settle()` is not a hydration wait**, and every spec
that uses raw `page.mouse` coordinates or presses a key at a freshly loaded page is exposed
to the same window. `todos-reorder` survives it only because it uses `handle.hover()`, which
re-resolves the element, and because a task list has no effect that moves things after paint.

Treat a non-zero flaky count as a triage item rather than a pass, and **read the trace before
assuming a new one is old** — traces live in `test-results/` and are cleared at the start of
every run, so capture one the same day or you will be reconstructing from a log line, which
is what happened with three of the four above and what produced both wrong guesses here.

The companion's e2e needs a second server — `e2e/_ai-stub.mjs`, a stand-in provider that
Playwright starts alongside the app on port 3100. **`e2e/ai.setup.ts` points the app at it
by writing `user_preferences.ai_*` directly**, and restores the real settings in
`ai.teardown.ts`. It is NOT an environment variable: T11 moved the companion's configuration
into the database, and the `AI_*` keys were deleted from `.env` in T12i because nothing had
read them since. If you see `AI_BASE_URL` mentioned as live configuration anywhere, that
text predates T11. A real model cannot be tested (its output is non-deterministic by design), so what is under test is
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

**A client hook called from a server component is invisible to `tsc` AND to lint.** Only the
e2e suite catches it, and that is the whole argument for running the suite on work that looks
purely mechanical. Threading a `useDateLocale()` through the date formatters produced _0
typecheck errors, 0 lint errors and 38 failing e2e_ on the first attempt, and 9 on the second
— every one of them `Attempted to call useDateLocale() from the server`.

The reason it took two rounds is worth more than the bug. The guard used to find the offenders
was `head -1 <file> | grep -q '"use client"'`, and `review-view.tsx` opens with:

```
// Read-only, so this is a server component — no "use client" on this
```

So a file that says in its first line that it is a server component was classified as a client
one, by a check that matched the quoted string inside that sentence. **Grepping for a
directive will find it in prose.** The honest check takes the first non-blank, non-comment
line and requires it to BE the directive:

```
first = first line that is not blank and does not start with // or * or /*
ok    = first in ('"use client"', "'use client'")
```

Three server components were caught this way — `trends-section.tsx`,
`weight-trend-section.tsx` and `review-view.tsx`. All three now take `locale` as a prop from
their page, which is the shape the parents already used for `currency`.

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

**A schema minimum can reject a CORRECT answer, and it surfaces as `malformed`.** Two of the
companion's four payload schemas carried `.min(1)` on an array that a good answer could
legitimately leave empty, and both reached the user as "the provider answered with something
this app couldn't read" — a dead end whose only exit was retrying into the same wall.

- `goalPlanPayloadSchema.milestones`: the prompt sends the goal's EXISTING milestone titles
  so the model will not duplicate them, so a goal whose milestones are already complete gets
  an empty list back. Correct answer, rejected.
- `importPayloadSchema.rows`: paste a covering letter or a header-only export and "there are
  no transactions here" is the honest answer. Rejected.

Both minima are gone and `planWarnings` gained a `no-milestones` warning to say it out loud.
When adding a payload field, ask what the model should return when there is genuinely nothing
to say — and remember `ai-client.ts` maps any non-2xx to `http`, so if you are seeing
`malformed` the request SUCCEEDED and the body is the problem.

**`summaryPayloadSchema` uses four numbered fields instead of an array, on purpose.** Do not
"tidy" `observation1`–`observation4` back into `observations: string[]`. As an array,
`claude-sonnet-5` called the tool correctly but filled that one parameter with a STRING — the
observations concatenated, sometimes with its own `<parameter name=…>` markup inside the
value. Measured at roughly 1 success in 8. Two fixes failed before the shape change: making
each observation an object (the model serialised the objects instead) and adding an explicit
"call the tool" line to the prompt (2 in 6, i.e. noise). Four discrete fields measured 6/6.
Every array that DOES work in that file — routine items, plan milestones, import rows — holds
short fields; this one held long free prose. `summaryObservations()` in `companion/service.ts`
is the only place that knows the field names.

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

**`/todos` does not exist** — it redirects permanently to `/activity`, along with
`/todos/routines` and `/todos/habits`.

**`/goals` DOES exist again, as of T13**, and its redirect is gone. Read ADR-0013's
2026-08-14 amendment before changing any of this: the merge's _insight_ survives and only
its _layout_ was reversed. `/activity` is the task list; `/goals` is the goal list; neither
holds a copy of the other.

Four things worth knowing before touching it:

- **Selection is `?goal=<id>`, written with `history.replaceState`, not `router.replace`.**
  Every route here is dynamic, so a router navigation would refetch on every filter click
  for data that did not change. If you "fix" this to a proper navigation you will add a
  server round-trip to a click that needs none. Unchanged by T13 — only the trigger moved,
  from a rail card to a menu in the toolbar.
- **The rail is gone.** It was two components, `GoalsBlock` (desktop column) and `GoalChips`
  (mobile scroller), which is exactly why it went: the merge's benefit was a DESKTOP benefit
  paid for at every width, and on a phone goals were `w-40` chips with no drag-reorder.
- **A goal's milestones live in a dialog**, not on the card, and there is still **no
  linked-task list** on a goal — deliberately, and this is the part of ADR-0013 most worth
  defending. `/goals` links each card to `/activity?goal=<id>` rather than copying the rows.
  Two lists of the same rows drift, and only one can be acted on.
- **Goals have their own e2e locator, `goalCard`**, keyed on `data-testid` — the utility
  class `bg-card` is dropped by `cn` whenever a variant sets a different background, so a
  class-based locator silently stops matching. `goalEntry` still exists as an alias of it;
  it used to mean "card OR chip" and there are no chips now.

**T10b put routines and habits in the rail too**, under one rule worth keeping even though
the rail is not: _never offer an action the task list already offers._ A routine gets a Run
control, because running one CREATES tasks. Goals never earned one — every task a goal owns
is already a row you can tick — which is why moving them to `/goals` in T13 cost a glance
and nothing else.

**T12d moved habits out of the rail, and the rule did not change.** Read ADR-0013's T12d
amendment before touching this. The short version: the rule never mentions a viewport, and
the rail is `lg:flex` — so "the rail is the only place a habit can be logged" was true on a
laptop and meaningless on a phone, where the page offered a tile reading "Habits 3" and no way
to log anything. Four things follow:

- **Habits are a strip above the task list, at every width** (`habit-strip.tsx`). One
  component, no `lg:` inside it, below the quick-add so a phone never stacks two horizontal
  scrollers. A habit still gets **no checkbox** — a quota is not done-or-not-done — and
  `e2e/activity.spec.ts` asserts that, plus "exactly one button", plus "creates no task".
- **Routines have a Run button each again, as of T13**, in a horizontal scroller. T12d had
  collapsed them to one `Run…` picker because a card per routine is what let the rail reach
  724px — and T12d's own comment said not to put the buttons back. That comment was right
  about the cause and bound the wrong axis: the problem was VERTICAL growth in a 280px sticky
  column. There is no column now, and `overflow-x-auto` bounds the row the same way the habit
  strip below it is bounded. `routines-line.tsx` argues this at the point of the reversal.
- **Habit chips are `w-48` with their cadence phrase**, restored in T13 from the `w-40` T12d
  squeezed them into to pay for the rail. `2/3` cannot be read as ahead or behind without
  knowing whether the period is a day or a month.
- **`/activity` and `/` use `getHabitStrip`, not `getHabitsView`.** ~37 days of entries and
  four fields instead of 400 days and a thirteen-column row. Safe only because those surfaces
  show `adherence` for the current period, which is identical under every window containing
  today. **A cheaper window for a STREAK would still be the bug T10b said it was.**
- **One log handler, `useLogHabit`**, shared by the strip, the habits page and the dashboard
  card. It returns `pendingId`, not a boolean: a shared flag disabled every habit at once.

**The e2e suite's `visibleCard` excludes `[data-rail]`.** Every habit chip carries it, and so
does every goal card on `/goals` — **there is no rail at all any more, and the attribute is
still correct**, which is the clearest possible demonstration of what it means. It never said
"in the rail": what it has always meant to that selector is **"not a row in the task list"**,
and the rail was simply the only place that was true when it was named. Without it a spec cleaning up by title prefix matches the chip as
well as the row and hangs on a "Task actions" button it does not have — which happened once in
T10a with goals and again in T10b with habits. Renaming it to `data-aside` is the honest fix
and was deliberately not taken: a rename is invisible to TypeScript, so one missed card fails
later as a hang in an unrelated spec. If it is ever done, do it alone, with a
`rg -c 'data-rail'` count either side.

### The dashboard agenda and routine hygiene (T12e–T12f)

Two tranches nothing else in this file described, both hanging off one new column.

**`tasks.routine_id` (migration `0033`) is how a task remembers where it came from.** Read
§4 first — it is declared with **no `.references()`** and its foreign key is hand-written,
for a schema-cycle reason that will bite you if you try to "fix" it.

- **Routine-created tasks are grouped** under the routine's name rather than mixed into
  the list. `buildTodayAgenda` returns `{ overdue, groups, items }` and is still the today
  band's implementation — T16's `buildSlate` calls it rather than replacing it. The group is
  drawn as a **tinted block, not an indented one**, deliberately, so the `Gutter` x-axis
  still lines up across every row.
- **Today's tasks reorder by drag**, through the same `@dnd-kit` `SortableList` everything
  else uses, with an `arrange()` order overlay applied on top of the server list while the
  write is in flight. Only today: every other band is a preview with no ordering applied.
  The drag sends **all** of today's tasks, groups first — `reorderTasks` writes
  `sortOrder = index` over exactly what it is given, and that column is shared with
  `/activity`.
- **The Calendar link was removed** — nobody could say what it was for. `dashboard-agenda`
  asserts negatively that no `Calendar →` link comes back.

**`routines.on_unfinished` (migration `0034`) is `keep` | `drop`, defaulting to `keep`** so
every routine that existed before behaves exactly as it did. `drop` means the routine's
unfinished tasks vanish silently at end of day instead of turning overdue — a shower routine
you skipped is not a debt.

`dropExpiredRoutineTasks` (`todos/queries.ts`) is the sweep, and it is lazy-on-read like
every other scheduler substitute here (ADR-0004): it runs from `getTasks`, **before**
`ensureRecurringTasks`, so a row can never be created and deleted inside one render. Five
boundaries constrain what it may delete, and each is load-bearing — user-owned, on a `drop`
routine, `status = 'open'`, `dueDate` non-null and before today, and `routineId IS NOT NULL`.
That last one is what stops it touching a hand-written task, and there is an e2e asserting
what it must **not** delete as well as what it must.

### The AI companion (T9a–T9d, complete)

**ADR-0011 is the authority** on the provider and the data boundary, **ADR-0012** on why
generation runs in a route handler. This is the short version.

**What exists — and `/companion` does NOT.** T13 deleted it; **ADR-0015 is the authority**.
Each job now sits on the page of the artifact it produces, gated there on `aiReady`:

| Job               | Page                 |
| ----------------- | -------------------- |
| Plan a goal       | `/goals`             |
| Build a routine   | `/activity/routines` |
| Read my week      | `/review`            |
| Read transactions | `/budget`            |

**The machinery is shared and lives in three places.** `useProposal()` in
`modules/companion/` holds the state and the apply/discard/generate handlers (following
`use-log-habit.ts`); `components/companion/` holds `ToolPanel`, `RefinementBox` and the four
proposal renderers; `getPendingProposals(kind)` filters, which is what stops `/goals`
auto-opening a pending import. Generation is **`POST /api/companion/generate`**. If you are
changing the companion, change those — the per-page files are thin.

**Applying does not navigate.** `onApplied` is optional and every page omits it, so the
hook's default refreshes in place. Three of the jobs
run end to end — generate → prune → edit inline → Apply, which writes through the modules'
own actions and lands you on the result:

- **Plan a goal** → milestones, the recurring **habits** that reach them, and at most three
  genuine setup tasks — via `addMilestone`, `createHabit` and `createTask`. Reshaped in T12c;
  see the note below, because the old shape is what started the T12 line.
- **Build a routine** → a routine and its items, via `createRoutine` and `addRoutineItem`.
- **Read my week** → a narrated summary. **The odd one out: nothing to apply.** A paragraph
  is not a row, so there are no checkboxes, no Apply, and no arm in `applyProposalSchema` —
  one Done button, which discards it. It sends `weekOf` from the page's own `?week=`, which
  is the bug T13 fixed: `/companion` could not know which week you were looking at, so every
  summary narrated the CURRENT one whatever week was on screen.
- **Read transactions** → rows pulled out of pasted text, via `createTransaction`. A dense
  row list rather than the spine: forty transactions are a table you scan, not a sequence
  you read.

Off by default. With the companion switched off in Settings **no tool panel renders on any of
the four pages**, and nothing in the app hints the feature exists. The pages themselves are
unaffected — they are not AI features. `e2e/ai-settings.spec.ts` checks all four rather than
sampling one, because "off" is now a claim about a wider surface than a single route.

**The one prompt that sends your own detail.** Every other job sends titles, descriptions
or already-summed figures; transaction import sends the text you paste, because that is
the feature. The UI says so above the box rather than leaving it to be discovered. ADR-0011
described the weekly review as sending "rollups, not rows" — T9d deliberately widens that.
(That sentence used to end "and the journal boundary is untouched". T13 removed the journal;
see ADR-0011's 2026-08-14 amendment for what replaced the boundary.)

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
- **Prompt payloads are built from named fields, never spread from raw rows.** Not a
  preference — a hard boundary, and one that has to be _enforced_ rather than intended.
  This was written as "journal and note content never leaves the machine" until T13
  removed that module; ADR-0011's amendment restates it without a subject, which makes it
  **stronger**, because free text now lives in `goals.notes`, `tasks.notes` and
  `events.notes` — columns the companion reads by design and cannot simply be fenced off
  from. The only mechanical enforcement is the exact-string assertion in
  `companion/service.test.ts`; it is brittle on purpose, so do not loosen it.
  Journal-aware retrospectives are **cancelled, not deferred** — there is no corpus.
- **Behind a two-protocol seam, configured in Settings** (T11) — `user_preferences.ai_*`,
  not the environment. `src/lib/config.ts` holds nothing about AI any more; `getAiSettings`
  / `getAiConfig` read it per request and `aiReady` decides whether it is usable. A local
  endpoint is the **Custom** provider, which is what that escape hatch became in T12h — no
  longer an editable URL box on every provider, but a choice that reveals one.
  **Two things are called "provider" since T12h, and conflating them is a 400.** The
  SETTINGS choice is `anthropic` / `openai` / `custom`; the WIRE PROTOCOL (`AiProvider`) is
  only `openai` or `anthropic`, and `wireProtocol()` maps between them — `custom` speaks
  OpenAI at an address you supply. The base URL is written from the choice on SAVE
  (`resolveBaseUrl`), never on read: resolving on read would replace the e2e stub's address
  with the real provider's and point the whole suite at a paid API.
  **The two protocols are not interchangeable by URL** —
  different path, `x-api-key` vs bearer, a required version header, `system` outside the
  messages, a required `max_tokens`, and tool-use instead of `response_format`. Both
  protocols are unit-tested in `companion/ai-request.test.ts`; the e2e stub speaks OpenAI
  only, so that file is the ONLY coverage the Anthropic path has. That now includes the
  model list: `extractModels` is tested against both response shapes. The Anthropic path HAS
  now been exercised against a live response (2026-08-14, `claude-sonnet-5`): HTTP 200,
  `stop_reason: tool_use`, one `tool_use` block, payload parsed. An earlier note here said
  the account's key returned 401 — that is **false** and was never consistent with the
  symptom it was cited for, since `ai-client.ts` maps any non-2xx to `http`, not `malformed`.
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
278-carbs trap in §6); and cross-module questions the UI has no page for. Journal-aware
retrospectives used to close this list as the one thing worth a local model for; T13
removed the journal, so that argument is gone with it.

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
  state in the URL, so the server renders the chosen view with no flash. Making it stick
  means a `user_preferences` column, which is a smaller job than it sounds now that T14 did
  exactly that for `/calendar`'s own view and T17 did it for which cards are folded.
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
  this number tracks what is in the database rather than being fixed. The Journal card was
  measured and found **not** to contribute — hiding it left both numbers identical — so its
  removal in T13 did not improve this, and the figures above still stand.
- **Page width is a four-step scale, and a new page picks from it rather than inventing a
  fifth.** The widths were ad hoc — six different values across ten surfaces — which is what
  made `/goals` use 60% of a 1440px canvas while the dashboard clipped at 1280. The tiers, and
  what each is for:

  | Tier  | Class            | For                                                                                |
  | ----- | ---------------- | ---------------------------------------------------------------------------------- |
  | Form  | `max-w-3xl`      | one column of fields or entries — Settings, Meals, Budget                          |
  | List  | `max-w-5xl`      | a list plus its controls — Calendar, Review, Routines, Habits, Goals, **Activity** |
  | Board | `max-w-7xl`      | genuinely multi-column — **nothing, currently**                                    |
  | Full  | `max-w-[120rem]` | the dashboard alone, which fills a desktop and only centres past 1920              |

  `/goals` was `max-w-4xl`, the only value off the scale, and is now List like every other
  page of its shape.

  **`/activity` moved from Board to List**, and the Board tier now has no occupant. It was
  the tier's example while it had `lg:grid-cols-[17.5rem_minmax(0,1fr)]`; T13 moved goals to
  their own page and left it one column at every width — the comment in `activity-view.tsx`
  says so — but the width stayed. The cost was visible rather than theoretical: task rows
  ran ~945px at 1280px, and the habit strip's arrow sat ~570px right of the last chip. Keep
  the row in this table: a tier with nothing in it is a decision someone can consult, and
  deleting it would invite the next multi-column page to invent a fifth number. Deliberately NOT abstracted into a constant: Tailwind is the vocabulary
  here and a `PAGE_WIDTH.list` indirection would buy nothing a table cannot say. What matters
  is that the next page reads this before picking a number.

- **Nav is seven items and does NOT vary any more**, and seven is the measured ceiling.
  `bottom-nav.tsx` is a plain flex with `flex-1` and no overflow handling; seven labels fit
  a 375px phone with nothing to spare, and an eighth needs a More sheet or a scroller first.
  Dashboard · Activity · Goals · Calendar · Budget · Meals · Review.

  Every change since the bar filled has been a **swap**, never an addition: T10 merged
  To-dos and Goals into Activity and the Companion tab took the freed slot; T13 removed
  Notes and **Review** took that one, then gave the Companion's slot back to **Goals**.
  `navItemsFor(companionEnabled)` no longer branches — each page gates its own AI tool on
  `aiReady` instead, which is the better shape, since `/goals` exists whether or not a
  provider is configured. Anything wanting a tab from here has to take one from something.

  `e2e/navigation.spec.ts` measures the fit rather than trusting it, and
  `e2e/pending-feedback.spec.ts` holds a duplicate of the seven-label array: both files
  change together or the second one fails.

- **Giving a page a tab means taking it OUT of the command palette by hand.** `NAV_COMMANDS`
  in `command-palette.tsx` is `[...navItems, …four hand-written entries]`, and those four are
  hand-written _because_ they have no tab. T13 gave `/review` a tab while it was still listed
  by hand, which put one page in the ⌘K "Go to" menu twice under two names. Nothing catches
  it — it typechecks, it lints, and no spec asserts that menu's contents — so check the list
  by eye whenever `navItems` changes.
- **Mobile is measured now, but only in the ways a desktop can measure it.**
  `e2e/mobile-layout.spec.ts` renders all **ten** `(app)` routes at 393px and fails on two
  things: a _blowout_ (the document scrolls sideways) and a _spill_ (content wider than its
  own box, where an ancestor's fixed width means the page does not scroll and the text
  simply lies over its neighbour). The second is the one no viewport check catches, and it
  was itself blind to everything inside a vertical scroller until T18 — see §4. It
  **seeds a five-figure transaction on purpose** — a sweep over whatever the account happens
  to hold measures the account, not the layout.
  Three things it structurally cannot see, all of which need real hardware: Safari's
  toolbar collapsing and resizing the viewport mid-scroll, a non-zero
  `env(safe-area-inset-bottom)`, and anything gestural. It also tests one width and only the
  content its seed creates.
- **`--bottom-nav-height` in `globals.css` is depended on by two files that cannot see each
  other**: the main content's bottom padding in `(app)/layout.tsx` and the toast offset in
  `ui/sonner.tsx`. It is `0px` at `md` and up, `calc(3.5rem + env(safe-area-inset-bottom))`
  below. The `3.5rem` is hand-measured from `bottom-nav.tsx` and **nothing enforces it** — if
  that component's padding, icon or label size changes, the variable silently drifts and both
  consumers drift with it. Before it existed, each carried its own guess and the padding's was
  wrong on any phone with a home indicator.
- **Touch targets are below Apple's 44pt guideline throughout.** `icon-sm` is 28px, `icon`
  32px, and the reorder handle in `sortable-list.tsx` is 24px — and that handle is the only
  way to start a drag on touch. They clear WCAG 2.2 AA (24×24) but not the iOS guideline.
  Raising them touches every dense list in the app, so it is a decision rather than a patch,
  and it has not been taken.
- **The calendar week view is intact and unusable at phone width.** A 56px gutter plus seven
  `flex-1` columns leaves ~41px per day at 393px. Nothing overflows — the layout sweep passes
  it — but an event title in 33px of content width is not readable. `day` and `agenda` are the
  right phone views and nothing steers anyone to them.
- **A category's kind cannot be changed once created** (T12i), though `updateCategory`
  accepts it. Flipping it under existing transactions leaves them pointing at a category that
  no longer matches their type: the transaction dialog filters its picker by kind, so
  re-opening one of those rows silently drops its category, and `budget-view` stops offering
  the category a budget. `e2e/manager-renames.spec.ts` asserts the lock, so it stays a
  decision rather than decaying into an omission.
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

`docs/adr/` (0001–0018) records why non-obvious choices were made — read 0006 (dependency
bar), 0007 (hand-written service worker) and 0008 (feed token, floating time) before
touching those areas, and **0011 before writing a single line of the AI companion**: it
sets a hard boundary on what may leave the machine, and that is far easier to violate by
accident than to notice afterwards. **0013** explains why `/todos` and `/goals` no longer
exist, which is the first question anyone asks after a `git pull`, and **0016** why the
dashboard's cards are wrapped in a client shell that holds server-rendered children — which
looks like an over-complication until you try the obvious alternative. `docs/IMPROVEMENT-PLAN.md` carries a "corrections found while
implementing" list at the top that is worth two minutes.
