#!/bin/sh
# Restore a custom-format (.dump) backup produced by backup_db.sh.
# Strategy: validate the dump, kill connections, drop+recreate an empty DB, pg_restore into it.
# A fresh DB avoids leftover objects that an in-place --clean restore can miss.
#
# Usage: restore_db.sh <backup_file.dump>
#   Set FORCE=1 (or pass --force) to skip the interactive confirmation (for automated tests).
set -eu

BACKUP_FILE="${1:-}"
FORCE="${FORCE:-0}"
[ "${2:-}" = "--force" ] && FORCE=1

PGHOST="${POSTGRES_HOST:-db}"
PGPORT="${POSTGRES_PORT:-5432}"
PGDATABASE="${POSTGRES_DB:-parvis}"
PGUSER="${POSTGRES_USER:-parvis}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
psql_postgres() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 "$@"; }

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.dump>"
    echo "Available backups:"
    ls -lh "${BACKUP_DIR:-/backups}/${SERVICE_NAME:-parvis}_db_"*.dump 2>/dev/null || echo "  (none found)"
    exit 1
fi
[ -f "$BACKUP_FILE" ] || { echo "ERROR: not found: $BACKUP_FILE"; exit 1; }

# Fail fast if the dump is corrupt/truncated BEFORE we drop anything.
if ! pg_restore --list "$BACKUP_FILE" >/dev/null 2>&1; then
    echo "ERROR: '$BACKUP_FILE' is not a valid custom-format dump (corrupt or truncated)."
    exit 1
fi

echo "=========================================="
echo " RESTORE  ${PGDATABASE} @ ${PGHOST}:${PGPORT}"
echo " from     ${BACKUP_FILE}"
echo "=========================================="
if [ "$FORCE" != "1" ]; then
    echo "WARNING: this COMPLETELY REPLACES database '${PGDATABASE}'."
    printf "Type 'yes' to proceed: "
    read -r CONFIRM
    [ "$CONFIRM" = "yes" ] || { echo "Cancelled."; exit 0; }
fi

log "Terminating active connections to '${PGDATABASE}'..."
psql_postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${PGDATABASE}' AND pid <> pg_backend_pid();" >/dev/null

log "Dropping and recreating '${PGDATABASE}'..."
psql_postgres -c "DROP DATABASE IF EXISTS \"${PGDATABASE}\";"
psql_postgres -c "CREATE DATABASE \"${PGDATABASE}\" OWNER \"${PGUSER}\";"

log "Restoring..."
# --no-owner/--no-privileges: roles may differ between environments (e.g. the test copy);
# objects are recreated owned by the connecting user instead of failing on missing roles.
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
           --no-owner --no-privileges "$BACKUP_FILE"

log "Restore complete. Restart the backend to refresh connections."
