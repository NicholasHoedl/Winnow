#!/usr/bin/env bash
# Restore a Winnow backup (.sql.gz produced by backup.sh) into a Postgres database.
# Usage: scripts/restore.sh <backup-file.sql.gz> [target_db]
# The dump was taken with --clean --if-exists, so it drops and recreates objects.
set -euo pipefail

file="${1:?Usage: restore.sh <backup.sql.gz> [target_db]}"
CONTAINER="${WINNOW_DB_CONTAINER:-winnow-postgres}"
DB_USER="${POSTGRES_USER:-winnow}"
TARGET_DB="${2:-${POSTGRES_DB:-winnow}}"

if [ ! -f "$file" ]; then
  echo "Backup file not found: $file" >&2
  exit 1
fi

echo "Restoring '$file' → database '$TARGET_DB' (container '$CONTAINER')"
gunzip -c "$file" \
  | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q
echo "Restore complete."
