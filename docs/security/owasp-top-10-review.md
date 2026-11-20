# ReliefLink — OWASP Top 10 Security Architecture Review

This document provides a comprehensive security review of **ReliefLink** against the **OWASP Top 10 (2021)** security risks, mapping each vulnerability category to its code implementation, defensive controls, and automated verification tests.

---

## OWASP Top 10 Vulnerability Matrix

| OWASP Risk | Threat Description | ReliefLink Defensive Implementation | Code Location | Verification Tests |
| :--- | :--- | :--- | :--- | :--- |
| **A01: Broken Access Control** | Unauthorized privilege escalation, horizontal data leaks across tenants or regions. | Role-Based Access Control (`CIVILIAN`, `RESPONDER`, `COORDINATOR`, `ADMIN`). Jurisdiction-scoped queries (`regionRepository`), report locking mechanisms preventing concurrent responder collisions. | `apps/api/src/middleware/auth.ts`<br>`apps/api/src/services/rbac.service.ts`<br>`apps/api/src/repositories/report.repository.ts` | `role-authorization.test.ts`<br>`rbac.test.ts`<br>`region-scoped.test.ts` |
| **A02: Cryptographic Failures** | Exposure of sensitive citizen PII in transit or at rest. | Passwords hashed using memory-hard Argon2id. Citizen PII (phone number, exact street address) encrypted using authenticated AES-256-GCM. HTTPS enforced with 1-year HSTS (`includeSubDomains`, `preload`). | `apps/api/src/utils/encryption.ts`<br>`apps/api/src/utils/tokens.ts`<br>`apps/api/src/middleware/security.ts` | `tokens.test.ts`<br>`retention-job.test.ts` |
| **A03: Injection** | SQL, NoSQL, OS Command, or HTML injection. | Zero raw SQL string concatenation. All database queries use Prisma parameterized prepared statements and PostGIS functions (`ST_SetSRID`, `ST_MakePoint`). Strict Zod schema validation on all inputs. Recursive XSS sanitization of all incoming strings. | `packages/shared/src/schemas/*`<br>`apps/api/src/middleware/sanitize.ts`<br>`apps/api/src/repositories/prisma-report.repository.ts` | `offline-sync.test.ts`<br>`idempotency.test.ts` |
| **A04: Insecure Design** | Architectural flaws, bot spam floods during disaster distress. | Hidden honeypot fields silently trapping spam bots without alerting them. Client-side report deduplication. Idempotency keys (`Idempotency-Key` header) prevent duplicate network retry double-posts. Standard rate limiting per IP. | `apps/web/src/components/report/ReportWizard.tsx`<br>`apps/api/src/middleware/rateLimiter.ts`<br>`apps/api/src/repositories/idempotency.repository.ts` | `abuse-protection.test.ts`<br>`idempotency.test.ts` |
| **A05: Security Misconfiguration** | Missing security headers, exposed stack traces, default passwords. | Hardened Helmet configuration (CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Cross-Origin-Resource-Policy). Detailed error stack traces disabled in production. Secrets loaded via validated Zod environment schema. | `apps/api/src/middleware/security.ts`<br>`apps/api/src/config/env.ts`<br>`apps/api/src/middleware/errorHandler.ts` | `health.test.ts`<br>`Next.js production build` |
| **A06: Vulnerable and Outdated Components** | Known CVEs in npm dependencies. | Strict lockfile enforcement (`pnpm-lock.yaml`). Automated dependency security audits via `pnpm audit` integrated into GitHub Actions CI pipeline. | `pnpm-lock.yaml`<br>`.github/workflows/ci.yml` | `pnpm audit` |
| **A07: Identification & Authentication Failures** | Credential stuffing, brute force, session hijacking. | Stateless short-lived JWT access tokens (15m) paired with httpOnly, Secure, SameSite=Strict refresh cookies. Automatic refresh token rotation with token family reuse detection (immediate revocation of all active sessions if stolen token is reused). | `apps/api/src/utils/tokens.ts`<br>`apps/api/src/controllers/auth.controller.ts`<br>`apps/api/src/repositories/refresh-token.repository.ts` | `auth.test.ts` |
| **A08: Software & Data Integrity Failures** | Malicious file uploads, tampered updates, double allocation. | Client-side Canvas photo compression strips EXIF metadata (preventing GPS tracking leaks). Strict 2MB payload limits. Optimistic locking with incremented `version` column prevents race conditions / double inventory allocation. | `apps/web/src/lib/imageCompression.ts`<br>`apps/api/src/services/matching.service.ts`<br>`apps/api/src/repositories/offer.repository.ts` | `concurrency-double-allocation.test.ts`<br>`concurrency.test.ts` |
| **A09: Security Logging & Monitoring Failures** | Undetected breaches, lack of auditability. | Structured JSON logging with Pino. Automatic redaction of `authorization`, `cookie`, and password fields. Immutable audit trail logging actor, action, before snapshot, and after snapshot on all administrative changes. | `apps/api/src/config/logger.ts`<br>`apps/api/src/services/audit.service.ts`<br>`apps/api/src/repositories/audit.repository.ts` | `export-correctness.test.ts`<br>`role-authorization.test.ts` |
| **A10: Server-Side Request Forgery (SSRF)** | Exploiting backend webhook or external fetch requests to probe internal VPC or cloud metadata endpoints. | Dedicated SSRF validator (`validateSafeExternalUrl`) performs DNS resolution checks prior to outgoing requests, strictly rejecting RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), loopback (127.0.0.1, ::1), and cloud metadata IPs (169.254.169.254). | `apps/api/src/utils/ssrf.ts`<br>`apps/api/src/services/notification.service.ts` | `notification-retry.test.ts` |

---

## Disaster-Specific Safety Architecture

1. **Life-Threatening Emergency Notice**
   - Every public screen, API root (`/`), and report submission flow clearly states:
     > *"For life-threatening emergencies, call your local emergency number immediately. ReliefLink is a community coordination platform and does not replace official emergency services."*
2. **Citizen Anonymity & Data Minimization**
   - Reports can be submitted completely anonymously without account creation or phone numbers.
   - GPS locations are stored with PostGIS point accuracy for responders, but the public feed masks coordinates to 1km fuzzy centroids.
3. **Emergency Retention Anonymization**
   - An automated compliance job scrubs reporter names, addresses, and phone numbers after 30 days of case closure.
