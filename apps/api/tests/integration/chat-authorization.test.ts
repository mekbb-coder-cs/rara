import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { generateAccessToken } from '../../src/utils/crypto.js';
import { Role } from '@relieflink/shared';
import {
  reportRepository,
  InMemoryReportRepository,
} from '../../src/repositories/report.repository.js';
import {
  userRepository,
  InMemoryUserRepository,
} from '../../src/repositories/user.repository.js';

describe('Case Team Chat Authorization & Privacy Integration Tests', () => {
  const app = createApp();

  let responderUser: any;
  let providerUser: any;
  let reporterUser: any;
  let responderToken: string;
  let providerToken: string;
  let reporterToken: string;
  let testReportId: string;

  beforeEach(async () => {
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
    }
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
    }

    // 1. Create Users
    responderUser = await userRepository.createUser({
      email: `responder.chat.${Date.now()}@tigray-aid.org`,
      passwordHash: 'hashedPass',
      fullName: 'Dr. Tedros Responder',
      role: Role.RESPONDER,
    });
    responderToken = generateAccessToken({
      userId: responderUser.id,
      email: responderUser.email,
      role: responderUser.role,
      organizationId: null,
      regions: ['reg-tigray-all'],
    });

    providerUser = await userRepository.createUser({
      email: `provider.chat.${Date.now()}@redcross.org`,
      passwordHash: 'hashedPass',
      fullName: 'Red Cross Aid Provider',
      role: Role.AID_PROVIDER,
      organizationId: 'org-redcross-tigray',
    });
    providerToken = generateAccessToken({
      userId: providerUser.id,
      email: providerUser.email,
      role: providerUser.role,
      organizationId: 'org-redcross-tigray',
      regions: [],
    });

    reporterUser = await userRepository.createUser({
      email: `civilian.${Date.now()}@gmail.com`,
      passwordHash: 'hashedPass',
      fullName: 'Civilian Reporter',
      role: Role.REPORTER,
    });
    reporterToken = generateAccessToken({
      userId: reporterUser.id,
      email: reporterUser.email,
      role: reporterUser.role,
      organizationId: null,
      regions: [],
    });

    // 2. Create sample report with confidential victim details
    const { report } = await reportRepository.createReport({
      title: 'Family Trapped Near River Bank',
      description: 'Water has surrounded the homestead; 4 children and elderly grandmother on roof.',
      hazardType: 'FLOOD',
      severity: 'CRITICAL',
      approximateLocation: 'Ayder Subcity, Mekelle',
      latitude: 13.498,
      longitude: 39.475,
      peopleAffectedCount: 6,
      contactPhone: '+251-91-499-1122',
      reporterName: 'Almaz Gebremedhin',
    });
    testReportId = report.id;
  });

  it('rejects unauthenticated requests to read or post case chat messages with 401', async () => {
    const getRes = await request(app)
      .get(`/api/v1/coordination/cases/${testReportId}/chat`);
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post(`/api/v1/coordination/cases/${testReportId}/chat`)
      .send({ message: 'Hello from unauthorized client' });
    expect(postRes.status).toBe(401);
  });

  it('rejects standard civilians/reporters from accessing internal team chat with 403', async () => {
    const getRes = await request(app)
      .get(`/api/v1/coordination/cases/${testReportId}/chat`)
      .set('Authorization', `Bearer ${reporterToken}`);
    expect(getRes.status).toBe(403);

    const postRes = await request(app)
      .post(`/api/v1/coordination/cases/${testReportId}/chat`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({ message: 'Civilian attempting to write to internal chat' });
    expect(postRes.status).toBe(403);
  });

  it('allows verified responders and aid providers to exchange messages', async () => {
    // 1. Responder posts message
    const msg1Res = await request(app)
      .post(`/api/v1/coordination/cases/${testReportId}/chat`)
      .set('Authorization', `Bearer ${responderToken}`)
      .send({ message: 'Dispatched boat unit Alpha. Arrival ETA is 15 minutes.' });
    expect(msg1Res.status).toBe(201);
    expect(msg1Res.body.data.message).toBe('Dispatched boat unit Alpha. Arrival ETA is 15 minutes.');
    expect(msg1Res.body.data.senderRole).toBe(Role.RESPONDER);

    // 2. Aid Provider replies
    const msg2Res = await request(app)
      .post(`/api/v1/coordination/cases/${testReportId}/chat`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ message: 'Depot has 6 lifejackets ready for boat unit at Ayder checkpoint.' });
    expect(msg2Res.status).toBe(201);
    expect(msg2Res.body.data.senderRole).toBe(Role.AID_PROVIDER);

    // 3. Responder reads full chat history
    const getRes = await request(app)
      .get(`/api/v1/coordination/cases/${testReportId}/chat`)
      .set('Authorization', `Bearer ${responderToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.length).toBe(2);

    // 4. Verify privacy: reporter phone and private name are NOT in the chat data
    const chatPayloadString = JSON.stringify(getRes.body.data);
    expect(chatPayloadString).not.toContain('+251-91-499-1122');
    expect(chatPayloadString).not.toContain('Almaz Gebremedhin');
  });
});
