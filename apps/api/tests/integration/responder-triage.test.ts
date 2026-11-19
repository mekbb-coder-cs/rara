import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { generateAccessToken } from '../../src/utils/crypto.js';
import { Role, HazardType, UrgencyLevel, AuditAction, ReportStatus } from '@relieflink/shared';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { auditRepository } from '../../src/repositories/audit.repository.js';
import { priorityService } from '../../src/services/priority.service.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';

describe('Responder Triage & Queue Integration Tests', () => {
  const app = createApp();

  let userR1: any;
  let userR2: any;
  let userCoord: any;
  let tokenR1: string;
  let tokenR2: string;
  let tokenCoord: string;

  let reportMiamiHigh: string;
  let reportMiamiLow: string;
  let reportOrlando: string;

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
    // 0. Setup real users with region scoping
    userR1 = await userRepository.createUser({
      email: `responder.reg1.${Date.now()}.${Math.random()}@relief.org`,
      passwordHash: 'hash',
      fullName: 'Miami Responder',
      role: Role.RESPONDER,
    });
    await userRepository.assignUserToRegion(userR1.id, 'region-miami-south');

    userR2 = await userRepository.createUser({
      email: `responder.reg2.${Date.now()}.${Math.random()}@relief.org`,
      passwordHash: 'hash',
      fullName: 'Orlando Responder',
      role: Role.RESPONDER,
    });
    await userRepository.assignUserToRegion(userR2.id, 'region-orlando-north');

    userCoord = await userRepository.createUser({
      email: `coordinator.${Date.now()}.${Math.random()}@relief.org`,
      passwordHash: 'hash',
      fullName: 'Coordinator User',
      role: Role.COORDINATOR,
    });

    tokenR1 = generateAccessToken({
      userId: userR1.id,
      role: Role.RESPONDER,
      email: userR1.email!,
    });
    tokenR2 = generateAccessToken({
      userId: userR2.id,
      role: Role.RESPONDER,
      email: userR2.email!,
    });
    tokenCoord = generateAccessToken({
      userId: userCoord.id,
      role: Role.COORDINATOR,
      email: userCoord.email!,
    });
    // 1. Miami Critical report
    const r1 = await reportRepository.createReport({
      title: 'Miami Major Flood',
      description: 'Rising water trapping 12 residents in hospital ground floor.',
      hazardType: HazardType.FLOOD,
      initialUrgency: UrgencyLevel.LIFE_THREATENING,
      latitude: 25.7617,
      longitude: -80.1918,
      approximateLocation: 'Miami, FL',
      exactAddressEncrypted: '450 Biscayne Blvd, Apt 4B',
      peopleAffectedCount: 12,
      vulnerableGroups: ['elderly', 'disabled'],
      isAnonymous: false,
      regionId: 'region-miami-south',
      reporterPhoneEncrypted: '+13055551234',
      reporterName: 'Carlos Martinez',
    });
    reportMiamiHigh = r1.report.id;
    const p1 = priorityService.calculate(r1.report);
    await reportRepository.savePriorityScore(r1.report.id, p1);

    // 2. Miami Low urgency report
    const r2 = await reportRepository.createReport({
      title: 'Miami Minor Water Puddle',
      description: 'Minor street pooling, passable by car.',
      hazardType: HazardType.FLOOD,
      initialUrgency: UrgencyLevel.LOW,
      latitude: 25.7600,
      longitude: -80.1900,
      approximateLocation: 'Miami, FL',
      exactAddressEncrypted: '100 NW 1st Ave',
      peopleAffectedCount: 1,
      vulnerableGroups: [],
      isAnonymous: false,
      regionId: 'region-miami-south',
    });
    reportMiamiLow = r2.report.id;
    const p2 = priorityService.calculate(r2.report);
    await reportRepository.savePriorityScore(r2.report.id, p2);

    // 3. Orlando report
    const r3 = await reportRepository.createReport({
      title: 'Orlando Downed Wire',
      description: 'Live wire in residential driveway.',
      hazardType: HazardType.UTILITY_FAILURE,
      initialUrgency: UrgencyLevel.HIGH,
      latitude: 28.5383,
      longitude: -81.3792,
      approximateLocation: 'Orlando, FL',
      exactAddressEncrypted: '900 Orange Ave',
      peopleAffectedCount: 2,
      vulnerableGroups: [],
      isAnonymous: false,
      regionId: 'region-orlando-north',
      reporterPhoneEncrypted: '+14075559876',
    });
    reportOrlando = r3.report.id;
    const p3 = priorityService.calculate(r3.report);
    await reportRepository.savePriorityScore(r3.report.id, p3);
  });

  it('scopes triage queue to responder assigned regions', async () => {
    const res = await request(app)
      .get('/api/v1/reports/triage')
      .set('Authorization', `Bearer ${tokenR1}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should see the 2 Miami reports, but NOT the Orlando report
    const ids = res.body.data.map((r: any) => r.id);
    expect(ids).toContain(reportMiamiHigh);
    expect(ids).toContain(reportMiamiLow);
    expect(ids).not.toContain(reportOrlando);
  });

  it('orders triage queue by PriorityScore descending by default', async () => {
    const res = await request(app)
      .get('/api/v1/reports/triage')
      .set('Authorization', `Bearer ${tokenR1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    // Highest priority case should be first
    expect(res.body.data[0].id).toBe(reportMiamiHigh);
    expect(res.body.data[0].priorityScore).toBeGreaterThan(res.body.data[1].priorityScore);
    expect(res.body.data[0].priorityBreakdown).toBeDefined();
  });

  it('unmasks sensitive contact details and logs mandatory READ_PII audit record', async () => {
    const res = await request(app)
      .post(`/api/v1/reports/${reportMiamiHigh}/reveal-sensitive`)
      .set('Authorization', `Bearer ${tokenR1}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exactAddress).toBe('450 Biscayne Blvd, Apt 4B');
    expect(res.body.data.reporterPhone).toBe('+13055551234');
    expect(res.body.data.reporterName).toBe('Carlos Martinez');

    // Verify AuditLog entry was written
    const logs = await auditRepository.getLogsByEntity('Report', reportMiamiHigh);
    const piiLog = logs.find((l) => l.action === AuditAction.READ_PII);
    expect(piiLog).toBeDefined();
    expect(piiLog?.userId).toBe(userR1.id);
  });

  it('blocks responder from revealing PII for cases outside their assigned region', async () => {
    const res = await request(app)
      .post(`/api/v1/reports/${reportOrlando}/reveal-sensitive`)
      .set('Authorization', `Bearer ${tokenR1}`); // R1 is only assigned to Miami!

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows priority override with mandatory justification note', async () => {
    const res = await request(app)
      .post(`/api/v1/reports/${reportMiamiLow}/priority-override`)
      .set('Authorization', `Bearer ${tokenR1}`)
      .send({
        overrideScore: 88.0,
        overrideReason: 'Severe flash flood warning just issued for this low-lying area',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.newScore).toBe(88.0);
    expect(res.body.data.breakdown.isOverride).toBe(true);
  });

  it('supports requesting more info from reporter', async () => {
    const res = await request(app)
      .post(`/api/v1/reports/${reportMiamiHigh}/request-info`)
      .set('Authorization', `Bearer ${tokenR1}`)
      .send({
        message: 'Are waters continuing to rise? What floor are you located on?',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
