# Runbook — First Deploy To The Home Server

Standing Winnow up on the Windows desktop, from a fresh `git clone`, for the first time.
This is ROADMAP Checkpoint 0.4 and it has never been done. Nothing here is drilled — it is
assembled from the compose file, the Dockerfile and ADR-0002, and the first run through it
will find things this document got wrong. Fix them here as you go.

**Read `docs/HANDOFF.md` §1 first.** The single most common wrong assumption about this
project is that some of it is already deployed. None of it is.

## Rehearsed on 2026-08-24 — what is now proven, and what is not

Steps 3, 4 and the app half of 6 were run end to end **on the laptop**, in an isolated
compose project on other ports with throwaway secrets, then torn down with `down -v`. That
is not the deploy — it is the parts of it that do not depend on which machine you are on,
taken off the list before anyone is standing at the desktop.

| Step            | Result                                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| Image build     | **Was broken. Three fixes to `.dockerignore` — see below.** Builds clean now; 390MB. |
| `up -d`         | Both services reach **healthy** on their own healthchecks, ~30s.                     |
| §4 migrate      | 41 migrations apply cleanly, 27 tables.                                              |
| §4 seed         | Creates the account.                                                                 |
| §6.1 (app only) | `/login` serves **200**, `/` correctly **307**s to it.                               |
| §8 `backup.sh`  | Writes a gzip dump — **and see the warning in §8, which got worse.**                 |

**Still entirely unproven**, because none of it can be done from here: everything in §0, the
Task Scheduler lifecycle, Tailscale serve and its certificate (§5), reachability from the
phone or from off the tailnet (§6.2/§6.3), and §7.

**The image build was broken and would have failed at step 3.** Three separate bugs in
`.dockerignore`, all the same shape — a name that does not match its longer sibling:

- `.next` does not match **`.next-e2e`**. `distDir` is env-configurable and the suites use
  it, so a machine that had run the e2e shipped 1.1GB of stale output into every build.
- `e2e` does not match **`e2e-prod`**, so the production suite was copied in without the
  `e2e/` helpers it imports.
- `playwright-report` does not match **`playwright.config.ts`**, which imports `./e2e/`.

The last two are FATAL rather than merely wasteful, because `next build` type-checks the
whole project: the image build died on `Cannot find module '../e2e/_login'`, which is a
baffling thing to read while deploying. All three are fixed with globs.

**One intermittent failure is NOT explained.** The very first build failed inside Turbopack's
CSS optimizer with corrupted strings — `var(-���-nav-height)` where
`var(--nav-height)` belonged, control bytes injected mid-token. It has not recurred in three
builds since, and the same commit builds cleanly on Windows. If step 3 fails on the desktop
with a CSS parse error, **retry it before believing anything is wrong with the CSS** — and
record here whether it recurred, because one sighting is not a pattern.

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

| What                                                         | Why                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **WSL2 with Docker Engine inside it — _not_ Docker Desktop** | Runs the stack, and keeps running it after a reboot with nobody logged in. **Do §0 first**; the obvious install is the broken one here.    |
| **Tailscale**, signed in                                     | The only ingress. ADR-0002.                                                                                                                |
| **Node 22 + pnpm** (`corepack enable`)                       | `drizzle-kit` is a dev dependency and is **not** in the runtime image, so migrations and the seed run from the host, not from a container. |
| **Git**                                                      | To clone.                                                                                                                                  |

If you would rather not install Node on the desktop, migrations can run from a throwaway
`node:22-slim` container with the repo mounted and joined to the compose network. That
avoids the host toolchain and the temporary port publish in step 4 — at the cost of a
longer command and no `pnpm` cache. Decide before step 4; it changes that step only.

## 0. Docker, the way this host actually needs it

**Human only, needs elevation, and it comes first because everything after it assumes a
Docker that is running.**

Do not install Docker Desktop. It is a Windows GUI application tied to a login session, so
after a Windows Update reboot the stack stays down until somebody logs into the desktop —
which falsifies the always-on assumption ADR-0002 is built on. Selecting Docker Desktop's
"WSL2 backend" does **not** fix this: the backend is only where containers run, and the
lifecycle still belongs to the GUI process. See ADR-0002's 2026-08-17 amendment.

