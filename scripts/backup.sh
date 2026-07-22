#!/usr/bin/env bash
# Timestamped logical backup of the Winnow Postgres database.
# Runs pg_dump inside the DB container and writes a gzipped .sql to the host
# (outside the Docker volume, so a volume loss doesn't take the backups with it).
# Schedule on the host via cron or a systemd timer (see docs/runbooks/backup-restore.md).
set -euo pipefail

CONTAINER="${WINNOW_DB_CONTAINER:-winnow-postgres}"
DB_USER="${POSTGRES_USER:-winnow}"
DB_NAME="${POSTGRES_DB:-winnow}"
BACKUP_DIR="${WINNOW_BACKUP_DIR:-./backups}"
RETENTION_DAYS="${WINNOW_BACKUP_RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
outfile="$BACKUP_DIR/winnow-$stamp.sql.gz"

echo "Backing up '$DB_NAME' from container '$CONTAINER' → $outfile"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip >"$outfile"

echo "Wrote $(du -h "$outfile" | cut -f1) → $outfile"

# Prune backups older than the retention window.
find "$BACKUP_DIR" -name 'winnow-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
echo "Done (retention ${RETENTION_DAYS}d)."
