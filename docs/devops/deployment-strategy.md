# ReliefLink — Zero-Downtime Deployment Architecture

## 1. Deployment Principles for Humanitarian Emergency Infrastructure

During active regional emergencies (such as seasonal floods or droughts in Tigray), response operations cannot tolerate deployment downtime or dropped citizen connections.

ReliefLink implements a **Zero-Downtime Blue-Green / Rolling Deployment Strategy**.

---

## 2. Blue-Green Deployment Architecture

```
                       +-------------------+
                       |  Nginx Ingress /  |
                       | Cloudflare Proxy  |
                       +---------+---------+
                                 |
                     (Router / Upstream Switch)
                                 |
                 +---------------+---------------+
                 |                               |
       [Active (Blue)]                 [Idle / New (Green)]
      +-----------------+             +-----------------+
      | API (v1.0.0)    |             | API (v1.1.0)    |
      | Web (v1.0.0)    |             | Web (v1.1.0)    |
      +--------+--------+             +--------+--------+
               |                               |
               +---------------+---------------+
                               |
                   +-----------+-----------+
                   |  Shared PostGIS &     |
                   |  Redis Infrastructure |
                   +-----------------------+
```

### Steps for Blue-Green Deployment:
1. **Deploy New Version to Green Cluster**:
   - Build new Docker images tagged with commit SHA.
   - Deploy Green API and Web containers on isolated internal ports.
2. **Execute Forward-Compatible Database Migrations**:
   - Database migrations MUST follow the **Expand and Contract pattern**:
     - *Expand*: Add new nullable columns or tables first.
     - *Deploy Code*: Run code that uses new columns while supporting old ones.
     - *Contract*: Drop deprecated columns in a subsequent non-emergency maintenance window.
3. **Execute Synthetic Health & Smoke Checks**:
   ```bash
   curl -f http://green-api:4000/health/ready
   curl -f http://green-web:3000/
   ```
4. **Traffic Flip**:
   - Reload Nginx upstream configuration via `nginx -s reload` with zero dropped TCP connections:
     ```nginx
     upstream api_upstream {
         server api-green:4000;
     }
     ```
5. **Drain and Standby**:
   - Keep Blue cluster idle for 15 minutes.
   - If error rate increases on Sentry, flip upstream back to Blue immediately.

---

## 3. Rolling Deployments (Kubernetes / Docker Swarm)

For container-orchestrated environments:
- `maxSurge: 25%` (Creates new replica pods before terminating old pods).
- `maxUnavailable: 0` (Zero existing pods killed until new pod passes `/health/ready`).
- Readiness probe delay: `initialDelaySeconds: 10`, `periodSeconds: 5`, `failureThreshold: 3`.
