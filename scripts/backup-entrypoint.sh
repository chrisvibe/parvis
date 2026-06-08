#!/bin/sh
# Long-running backup-sidecar entrypoint. IDENTICAL across all services (DRY).
# Installs dcron, schedules backup.sh per $BACKUP_CRON_SCHEDULE, runs one backup
# immediately at startup (so a fresh deploy produces a dump and surfaces errors now),
# then hands off to crond in the foreground.
set -eu

SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 3 * * *}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
SERVICE_NAME="${SERVICE_NAME:-app}"

echo "[entrypoint] service=${SERVICE_NAME} schedule='${SCHEDULE}' retention=${RETENTION}d"

# dcron isn't in the postgres:*-alpine base image; install it.
echo "[entrypoint] installing dcron..."
apk add --no-cache dcron >/dev/null

# Crontab runs the per-service orchestrator and appends to a log on the backup volume.
echo "${SCHEDULE} /scripts/backup.sh >> /backups/backup.log 2>&1" > /etc/crontabs/root

# Run once now. Guarded so a failed first run still lets crond start and retry on schedule.
echo "[entrypoint] running initial backup..."
/scripts/backup.sh || echo "[entrypoint] WARNING: initial backup failed (see above); crond will retry"

# Run crond in the foreground as a CHILD of this shell (PID 1), not via exec.
# As PID 1, crond is a session leader and its setpgid() call fails with EPERM,
# making it exit immediately -> container restart loop. As a child it's fine.
echo "[entrypoint] starting crond (foreground)..."
crond -f -l 2