Install Docker Engine inside a WSL2 distribution instead, and give it a lifecycle with no
human in it:

1. Install WSL2 and a distro (Ubuntu is fine), then inside it add to `/etc/wsl.conf`:

   ```ini
   [boot]
   systemd=true
   ```

   Then `wsl --shutdown` from Windows so the distro restarts with systemd as PID 1.

2. Install Docker Engine in the distro following Docker's own instructions for that
   distribution — the `docker-ce` packages, not `docker.io`, and not Docker Desktop. Then:

   ```bash
   sudo systemctl enable --now docker
   sudo usermod -aG docker "$USER"
   ```

   Log out and back into the distro for the group to take effect.

3. Make the distro start with Windows. Task Scheduler → Create Task:
   - Trigger: **At startup** — _not_ "At log on". This is the entire point; a logon trigger
     reproduces the original problem while looking like a fix.
   - Action: `wsl.exe -d <distro> -- /bin/true` (starting the distro is enough; systemd
     brings Docker up behind it).
   - Check **Run whether user is logged on or not**.

4. Verify the thing you actually care about: reboot with nobody logged in, wait, then from
   another machine on the tailnet confirm the stack answers. Do this **before** step 5's
   HTTPS work, so a failure here is isolated from a failure there.

Everything from here on — `docker compose`, `pnpm`, the repo — lives **inside the distro**,
not on the Windows side.

## 1. Clone

```bash
git clone <your-remote> winnow && cd winnow
```

## 2. Create `.env` — secrets are yours to type

Copy `.env.example` to `.env`. Claude Code can create the file and fill the non-secret
values; **you** fill the secrets. Do not paste passwords into a chat.

Required for the production stack:

| Key                                      | Notes                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                      | Compose refuses to start without it. Not in `.env.example` before this runbook existed — that omission is the first thing that used to break this deploy. |
| `AUTH_SECRET`                            | `npx auth secret`, or `openssl rand -base64 33`.                                                                                                          |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Used once, by the seed script. There is no sign-up flow.                                                                                                  |
| `APP_TIME_ZONE`                          | Compose defaults to `America/Chicago`.                                                                                                                    |

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

The database starts empty and needs **every migration** plus the account — 41 at the time
of writing, and the count in `drizzle/meta/_journal.json` is the authority rather than this
sentence. It is written that way because the number here has already gone stale twice in one
day: it said 35 when there were 39, was corrected, and was stale again two migrations later.
`drizzle-kit migrate` applies whatever it finds, so the figure was never load-bearing — it is
here only so you can tell at a glance whether the run did roughly what you expected. But
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

**`backup.sh`'s default is dangerous, and the rehearsal proved it rather than reasoning
about it.** It defaults `WINNOW_DB_CONTAINER` to `winnow-postgres` — the **dev** container
name — while under `docker-compose.prod.yml` the container is `winnow-postgres-1`.

The problem is not that the default is wrong. It is that **the script does not fail when it
is wrong.** Run on a host that has a dev container, it backs that up instead, prints "Wrote
20K", exits 0, and says nothing. Both were run side by side here and produced dumps of
different sizes from different databases, one of them silently the wrong one. You would find
out during a restore.

If dev and prod ever share a host — which is exactly what is being contemplated — pass
`WINNOW_DB_CONTAINER` explicitly every time, and consider making the script require it
rather than guess. A backup tool that quietly backs up the wrong database is worse than one
that refuses to run.

A backup script is not a backup until a restore has been proven. Do the drill in
`backup-restore.md` on this machine, not on the laptop.

## What Claude Code can and cannot do here

**Can:** clone, write `.env` scaffolding without secrets, run every `docker compose` and
`pnpm` command, read logs and diagnose failures, edit the compose file for step 4 and put it
back, run the verification checks it can reach from the desktop, and fix this runbook.

**Cannot, and should not attempt:** any of §0 — installing WSL2 or Docker Engine, editing
`/etc/wsl.conf`, or creating the Task Scheduler entry, all of which need elevation on your
machine; install or sign into Tailscale; toggle MagicDNS or HTTPS in the admin console; type
any password, `AUTH_SECRET` or `SEED_USER_PASSWORD`; or confirm the from-outside-the-tailnet
check, which by definition needs a device that is not on it.
