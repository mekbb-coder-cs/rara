#!/usr/bin/env bash
set -eo pipefail

# ==============================================================================
# ReliefLink Database Automated Backup Script
# Performs pg_dump with PostGIS geometry, compressed with gzip and timestamped.
# ==============================================================================

BACKUP_DIR="${BACKUP_DIR:-/var/backups/relieflink}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/relieflink_backup_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# Database credentials
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-relieflink}"
DB_NAME="${POSTGRES_DB:-relieflink}"
export PGPASSWORD="${POSTGRES_PASSWORD:-relieflink_secret}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting automated backup for ${DB_NAME} on ${DB_HOST}:${DB_PORT}..."

# Execute pg_dump with custom clean and gzip compression
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges | gzip > "${BACKUP_FILE}"

# Verify backup size
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup successful! Saved to: ${BACKUP_FILE} (Size: ${BACKUP_SIZE})"

# Prune old backups exceeding retention window
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "relieflink_backup_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup and rotation complete."
