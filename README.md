# Winnow

A self-hosted personal life-organizer: to-dos, calendar, budget and meal macros, unified by
a dashboard that answers "what needs me today" without navigating anywhere. Single user, no
public internet exposure - it runs on the owner's own hardware, is reached over a Tailscale
tailnet, and installs to an iPhone home screen as a PWA.

Next.js 16 (App Router, Turbopack), TypeScript, PostgreSQL + Drizzle, Tailwind v4 +
shadcn/ui, Auth.js (single account, JWT), Vitest + Playwright.

**Status:** well past the MVP spec, but **not yet deployed to hardware** - see
`docs/HANDOFF.md`.

## Running it locally

```bash
docker compose -f docker/docker-compose.yml up -d   # postgres on :5432
pnpm install
cp .env.example .env                                # fill AUTH_SECRET + SEED_USER_*
pnpm db:migrate                                     # 27 migrations
pnpm db:seed                                        # creates the single account
pnpm dev
```

`AUTH_SECRET` comes from `npx auth secret`. There is no sign-up flow by design - the seed
script is the only thing that creates an account.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm typecheck`, `pnpm lint` | static checks |
| `pnpm test:run` | unit (Vitest, co-located `*.test.ts`) |
| `pnpm test:e2e` | Playwright against the dev server |
| `pnpm test:e2e:prod` | Playwright against a real production build - the service worker only registers there |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle |

Two things that bite otherwise:

- **Do not run `pnpm format`.** The code is deliberately semicolon-free but `.prettierrc`
  sets no `semi` key, so it would add semicolons to every file. Use
  `npx prettier --write --no-semi <files>`.
- **The e2e suite runs serially against the persistent dev database.** Specs create and
  clean their own rows; a failed run can leave some behind.

## Documentation

| File | What it is for |
| --- | --- |
| **`docs/HANDOFF.md`** | **Start here.** Current state, working conventions, and the traps that have already cost time. |
| `SPEC.md` | What the product is, and what is deliberately out of scope |
| `ARCHITECTURE.md` | Stack rationale, data model, deployment, PWA and auth approach |
| `ROADMAP.md` | The original phased build and its checkpoints |
| `docs/IMPROVEMENT-PLAN.md` | The master roadmap since the MVP - tranches T0-T8, plus a corrections list worth two minutes |
| `docs/adr/` | Why the non-obvious calls were made (0001-0010) |
| `docs/runbooks/` | `deploy.md` for standing the app up on the home server; `backup-restore.md`, drilled rather than theoretical |
