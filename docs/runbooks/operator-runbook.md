# ReliefLink — Operator Runbook: "What To Do If X Fails"

This operational runbook provides clear, step-by-step procedures for systems operators and emergency dispatch engineers when critical infrastructure components fail during disaster response operations.

---

## 1. Database Failure or PostGIS Outage

### Symptoms:
- Readiness probe returns `503 Service Unavailable`: `checks.database.status = "DOWN"`.
- Error logs indicate `Can't reach database server at localhost:5432`.

### Immediate Actions:
1. **Check Database Container Status**:
   ```bash
   docker ps -a | grep postgres
   docker logs --tail 100 relieflink-postgres
   ```
2. **Restart PostGIS Service**:
   ```bash
   docker compose -f infra/docker/docker-compose.yml restart postgres
   ```
3. **If Database Storage Is Corrupted**:
   - Follow the disaster recovery restore procedure:
     ```bash
     ./infra/scripts/restore-db.sh /var/backups/relieflink/relieflink_backup_latest.sql.gz
     ```
4. **Verify Health Endpoint**:
   ```bash
   curl -i http://localhost:4000/api/v1/health/ready
   ```

---

## 2. Redis Cache & Queue Failure

### Symptoms:
- Readiness probe returns `status: "DEGRADED"` with message `Running in memory fallback`.
- Redis connection warnings in Pino logs.

### Operational Impact:
- **Zero Downtime**: The system is architected with an automatic, transparent fallback to `inMemoryCache`.
- Reports, priority scores, and triage continue working seamlessly.

### Resolution Steps:
1. **Inspect Redis Container**:
   ```bash
   docker logs --tail 50 relieflink-redis
   ```
2. **Restart Redis**:
   ```bash
   docker compose -f infra/docker/docker-compose.yml restart redis
   ```
3. **Check Memory Utilization**:
   ```bash
   redis-cli info memory
   ```
   If memory is saturated, flush volatile keys:
   ```bash
   redis-cli memory purge
   ```

---

## 3. Sudden Traffic Surge & Ingestion Backpressure

### Symptoms:
- Submissions return HTTP `202 Accepted` with `status: "QUEUED"`.
- Ingestion queue length increases above 500 items.

### Expected Behavior:
- The system automatically absorbs the surge without crashing or dropping citizen reports.

### Resolution Steps:
1. **Inspect Active Workers & Memory**:
   - Check Node.js heap in logs: `process.memoryUsage()`.
2. **Scale Out API Replicas (if using Docker Swarm / Kubernetes)**:
   ```bash
   docker compose up -d --scale api=4
   ```
3. **Check Degraded Mode Flag**:
   - If memory pressure is critical, verify non-essential features (live map animation, chat typing indicators) are paused while triage intake remains 100% active.

---

## 4. SMS Gateway (Africa's Talking / Sandbox) Failure

### Symptoms:
- Pino logs report `SMS delivery attempt failed: Gateway timeout`.
- Responders report not receiving SMS dispatch alerts.

### Operational Impact:
- BullMQ notification worker automatically retries with exponential backoff (up to 3 attempts).
- In-app real-time Socket.IO and web push notifications are unaffected.

### Resolution Steps:
1. **Check Gateway Sandbox Credentials**:
   - Verify `AFRICASTALKING_API_KEY` and `AFRICASTALKING_USERNAME` in environment.
2. **Switch Responders to Push & In-App**:
   - Broadcast emergency notice instructing all field teams to keep the web application open on mobile browsers for direct WebSocket push alerts.

---

## 5. Total Regional Cellular / Fiber Cut in Tigray

### Symptoms:
- API server receives no incoming traffic from specific woredas (e.g., Shire or Adigrat).

### Resolution Steps:
1. **Activate Offline PWA Mode**:
   - Inform field teams via satellite radio that the PWA operates autonomously in offline mode.
   - All reports and aid distributions are queued locally in browser IndexedDB.
2. **Replay on Link Recovery**:
   - When satellite van or mobile generator powers local cellular towers, devices automatically flush and sync stored reports to `/api/v1/reports/offline-sync`.
