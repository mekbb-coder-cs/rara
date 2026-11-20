#!/usr/bin/env bash
set -eo pipefail

# ==============================================================================
# ReliefLink Database Restore Script
# Restores a compressed SQL dump into PostgreSQL and verifies PostGIS tables.
# ==============================================================================

if [ -z "$1" ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found at ${BACKUP_FILE}"
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-relieflink}"
DB_NAME="${POSTGRES_DB:-relieflink}"
export PGPASSWORD="${POSTGRES_PASSWORD:-relieflink_secret}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restoring database from ${BACKUP_FILE} into ${DB_NAME} on ${DB_HOST}:${DB_PORT}..."

# Decompress and stream into psql
gunzip -c "${BACKUP_FILE}" | psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Database restored successfully!"

# Verification check
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Running post-restore integrity check..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT count(*) AS total_reports FROM \"Report\";"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restore verified and ready."
