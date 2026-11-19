import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Health & System Probes Integration Tests', () => {
  const app = createApp();

  it('GET /health/live - should report liveness 200 UP', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.uptime).toBeTypeOf('number');
  });

  it('GET /api/v1/health/ready - should report readiness and dependency checks', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.database.status).toBe('UP');
    expect(res.body.checks.redis).toBeDefined();
  });

  it('GET / - should display emergency notice disclaimer', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.notice).toContain('For life-threatening emergencies, call your local emergency number immediately.');
    expect(res.body.notice).toContain('ReliefLink does not replace official emergency services.');
  });
});
