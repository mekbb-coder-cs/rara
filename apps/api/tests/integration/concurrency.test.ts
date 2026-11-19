import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { generateAccessToken } from '../../src/utils/crypto.js';
import { Role, HazardType, UrgencyLevel, VerificationMethod } from '@relieflink/shared';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';

describe('Concurrency & Optimistic Locking Integration Tests', () => {
  const app = createApp();

  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;
  let testReportId: string;

  beforeEach(async () => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
      reportRepository.clusters.clear();
      reportRepository.idempotencyStore.clear();
      reportRepository.verifications.clear();
      reportRepository.priorityScores.clear();
    }
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
      userRepository.userRegions.clear();
    }
    // Create actual responder user records
    userA = await userRepository.createUser({
      email: `responder.a.${Date.now()}.${Math.random()}@relief.org`,
      passwordHash: 'hashA',
      fullName: 'Responder Alpha',
      role: Role.RESPONDER,
    });

    userB = await userRepository.createUser({
      email: `responder.b.${Date.now()}.${Math.random()}@relief.org`,
      passwordHash: 'hashB',
      fullName: 'Responder Beta',
      role: Role.RESPONDER,
    });

    tokenA = generateAccessToken({
      userId: userA.id,
      role: Role.RESPONDER,
      email: userA.email!,
    });

    tokenB = generateAccessToken({
      userId: userB.id,
      role: Role.RESPONDER,
      email: userB.email!,
    });

    // Create fresh report with version 1
    const { report } = await reportRepository.createReport({
      title: 'Structural Emergency',
      description: 'Roof collapse following heavy storms.',
      hazardType: HazardType.FLOOD,
      initialUrgency: UrgencyLevel.HIGH,
      latitude: 25.7617,
      longitude: -80.1918,
      approximateLocation: 'Little Havana, Miami',
      exactAddressEncrypted: '890 SW 8th St, Miami FL',
      peopleAffectedCount: 4,
      vulnerableGroups: ['elderly'],
      isAnonymous: false,
    });
    testReportId = report.id;
  });

  it('prevents double-verification through optimistic locking (version mismatch)', async () => {
    // 1. Both responders see the report at version 1
    const initialReport = await reportRepository.findById(testReportId);
    expect(initialReport?.report.version).toBe(1);

    // 2. Responder A verifies the case first with expectedVersion = 1
    const resA = await request(app)
      .post(`/api/v1/reports/${testReportId}/verify`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        status: 'VERIFIED',
        method: VerificationMethod.PHONE_CALL,
        confidence: 0.9,
        reason: 'Contacted resident via phone, emergency confirmed.',
        expectedVersion: 1,
      });

    expect(resA.status).toBe(200);
    expect(resA.body.success).toBe(true);
    expect(resA.body.data.status).toBe('VERIFIED');
    expect(resA.body.data.version).toBe(2);

    // 3. Responder B tries to verify the same case concurrently with expectedVersion = 1
    const resB = await request(app)
      .post(`/api/v1/reports/${testReportId}/verify`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        status: 'VERIFIED',
        method: VerificationMethod.ON_SITE_VISIT,
        confidence: 1.0,
        reason: 'On-site officer confirmed scene.',
        expectedVersion: 1,
      });

    // 4. Must return 409 Conflict with clear explanation
    expect(resB.status).toBe(409);
    expect(resB.body.success).toBe(false);
    expect(resB.body.error.code).toBe('CONCURRENT_MODIFICATION');
    expect(resB.body.error.message).toContain('Someone else is currently handling or has already updated this case');
  });

  it('prevents two responders from acquiring active triage lock simultaneously', async () => {
    // 1. Responder A acquires lock
    const lockResA = await request(app)
      .post(`/api/v1/reports/${testReportId}/lock`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ expectedVersion: 1 });

    expect(lockResA.status).toBe(200);
    expect(lockResA.body.data.lockedById).toBe(userA.id);

    // 2. Responder B tries to lock the same case while A holds active lock
    const lockResB = await request(app)
      .post(`/api/v1/reports/${testReportId}/lock`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ expectedVersion: 1 });

    expect(lockResB.status).toBe(409);
    expect(lockResB.body.error.message).toContain('Someone else is currently handling or has already updated this case');

    // 3. Responder A releases the lock
    const unlockRes = await request(app)
      .post(`/api/v1/reports/${testReportId}/unlock`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send();

    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.data.unlocked).toBe(true);

    // 4. Responder B can now successfully lock the case
    const lockResB2 = await request(app)
      .post(`/api/v1/reports/${testReportId}/lock`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ expectedVersion: 1 });

    expect(lockResB2.status).toBe(200);
    expect(lockResB2.body.data.lockedById).toBe(userB.id);
  });
});
