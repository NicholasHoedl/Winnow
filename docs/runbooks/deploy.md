# Runbook — First Deploy To The Home Server

Standing Winnow up on the Windows desktop, from a fresh `git clone`, for the first time.
This is ROADMAP Checkpoint 0.4 and it has never been done. Nothing here is drilled — it is
assembled from the compose file, the Dockerfile and ADR-0002, and the first run through it
will find things this document got wrong. Fix them here as you go.

**Read `docs/HANDOFF.md` §1 first.** The single most common wrong assumption about this
project is that some of it is already deployed. None of it is.

## The plan, and how it changed

Originally: build the image on the laptop, `docker save` it to a tar, carry the tar over.
**Now: clone the repo on the desktop and build there.** The desktop needed the repo
regardless — migrations, the seed script and the backup scripts all run from it — so
shipping a tar only ever saved the build, at the cost of a manual file transfer.

One consequence worth stating, because the old plan called it a mistake: the usage line in
`docker-compose.prod.yml` says `up -d --build`, and under the tar plan that was wrong (it
would rebuild from source and defeat the transfer). Under this plan it is **correct**.

## Prerequisites — human only

Claude Code cannot install these, and should not try.

| What | Why |
| --- | --- |
| **Docker Desktop** (WSL2 backend) | Runs the stack. See the open question below before relying on it. |
| **Tailscale**, signed in | The only ingress. ADR-0002. |
| **Node 22 + pnpm** (`corepack enable`) | `drizzle-kit` is a dev dependency and is **not** in the runtime image, so migrations and the seed run from the host, not from a container. |
| **Git** | To clone. |

If you would rather not install Node on the desktop, migrations can run from a throwaway
`node:22-slim` container with the repo mounted and joined to the compose network. That
avoids the host toolchain and the temporary port publish in step 4 — at the cost of a
longer command and no `pnpm` cache. Decide before step 4; it changes that step only.

## 1. Clone

```bash
git clone <your-remote> winnow && cd winnow
```

## 2. Create `.env` — secrets are yours to type

Copy `.env.example` to `.env`. Claude Code can create the file and fill the non-secret
values; **you** fill the secrets. Do not paste passwords into a chat.

Required for the production stack:

| Key | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | Compose refuses to start without it. Not in `.env.example` before this runbook existed — that omission is the first thing that used to break this deploy. |
| `AUTH_SECRET` | `npx auth secret`, or `openssl rand -base64 33`. |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Used once, by the seed script. There is no sign-up flow. |
| `APP_TIME_ZONE` | Compose defaults to `America/Chicago`. |

**`DATABASE_URL` is the trap.** It means two different things:

- The **app container** never reads the one in `.env`. Compose builds its own from
  `POSTGRES_PASSWORD`, pointing at the compose hostname `postgres`.
- **Your shell** reads it, for `pnpm db:migrate` and `pnpm db:seed`. Those need
  `localhost`, and they need the **production** password — not the `winnow:winnow` dev
  value `.env.example` ships with.

## 3. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build pulls `node:22-slim` and runs a full `pnpm install --frozen-lockfile` plus
`next build`. Several minutes. Both services have healthchecks, so
`docker compose -f docker-compose.prod.yml ps` tells you the truth about what came up.

The app publishes on `127.0.0.1:3000` only — deliberately. Nothing on the LAN can reach it.

## 4. Migrate and seed — the one-time awkward step

The database starts empty and needs all **27 migrations** plus the account. But
`docker-compose.prod.yml` publishes **no** port for Postgres, which is correct for
security and means your shell cannot reach it.

So: publish it temporarily, migrate, seed, then take it away.

1. Add `ports: ["127.0.0.1:5432:5432"]` to the `postgres` service.
2. `docker compose -f docker-compose.prod.yml up -d postgres`
3. With `DATABASE_URL` pointing at `postgresql://winnow:<POSTGRES_PASSWORD>@localhost:5432/winnow`:
   ```bash
   pnpm install && pnpm db:migrate && pnpm db:seed
   ```
4. **Remove the `ports:` line again** and `up -d`. Do not skip this.

Binding to `127.0.0.1` rather than `0.0.0.0` matters even for the few minutes it exists.

## 5. Tailscale HTTPS

1. **Admin console → DNS → enable MagicDNS _and_ HTTPS certificates.** Browser, human
   only. Without both, step 2 has no certificate to issue and no name to issue it for.
2. On the desktop:
   ```bash
   tailscale serve https / http://127.0.0.1:3000
   ```
   Tailscale terminates TLS with a certificate it manages and renews itself — there is no
   renewal cron, and that is the whole reason this is the default over `tailscale cert`
   plus a proxy container (ARCHITECTURE §4.3). The CLI's `serve` syntax has changed across
   Tailscale versions; if this form is rejected, check `tailscale serve --help` rather than
   guessing.

## 6. Verify — all three, in order

1. Loads at `https://<host>.<tailnet>.ts.net` from the laptop, over Tailscale, **no
   certificate warning**.
2. Loads at the same URL on the iPhone, with Tailscale connected.
3. Does **not** load from a device that is off the tailnet.

The third is the one people skip, and it is the only one that proves the thing is private.

## 7. Install to the iPhone home screen

Safari → Share → Add to Home Screen.

This is the step that finally exercises three features that have shipped but have never run
anywhere except a laptop: the **offline page** (T6b — the service worker only registers in
production over HTTPS), the **calendar feed** (T5c-a, subscribed from iOS Calendar over the
tailnet), and the **dashboard**, which is a phone surface that has only ever been seen on a
1440px screen. Expect to find things here.

## 8. Backups

`scripts/backup.sh` and `restore.sh` are bash, and `docs/runbooks/backup-restore.md`
schedules them with cron or systemd. On Windows that means **Git Bash plus Task Scheduler**.
Rewrite that section against the real machine rather than leaving it aspirational.

One concrete gotcha: `backup.sh` defaults `WINNOW_DB_CONTAINER` to `winnow-postgres`, which
is the **dev** container name. Under `docker-compose.prod.yml` the container is
`winnow-postgres-1`. Confirm with `docker compose -f docker-compose.prod.yml ps` and pass
the real name.

A backup script is not a backup until a restore has been proven. Do the drill in
`backup-restore.md` on this machine, not on the laptop.

## Open question you should settle before step 3

**Docker Desktop on Windows is tied to a login session.** After a Windows Update reboot the
stack stays down until someone logs in. ADR-0002 assumed an always-on machine, so this is a
broken assumption rather than a configuration detail — the whole point of a self-hosted
organizer is that it is there when you reach for it.

Options, none yet chosen: run the stack under WSL2 as a systemd service; enable Windows
auto-login (weakens physical security); or accept it and restart manually. If the answer is
WSL2-as-a-service, it changes step 3 rather than being a later fix — which is why this is
here and not at the bottom.

## What Claude Code can and cannot do here

**Can:** clone, write `.env` scaffolding without secrets, run every `docker compose` and
`pnpm` command, read logs and diagnose failures, edit the compose file for step 4 and put it
back, run the verification checks it can reach from the desktop, and fix this runbook.

**Cannot, and should not attempt:** install Docker Desktop or Tailscale; sign into Tailscale;
toggle MagicDNS or HTTPS in the admin console; type any password, `AUTH_SECRET` or
`SEED_USER_PASSWORD`; or confirm the from-outside-the-tailnet check, which by definition
needs a device that is not on it.
