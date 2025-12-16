#!/bin/bash
# Database restore script for Parvis
# Usage: ./restore_db.sh <backup_file.sql>
# Example: ./restore_db.sh /backups/parvis_backup_2025-01-15_04-00-00.sql

set -e

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql>"
    echo ""
    echo "Available backups:"
    ls -lh /backups/parvis_backup_*.sql 2>/dev/null || echo "  No backups found in /backups/"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Load configuration from environment variables
POSTGRES_DB="${POSTGRES_DB:-parvis}"
POSTGRES_USER="${POSTGRES_USER:-parvis}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

echo "============================================"
echo "DATABASE RESTORE"
echo "============================================"
echo "Backup file: ${BACKUP_FILE}"
echo "Database:    ${POSTGRES_DB}"
echo "Host:        ${POSTGRES_HOST}"
echo "User:        ${POSTGRES_USER}"
echo "============================================"
echo ""
echo "⚠️  WARNING: This will COMPLETELY REPLACE the current database!"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to proceed): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting database restore..."

# Export password for psql
export PGPASSWORD="${POSTGRES_PASSWORD}"

# Drop existing database and recreate (clean slate)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dropping existing database..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Creating fresh database..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${POSTGRES_DB};"

# Restore from backup
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restoring from backup..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Restore successful!"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ ERROR: Restore failed!"
    exit 1
fi

echo ""
echo "Database has been restored from: ${BACKUP_FILE}"
echo "Please restart the backend service to ensure clean connections."
