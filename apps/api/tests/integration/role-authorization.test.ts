import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { generateAccessToken } from '../../src/utils/crypto.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';
import { Role } from '@relieflink/shared';

describe('Phase 8: Role Authorization & Field Masking Compliance Tests', () => {
  const app = createApp();

  let reporterToken: string;
  let responderToken: string;
  let coordinatorToken: string;
  let adminToken: string;

  beforeEach(async () => {
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
    }

    const rep = await userRepository.createUser({
      email: `civilian.${Date.now()}@relieflink.local`,
      passwordHash: 'hashedPass',
      fullName: 'Civilian Reporter',
      role: Role.REPORTER,
    });
    reporterToken = generateAccessToken({
      userId: rep.id,
      email: rep.email,
      role: rep.role,
    });

    const resp = await userRepository.createUser({
      email: `responder.${Date.now()}@relieflink.local`,
      passwordHash: 'hashedPass',
      fullName: 'Emergency Responder',
      role: Role.RESPONDER,
      isVerifiedResponder: true,
    });
    responderToken = generateAccessToken({
      userId: resp.id,
      email: resp.email,
      role: resp.role,
      isVerifiedResponder: true,
    });

    const coord = await userRepository.createUser({
      email: `coord.${Date.now()}@relieflink.local`,
      passwordHash: 'hashedPass',
      fullName: 'Regional Operations Coordinator',
      role: Role.COORDINATOR,
      isVerifiedResponder: true,
    });
    coordinatorToken = generateAccessToken({
      userId: coord.id,
      email: coord.email,
      role: coord.role,
    });

    const adm = await userRepository.createUser({
      email: `admin.${Date.now()}@relieflink.local`,
      passwordHash: 'hashedPass',
      fullName: 'System Administrator',
      role: Role.ADMIN,
      isVerifiedResponder: true,
    });
    adminToken = generateAccessToken({
      userId: adm.id,
      email: adm.email,
      role: adm.role,
    });
  });

  it('rejects unauthenticated requests to admin configuration with 401', async () => {
    const res = await request(app).get('/api/v1/admin/config');
    expect(res.status).toBe(401);
  });

  it('rejects civilian reporter and responder from admin configuration with 403', async () => {
    const resReporter = await request(app)
      .get('/api/v1/admin/config')
      .set('Authorization', `Bearer ${reporterToken}`);
    expect(resReporter.status).toBe(403);

    const resResponder = await request(app)
      .get('/api/v1/admin/config')
      .set('Authorization', `Bearer ${responderToken}`);
    expect(resResponder.status).toBe(403);
  });

  it('allows admin to access and update priority weights', async () => {
    const resGet = await request(app)
      .get('/api/v1/admin/config')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resGet.status).toBe(200);
    expect(resGet.body.success).toBe(true);
    expect(resGet.body.data.priorityWeights).toBeDefined();

    const resUpdate = await request(app)
      .put('/api/v1/admin/config/priority-weights')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        weightSeverity: 4.0,
        weightPeople: 3.0,
        weightVulnerability: 2.0,
        weightWaitingTime: 1.0,
      });
    expect(resUpdate.status).toBe(200);
    expect(resUpdate.body.data.weightSeverity).toBe(4.0);
  });

  it('prevents non-admins from viewing audit logs', async () => {
    const resReporter = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${reporterToken}`);
    expect(resReporter.status).toBe(403);

    const resAdmin = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdmin.status).toBe(200);
    expect(Array.isArray(resAdmin.body.data)).toBe(true);
  });

  it('allows coordinators and admins to view operations metrics, blocks civilians', async () => {
    const resReporter = await request(app)
      .get('/api/v1/analytics/operations')
      .set('Authorization', `Bearer ${reporterToken}`);
    expect(resReporter.status).toBe(403);

    const resCoord = await request(app)
      .get('/api/v1/analytics/operations')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    expect(resCoord.status).toBe(200);
    expect(resCoord.body.data.reportsOverTime).toBeDefined();
    expect(resCoord.body.data.averageTimeToVerifyMinutes).toBeDefined();

    const resAdmin = await request(app)
      .get('/api/v1/analytics/operations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdmin.status).toBe(200);
  });

  it('allows the public to view non-identifying transparency metrics without token', async () => {
    const res = await request(app).get('/api/v1/analytics/transparency');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalReports).toBeDefined();
    expect(res.body.data.breakdownByHazard).toBeDefined();
  });
});
