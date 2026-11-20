# ReliefLink — Humanitarian Crisis Response & Aid Coordination Platform

> **Emergency Disclaimer**: ReliefLink is an open community crisis coordination platform designed for humanitarian assistance during natural and civil disasters. For life-threatening emergencies, citizens should contact official regional emergency services immediately.

ReliefLink is customized for the **Tigray region of Ethiopia** (Mekelle, Shire Inda Selassie, Adigrat, Axum) with multilingual support in **English, ትግርኛ (Tigrigna), and አማርኛ (Amharic)**.

---

## Key Capabilities

- **Offline-First Citizen Reporting**: Mobile-optimized 4-step wizard with client-side image compression, GPS/manual geotagging, honeypot anti-spam, and IndexedDB queuing for zero data loss during cellular blackouts.
- **Automated Duplicate Clustering**: PostGIS spatial clustering (500m radius, 60m time window) merging duplicate reports into corroborating incident clusters.
- **Dynamic Priority Scoring**: Formula-weighted prioritization based on hazard severity, population affected, trapped vulnerable groups, and waiting stall time.
- **Aid Supply & Inventory Matching**: PostGIS proximity ranking matching verified needs to approved NGO supplies with transactional stock reservation (zero double allocation).
- **End-to-End Task Coordination**: Real-time task lifecycles (`ASSIGNED`, `EN_ROUTE`, `ON_SITE`, `DONE`), volunteer GPS tracking, case chat, and area-wide emergency broadcast advisories.
- **Operational Analytics & Governance**: Real-time SLA metrics, unmet needs by woreda, responder workload tables, incident heat maps, After-Action Reports (AAR), and full GDPR privacy compliance (data retention auto-anonymization).

---

## Architecture Overview

```mermaid
flowchart TD
    Client["Citizen / Responder / Coordinator Web App (Next.js 15 PWA)"]
    Nginx["Nginx Reverse Proxy (SSL / Rate Limiting / WebSocket)"]
    API["ReliefLink Express API (Node.js 20)"]
    PostGIS[("PostgreSQL 16 + PostGIS")]
    Redis[("Redis 7 (Cache & BullMQ)")]
    Mailpit["Mailpit / Africa's Talking SMS Sandbox"]

    Client -->|HTTPS / WSS| Nginx
    Nginx -->|Port 3000| Client
    Nginx -->|Port 4000| API
    API -->|Prisma ORM & Spatial Queries| PostGIS
    API -->|Aggregates Cache & SLA Timers| Redis
    API -->|Email & SMS Dispatch| Mailpit
```

---

## Single-Command Production Startup

To launch the complete production stack (PostGIS, Redis, API, Next.js Web, Nginx reverse proxy with HTTPS):

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### Development Startup

1. **Install Dependencies**:
   ```bash
   pnpm install
   pnpm --filter @relieflink/shared build
   ```

2. **Start Local Database & Services**:
   ```bash
   docker compose -f infra/docker/docker-compose.yml up -d
   ```

3. **Run API & Web in Parallel**:
   ```bash
   pnpm dev
   ```

---

## Port Allocation Matrix

| Service | Port | Description |
| :--- | :--- | :--- |
| **Nginx HTTPS** | `443` | Production Public Ingress (SSL / TLS) |
| **Nginx HTTP** | `80` | Automatic redirect to HTTPS |
| **Web Frontend** | `3000` | Next.js 15 PWA application |
| **API Backend** | `4000` | Express REST API & Socket.IO server |
| **PostgreSQL** | `5432` | PostGIS spatial database |
| **Redis** | `6379` | Cache, queues & session store |
| **Mailpit Web** | `8025` | Local SMTP sandbox web viewer |
| **Mailpit SMTP** | `1025` | Local email sandbox server |

---

## Environment Variables Configuration

Copy `.env.example` to `.env`:

```ini
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://relieflink:relieflink_secret@localhost:5432/relieflink?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=super_secure_jwt_secret_key_at_least_32_characters_long
JWT_REFRESH_SECRET=super_secure_refresh_secret_key_at_least_32_characters
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
CLIENT_URL=http://localhost:3000
LOG_LEVEL=info
```

---

## Test Suites & Verification Commands

```bash
# Run all backend unit, integration, and security tests (27 test files, 99 tests)
pnpm --filter @relieflink/api test

# Run frontend unit tests
pnpm --filter @relieflink/web test

# Run all Playwright End-to-End browser tests
pnpm --filter @relieflink/web test:e2e

# Run Disaster Load Simulation Benchmark (5,000 reports/hour, 1,000 map queries)
pnpm tsx tests/load/run-disaster-load-test.ts

# Run Full 12-Hour Disaster Simulation Drill & Generate AAR
pnpm tsx scripts/run-disaster-simulation.ts
```
