#!/bin/bash
# Automated database backup script for Parvis
# This script:
# 1. Creates a timestamped SQL dump of the PostgreSQL database
# 2. Removes backups older than the retention period
# 3. Logs all operations

set -e

# Load configuration from environment variables (with defaults)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
POSTGRES_DB="${POSTGRES_DB:-parvis}"
POSTGRES_USER="${POSTGRES_USER:-parvis}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# Generate timestamp for backup filename
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/parvis_backup_${TIMESTAMP}.sql"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting database backup..."

# Create backup using pg_dump
export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dump -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > "${BACKUP_FILE}"

# Check if backup was successful
if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup successful: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Backup failed!"
    exit 1
fi

# Remove old backups (keep only last N days)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning up old backups (retention: ${BACKUP_RETENTION_DAYS} days)..."
find "${BACKUP_DIR}" -name "parvis_backup_*.sql" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete

# Count remaining backups
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "parvis_backup_*.sql" -type f | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete. Total backups: ${BACKUP_COUNT}"
