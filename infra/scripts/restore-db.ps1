# ==============================================================================
# ReliefLink Database Restore Script (PowerShell)
# ==============================================================================
param (
  [Parameter(Mandatory=$true)]
  [string]$BackupFile,
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432,
  [string]$DbUser = "relieflink",
  [string]$DbPassword = "relieflink_secret",
  [string]$DbName = "relieflink"
)

if (!(Test-Path -Path $BackupFile)) {
  Write-Error "Backup file not found at $BackupFile"
  exit 1
}

$env:PGPASSWORD = $DbPassword
Write-Host "Restoring $DbName from $BackupFile..."

if (Get-Command psql -ErrorAction SilentlyContinue) {
  Get-Content $BackupFile | psql -h $DbHost -p $DbPort -U $DbUser -d $DbName
  psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "SELECT count(*) AS total_reports FROM \"Report\";"
} else {
  Get-Content $BackupFile | docker exec -i relieflink-postgres psql -U $DbUser -d $DbName
  docker exec relieflink-postgres psql -U $DbUser -d $DbName -c "SELECT count(*) AS total_reports FROM \"Report\";"
}

Write-Host "Database restore and verification complete."
