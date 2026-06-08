#!/bin/sh
# Postgres backup -> custom-format dump (.dump), portable + restorable with pg_restore.
# Standardized across services via SERVICE_NAME. Runs inside the postgres:* backup sidecar
# (or anywhere with pg_dump). Configured entirely by environment variables.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
SERVICE_NAME="${SERVICE_NAME:-parvis}"
PGHOST="${POSTGRES_HOST:-db}"
PGPORT="${POSTGRES_PORT:-5432}"
PGDATABASE="${POSTGRES_DB:-parvis}"
PGUSER="${POSTGRES_USER:-parvis}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/${SERVICE_NAME}_db_${TIMESTAMP}.dump"

log "Backing up '${PGDATABASE}' from ${PGHOST}:${PGPORT} -> ${BACKUP_FILE}"

# Write to a .tmp first, then atomically rename. A crashed/partial dump never gets the
# final name, so it can't masquerade as a good backup nor be picked up by restore.
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
        --format=custom --file="${BACKUP_FILE}.tmp"
mv "${BACKUP_FILE}.tmp" "$BACKUP_FILE"

log "Backup OK: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"

# Retention: delete dumps older than N days (only fully-named .dump files qualify).
DELETED=$(find "$BACKUP_DIR" -name "${SERVICE_NAME}_db_*.dump" -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
REMAINING=$(find "$BACKUP_DIR" -name "${SERVICE_NAME}_db_*.dump" -type f | wc -l)
log "Retention ${RETENTION_DAYS}d: pruned ${DELETED}, ${REMAINING} backup(s) remain"
