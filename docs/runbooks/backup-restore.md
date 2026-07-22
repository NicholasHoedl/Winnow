# Runbook — Backup & Restore

Winnow's data lives in one Postgres database. Backups are **logical dumps**
(`pg_dump`) taken from inside the DB container and written, gzipped, to the host
**outside** the Docker volume — so losing the volume doesn't lose the backups.

> Status: the backup+restore round-trip has been **proven locally** (dump →
> restore into a fresh database → data verified). Re-run the drill on the home
> server after the 0.4 deploy.

## Scripts

- `scripts/backup.sh` — dump `winnow` → `./backups/winnow-<timestamp>.sql.gz`,
  then prune dumps older than the retention window.
- `scripts/restore.sh <file.sql.gz> [target_db]` — restore a dump into a database
  (defaults to `winnow`). Dumps use `--clean --if-exists`, so they drop and
  recreate objects.

Both are configurable via env vars (defaults in brackets):
`WINNOW_DB_CONTAINER` [`winnow-postgres`], `POSTGRES_USER` [`winnow`],
`POSTGRES_DB` [`winnow`], `WINNOW_BACKUP_DIR` [`./backups`],
`WINNOW_BACKUP_RETENTION_DAYS` [`30`].

## Take a backup (manual)

```bash
bash scripts/backup.sh
```

## Schedule it (home server)

**cron** — daily at 02:30, from the deploy directory:

```cron
30 2 * * * cd /srv/winnow && WINNOW_DB_CONTAINER=winnow-postgres-1 bash scripts/backup.sh >> /var/log/winnow-backup.log 2>&1
```

(The compose service is `postgres`; find the real container name with
`docker compose -f docker-compose.prod.yml ps`.)

**systemd timer** — `/etc/systemd/system/winnow-backup.service` +
`winnow-backup.timer` (`OnCalendar=*-*-* 02:30:00`, `Persistent=true`) running the
same command; `systemctl enable --now winnow-backup.timer`.

## Restore

Into the live database (overwrites current data):

```bash
bash scripts/restore.sh backups/winnow-20260722-121332.sql.gz
```

## Verify a backup actually restores (do this periodically)

"We have a backup script" does not count until a restore has been proven. The drill:

```bash
# 1. restore the latest dump into a throwaway database
LATEST=$(ls -t backups/winnow-*.sql.gz | head -1)
docker exec winnow-postgres psql -U winnow -d postgres \
  -c "drop database if exists winnow_restore_test;" -c "create database winnow_restore_test;"
bash scripts/restore.sh "$LATEST" winnow_restore_test

# 2. spot-check the data
docker exec winnow-postgres psql -U winnow -d winnow_restore_test \
  -c "select count(*) from users;" -c "select count(*) from events;"

# 3. drop the throwaway database
docker exec winnow-postgres psql -U winnow -d postgres -c "drop database winnow_restore_test;"
```

## Notes

- **Local-only for v1.** Off-site/remote copies are deferred (SPEC open Q#8) — a
  deliberate choice, not an oversight. Consider syncing `./backups` off-box later.
- **Schema migrations** are separate from data backups. After deploying a new
  version with schema changes, run `pnpm db:migrate` against the production
  `DATABASE_URL` (drizzle-kit isn't in the production image — run it from a
  checkout, or a one-off tooling container, pointed at the server DB).
- Keep `.env` (which holds `POSTGRES_PASSWORD` / `AUTH_SECRET`) backed up
  separately and securely — it is **not** in these database dumps.
