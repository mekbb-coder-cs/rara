import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { HazardType, UrgencyLevel } from '@relieflink/shared';

describe('Idempotent Report Submission Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
      reportRepository.idempotencyStore.clear();
    }
  });

  it('should return identical cached response when Idempotency-Key is repeated, without creating extra reports', async () => {
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

    const payload = {
      type: HazardType.MEDICAL,
      description: 'Diabetic patient trapped without insulin after storm destroyed road.',
      severity: UrgencyLevel.HIGH,
      latitude: 25.7617,
      longitude: -80.1918,
      address: '450 Brickell Ave, Miami, FL',
      peopleAffectedCount: 1,
    };

    // 1. Initial attempt
    const firstRes = await request(app)
      .post('/api/v1/reports')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.success).toBe(true);
    const trackingCode1 = firstRes.body.data.trackingCode;
    const reportId1 = firstRes.body.data.reportId;

    // 2. Client loses connection and retries the exact same submission with same Idempotency-Key
    const retryRes = await request(app)
      .post('/api/v1/reports')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(retryRes.status).toBe(201);
    expect(retryRes.body.data.trackingCode).toBe(trackingCode1);
    expect(retryRes.body.data.reportId).toBe(reportId1);

    // 3. Verify exactly one report exists in the repository
    if (reportRepository instanceof InMemoryReportRepository) {
      expect(reportRepository.reports.size).toBe(1);
    }
  });
});
