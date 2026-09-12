# UX review: brief for subagents

You are an agent the supervisor spawned to do one job in the Winnow UX review. Read this
first, then the task you were given. You cannot see the conversation that produced this
review, so everything you need is here, in the task, or in the files named below.

## The project

Winnow is a self-hosted, single-user life organizer, installed as a PWA: tasks, habits,
routines, goals, a calendar, a budget, meals and a weekly review. Next.js 16 App Router,
React 19, TypeScript, Postgres through Drizzle, Tailwind v4 with shadcn components on
base-ui (the registry's `base-nova` style), Auth.js. It is deployed with Docker; the owner
tests changes on a local production build before deploying it.

Read these as needed, not all up front:

- `docs/ux-review.md`: the review itself. The pass order, how a pass runs, the Pass 0 flow
  tiers that set how deep each screen is checked, notes filed ahead for each pass, and the
  inventory of every screen and dialog. **Read your pass's section before starting.**
- `docs/HANDOFF.md`: the project's current state and its traps, section 4 especially.
- `ARCHITECTURE.md` and `docs/adr/`: why things are the way they are. An ADR that covers
  what you are about to change is a decision; changing it needs the supervisor's say-so.

## Your job

Do the task you were given, inside its lens. If you notice something that belongs to
another pass or another concern, put it in your report under "Noticed" and leave it alone.
The review works because each pass changes one thing at a time.

Work test-first where a test can express the change: write or adjust the test, watch it
fail, then make it pass. Prefer the smallest change that does the job, in the patterns the
app already uses. Don't refactor what the task didn't ask about, don't weaken a test to make
it pass, and don't add dependencies.

## Rules that protect the owner's machine and data

Each of these was learned by breaking something.

1. **Port 3000 is the owner's own `pnpm start`.** Never stop it and never start anything
   on it. Don't start dev or production servers from a shell at all; Playwright starts its
   own on port 3001, with an AI stub on 3100, against the `winnow_test` database.
2. **One Playwright run at a time, machine-wide.** Before starting one, check that nothing
   is listening: `netstat -ano | grep LISTENING | grep -E ":3001 |:3100 "` should print
   nothing. A process on 3100 left over from a crashed run is the test stub and may be
   stopped; nothing on 3000, ever.
3. **Never run `pnpm format`.** The repository mixes CRLF and LF line endings file by file,
   and a repo-wide format rewrites them; `.prettierrc` also lacks `"semi": false`, so a bare
   `prettier --write` adds semicolons to a codebase written without them. Format only the
   files you touched, with `--no-semi`, and keep each file's line ending (see "Tools"
   below). `grep` cannot see a carriage return in this shell; count them with node:
   `node -e "const s=require('fs').readFileSync(process.argv[1],'latin1');console.log((s.match(/\r\n/g)||[]).length)" <file>`.
   The Edit tool keeps a file's existing endings; the Write tool creates LF files.
4. **Never commit, push, stash, reset or check out.** The supervisor is the only one who
   touches git.
5. **Never type or echo the owner's password or any key.** The e2e suite signs in as its own
   test user.
6. **Migrations.** An additive change is `pnpm db:generate --name <name>` then
   `pnpm db:migrate`. A rename or a drop breaks the owner's running build the moment the dev
   database is migrated, and drizzle-kit cannot do a rename without a terminal (HANDOFF §4
   has the workaround). Stop and report before any rename or drop.
7. **Temporary screenshot specs** are named `e2e/_tmp-<something>.spec.ts` and are deleted
   before you report. Check with `ls e2e/_tmp-*`.
8. **A shell heredoc over about 130 lines can fail to parse and run nothing at all.** Write
   long content to a file with the Write tool instead.

## Checks and their baselines

- Typecheck: `npx tsc --noEmit`. Clean.
- Lint: `pnpm lint`. 0 errors; 5 known `react-hooks/incompatible-library` warnings.
- Unit tests: `npx vitest run` (jsdom; `vitest.setup.ts` polyfills `PointerEvent` and
  `ResizeObserver` so base-ui and cmdk controls can be rendered and clicked in component
  tests). A base-ui Select can be driven in jsdom: click the trigger, then `keyDown` Enter on
  the option; a synthetic click on the item does not commit it.
