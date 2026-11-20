# ==============================================================================
# ReliefLink Database Backup Script (PowerShell)
# ==============================================================================
param (
  [string]$BackupDir = ".\backups",
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432,
  [string]$DbUser = "relieflink",
  [string]$DbPassword = "relieflink_secret",
  [string]$DbName = "relieflink",
  [int]$RetentionDays = 14
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
if (!(Test-Path -Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$backupFile = Join-Path $BackupDir "relieflink_backup_$timestamp.sql"
Write-Host "Starting backup for $DbName to $backupFile..."

$env:PGPASSWORD = $DbPassword

# Run pg_dump or docker exec if running via container
if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
  pg_dump -h $DbHost -p $DbPort -U $DbUser -d $DbName --clean --if-exists > $backupFile
} else {
  docker exec relieflink-postgres pg_dump -U $DbUser -d $DbName --clean --if-exists > $backupFile
}

Write-Host "Backup completed successfully: $backupFile"
