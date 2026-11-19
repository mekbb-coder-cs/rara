import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { auditRepository, InMemoryAuditRepository } from '../../src/repositories/audit.repository.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';
import { HazardType, UrgencyLevel, Role, AuditAction } from '@relieflink/shared';
import { generateAccessToken } from '../../src/utils/crypto.js';

describe('Privacy Filtering & PII Access Protection Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
      reportRepository.clusters.clear();
    }
    if (auditRepository instanceof InMemoryAuditRepository) {
      auditRepository.logs = [];
    }
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
    }
  });

  it('should obfuscate GPS coordinates and redact phone/name on the public map feed', async () => {
    const rawLat = 25.761742;
    const rawLng = -80.191833;
    const rawPhone = '+13055550199';
    const rawName = 'Vulnerable Resident';
    const rawAddress = '1250 SW 8th St, Apt 3B, Little Havana, Miami, FL 33135';

    // 1. Submit incident with sensitive PII
    const submission = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.MEDICAL,
        description: 'Oxygen concentrator battery failing. Need emergency power.',
        severity: UrgencyLevel.CRITICAL,
        latitude: rawLat,
        longitude: rawLng,
        address: rawAddress,
        contactPhone: rawPhone,
        reporterName: rawName,
        isAnonymous: false,
      });

    expect(submission.status).toBe(201);
    const trackingCode = submission.body.data.trackingCode;
    const reportId = submission.body.data.reportId;

    // 2. Fetch public map feed
    const feedRes = await request(app).get('/api/v1/reports/public-feed');

    expect(feedRes.status).toBe(200);
    expect(feedRes.body.data).toHaveLength(1);
    const feedItem = feedRes.body.data[0];

    // Privacy Assertions:
    // a. Phone number and reporter name MUST NOT be present in feed item
    expect((feedItem as any).reporterPhone).toBeUndefined();
    expect((feedItem as any).reporterName).toBeUndefined();
    expect((feedItem as any).exactAddress).toBeUndefined();

    // b. Exact house number MUST NOT be exposed in approximate location
    expect(feedItem.approximateLocation).not.toContain('Apt 3B');

    // c. Coordinates MUST NOT equal raw GPS down to 6 decimals (jittered/rounded)
    expect(feedItem.latitude).not.toBe(rawLat);
    expect(feedItem.longitude).not.toBe(rawLng);

    // 3. Public tracking lookup by trackingCode
    const trackRes = await request(app).get(`/api/v1/reports/track/${trackingCode}`);
    expect(trackRes.status).toBe(200);
    expect((trackRes.body.data as any).reporterPhone).toBeUndefined();
    expect((trackRes.body.data as any).reporterName).toBeUndefined();

    // 4. Public GET by ID: Unauthenticated guest receives redacted view
    const guestRes = await request(app).get(`/api/v1/reports/${reportId}`);
    expect(guestRes.status).toBe(200);
    expect((guestRes.body.data as any).exactAddress).toBeUndefined();
    expect((guestRes.body.data as any).reporterPhone).toBeUndefined();

    // 5. Authenticated RESPONDER GET by ID:
    // Responder sees unmasked PII, and an immutable READ_PII audit log is recorded!
    const responder = await userRepository.createUser({
      email: 'medic.one@ems.gov',
      passwordHash: 'hash',
      fullName: 'EMS Field Unit 1',
      role: Role.RESPONDER,
    });

    const token = generateAccessToken({
      userId: responder.id,
      role: Role.RESPONDER,
      isVerifiedResponder: true,
      assignedRegionIds: [],
    });

    const responderRes = await request(app)
      .get(`/api/v1/reports/${reportId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(responderRes.status).toBe(200);
    // Unmasked for medical emergency dispatch
    expect(responderRes.body.data.exactAddress).toBe(rawAddress);
    expect(responderRes.body.data.reporterPhone).toBe(rawPhone);

    // Verify audit log entry was created
    const logs = await auditRepository.getLogs();
    const piiLog = logs.find((l) => l.action === AuditAction.READ_PII);
    expect(piiLog).toBeDefined();
    expect(piiLog?.userId).toBe(responder.id);
    expect(piiLog?.entityId).toBe(reportId);
    expect((piiLog?.metadata as any)?.accessedFields).toContain('exactAddress');
  });
});
