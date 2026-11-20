# ReliefLink — Disaster Recovery & Business Continuity Plan (BCP)

## 1. Objectives & SLA Targets

During severe physical or technological catastrophes affecting primary infrastructure:
- **Recovery Time Objective (RTO)**: **< 15 minutes** (Time to restore full operational triage and citizen reporting capabilities).
- **Recovery Point Objective (RPO)**: **< 1 hour** (Maximum permissible data loss window in extreme catastrophic events).

---

## 2. Backup Architecture & Cadence

1. **Automated WAL & Snapshot Cadence**:
   - **Full Daily Snapshot**: Daily at `02:00 UTC` via `infra/scripts/backup-db.sh`, compressed with gzip, retained for 14 days locally and mirrored to off-site S3/GCS immutable bucket with Object Lock.
   - **Continuous WAL Archiving**: Point-in-time recovery (PITR) enabled via PostgreSQL Write-Ahead Logs (`archive_mode = on`).
   - **Redis Persistence**: AOF (Append Only File) configured with `fsync everysec` for transient queues and cache recovery.

2. **Automated Backup Verification**:
   - Weekly automated restoration test drills running `restore-db.sh` into an isolated staging container, validating database schema integrity and table counts (`Report`, `AidNeed`, `AidOffer`, `Task`).

---

## 3. Catastrophic Failure Scenarios & Recovery Procedures

### Scenario A: Primary Database Corruption or Host Loss
1. **Declare Disaster**: Lead DevOps / Infrastructure Coordinator triggers DR protocol.
2. **Spin Up Standby PostGIS Container**:
   ```bash
   docker compose -f infra/docker/docker-compose.yml up -d postgres
   ```
3. **Execute Database Restore**:
   ```bash
   ./infra/scripts/restore-db.sh /var/backups/relieflink/relieflink_backup_latest.sql.gz
   ```
4. **Run Database Migrations & Validation**:
   ```bash
   pnpm --filter @relieflink/api db:migrate:deploy
   curl -f http://localhost:4000/api/v1/health/ready
   ```

### Scenario B: Complete Regional Internet / Cellular Blackout in Tigray
1. **Client-Side Autonomous Operation**:
   - Web application functions offline as an installed PWA.
   - Citizens and field volunteers continue logging emergency reports and aid handovers into browser IndexedDB.
2. **Offline Queuing with Zero Loss**:
   - Each offline ticket generates an immediate deterministic client tracking code (`RL-OFFLINE-UUID`).
3. **Restoration & Batch Replay**:
   - When satellite link or intermittent 3G returns, Service Worker triggers `/reports/offline-sync` background sync without human intervention.
   - `Idempotency-Key` headers prevent duplicated submissions.

### Scenario C: Cloud Provider Zone Outage
1. **DNS Failover**: Update Route53 / Cloudflare GeoDNS health checks to point public domain to secondary region warm standby cluster.
2. **Secrets & Environment**: Deploy with mirrored `.env.production` managed in GitHub Secrets or HashiCorp Vault.

---

## 4. Emergency Contacts & Escalation Matrix

| Role | Responsibility | Escalation Channel |
| :--- | :--- | :--- |
| **Incident Commander** | Declares DR state & coordinates agencies | RedPhone / Signal Group |
| **Lead DevOps Engineer** | Database restoration & DNS failover | Signal / PagerDuty |
| **Field Logistics Lead** | Responders alert & SMS broadcast | Satellite Phone / SMS Gateway |