- E2E: `pnpm test:e2e <spec files>`. Projects: `chromium` (desktop, most specs), `mobile`
  (iPhone 15 in WebKit, runs only `mobile-layout.spec.ts`), `desktop-layout` (runs only
  `desktop-layout.spec.ts`). Passing spec files without `--project` runs each in the
  projects that match it.
- The full e2e suite takes 13 to 35 minutes. A run that takes hours means the machine slept,
  and its scattered failures mean nothing.
- **One red test is not proof.** The suite is flaky under load. Re-run a failing spec on its
  own before believing it, and report both runs.
- Some specs read data they never created. Seed what you assert on, and clean it up.

## UI conventions

- Screens are checked at **393 × 852** (phone) and **1366 × 900** (desktop), in light and
  dark: `page.setViewportSize(...)` and `page.emulateMedia({ colorScheme })`. The black "N"
  circle in a corner of dev screenshots is Next's dev indicator, not part of the app.
- `e2e/_layout.ts` holds the layout detector (a page that scrolls sideways, or content wider
  than its box) and the route list every layout sweep walks. A deliberate horizontal
  scroller must name `overflow-x-auto` in its class list; the detector reads intent there.
- Section strips are `PageTabs` (`src/components/shared/page-tabs.tsx`). Dashboard cards fold
  through `DashboardCard`. Deletes offer Undo in a toast; deletes that take other data with
  them get a `ConfirmDialog`. The phone tab bar and its More sheet come from `navItems`
  (`src/components/shared/nav-items.ts`).
- shadcn components come from the registry, never hand-built. The CLI can stall on a prompt
  to overwrite existing files; the T35 Sheet was added by copying the registry's
  `base-nova` content with the CLI's own import rewrites (`cn` from `@/lib/utils`, icons from
  `lucide-react`, `Button` from `@/components/ui/button`).
- base-ui's `SelectValue` needs a function child, or it shows the raw value. An inline edit
  inside a `Dialog` must stop Escape from propagating, or Escape closes the whole dialog.
- In specs: cmdk items are `role="option"`; drive a base-ui Select with
  `getByLabel(...).click()` then `getByRole("option", ...)`; use `{ exact: true }` when a
  label also appears in helper text. Helpers live in `e2e/_*.ts` (`_menu.ts` for the Meals
  actions menu, `_card.ts` for `visibleCard`, `_tasks.ts`, `_habits.ts`, `_goals.ts`,
  `_transactions.ts`, `_weights.ts`, `_server-write.ts`).
- Tailwind classes only, colors from the tokens in `src/app/globals.css`. Code comments
  explain why, at the length the surrounding code uses. Copy is plain and active: a button
  says what it does.

## Tools

The supervisor's scratchpad holds three helpers:
`C:/Users/nickh/AppData/Local/Temp/claude/C--Users-nickh-Documents-GitHub-Winnow/b9449f7a-5898-459b-81ac-c7c08b87e6dc/scratchpad/`

- `fmt.mjs <files>`: runs prettier with `--no-semi` on exactly those files and restores each
  one's original line ending. Use it instead of any repo-wide format.
- `rep.cjs < spec`: batch exact replacements that keep line endings. The spec is blocks of
  `@@FILE <path>`, `@@OLD`, the old text, `@@NEW`, the new text, `@@END`, with an `@@FILE`
  line before every block. All blocks are checked before anything is written.
- `fmtcheck.mjs`: a quick formatting check. It does not load the Tailwind plugin, so it can
  flag class order that is actually correct. The authority, run in the repo:
  `npx prettier --check --no-semi --end-of-line auto <file>` (without `--end-of-line auto`
  every CRLF file warns).

The Edit and Write tools are fine too. After editing a CRLF file, confirm it is still CRLF.

## Report back in this shape

1. **Done**: one line per change, with file paths.
2. **Checks**: each command you ran and its result. For a failure, the relevant lines, and
   whether it reproduced on its own.
3. **Screenshots**: their paths, if the task asked for any.
4. **Noticed**: anything outside your lens, for a later pass or the supervisor.
5. **Decisions and questions**: any call you made that the supervisor should check, and
   anything you could not settle.

Keep it short. The supervisor reads the diff itself.
