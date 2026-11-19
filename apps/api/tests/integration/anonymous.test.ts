import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Anonymous Tracking Token Integration Tests', () => {
  const app = createApp();

  it('POST /api/v1/anonymous/tracking-token - should issue signed tracking token', async () => {
    const reportId = '550e8400-e29b-41d4-a716-446655440000';
    const trackingCode = 'RL-7749-FL';

    const res = await request(app)
      .post('/api/v1/anonymous/tracking-token')
      .send({ reportId, trackingCode });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.expiresIn).toBe('24h');

    // Verify token with verify endpoint
    const verifyRes = await request(app)
      .get('/api/v1/anonymous/verify-token')
      .set('X-Tracking-Token', res.body.data.token);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.reportId).toBe(reportId);
    expect(verifyRes.body.data.trackingCode).toBe(trackingCode);
    expect(verifyRes.body.data.tokenType).toBe('ANONYMOUS_REPORT_TRACKING');
  });

  it('GET /api/v1/anonymous/verify-token - should reject invalid or forged token', async () => {
    const res = await request(app)
      .get('/api/v1/anonymous/verify-token')
      .set('X-Tracking-Token', 'invalid.token.string');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
