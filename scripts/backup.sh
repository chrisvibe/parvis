#!/bin/sh
# Per-service backup orchestrator. parvis has a single Postgres DB, so this just
# delegates to backup_db.sh. (Multi-store services, e.g. matrix, call several workers
# here.) Kept as a separate file so the entrypoint/cron line is identical everywhere.
set -eu
exec /scripts/backup_db.sh
