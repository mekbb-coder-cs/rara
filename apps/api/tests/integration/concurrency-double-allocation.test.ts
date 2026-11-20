import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { generateAccessToken } from '../../src/utils/crypto.js';
import {
  Role,
  HazardType,
  UrgencyLevel,
  AidType,
  NeedUrgency,
  AidStatus,
} from '@relieflink/shared';
import {
  matchingRepository,
  InMemoryMatchingRepository,
} from '../../src/repositories/matching.repository.js';
import {
  reportRepository,
  InMemoryReportRepository,
} from '../../src/repositories/report.repository.js';
import {
  userRepository,
  InMemoryUserRepository,
} from '../../src/repositories/user.repository.js';

describe('Resource Inventory & Double-Allocation Concurrency Tests', () => {
  const app = createApp();

  let responderUser: any;
  let providerUser: any;
  let responderToken: string;
  let providerToken: string;
  let testOfferId: string;
  let needAId: string;
  let needBId: string;

  beforeEach(async () => {
    if (matchingRepository instanceof InMemoryMatchingRepository) {
      matchingRepository.offers.clear();
      matchingRepository.needs.clear();
      matchingRepository.matches.clear();
      matchingRepository.orgReliability.clear();
    }
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
    }
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
    }

    // Create responder user
    responderUser = await userRepository.createUser({
      email: `responder.match.${Date.now()}@relief.org`,
      passwordHash: 'hashedPass',
      fullName: 'Responder Triage Specialist',
      role: Role.RESPONDER,
    });
    responderToken = generateAccessToken({
      userId: responderUser.id,
      role: Role.RESPONDER,
      email: responderUser.email!,
    });

    // Create provider user
    providerUser = await userRepository.createUser({
      email: `provider.aid.${Date.now()}@ngo.org`,
      passwordHash: 'hashedPass',
      fullName: 'NGO Aid Logistics',
      role: Role.AID_PROVIDER,
    });
    providerToken = generateAccessToken({
      userId: providerUser.id,
      role: Role.AID_PROVIDER,
      email: providerUser.email!,
    });

    // Create verified disaster report
    const { report } = await reportRepository.createReport({
      title: 'Mekelle Flood Evacuation Camp',
      description: 'Displaced families need emergency medical kits.',
      hazardType: HazardType.FLOOD,
      initialUrgency: UrgencyLevel.HIGH,
      latitude: 13.4967,
      longitude: 39.4753,
      approximateLocation: 'Ayder Subcity, Mekelle',
      exactAddressEncrypted: 'Ayder School Camp',
      peopleAffectedCount: 50,
      vulnerableGroups: ['children', 'elderly'],
      isAnonymous: false,
    });

    // Create AidNeed A (requires 10 kits)
    const needA = await matchingRepository.createAidNeed({
      reportId: report.id,
      aidType: AidType.MEDICAL_SUPPLIES,
      quantityRequired: 10,
      unit: 'first aid trauma kits',
      urgency: NeedUrgency.URGENT,
      latitude: 13.4967,
      longitude: 39.4753,
    });
    needAId = needA.id;

    // Create AidNeed B (requires 10 kits)
    const needB = await matchingRepository.createAidNeed({
      reportId: report.id,
      aidType: AidType.MEDICAL_SUPPLIES,
      quantityRequired: 10,
      unit: 'first aid trauma kits',
      urgency: NeedUrgency.URGENT,
      latitude: 13.4967,
      longitude: 39.4753,
    });
    needBId = needB.id;

    // Create AidOffer with EXACTLY 10 kits total capacity
    const offer = await matchingRepository.createAidOffer({
      organizationId: 'org-red-cross-tigray',
      organizationName: 'Ethiopian Red Cross Tigray Branch',
      userId: providerUser.id,
      aidType: AidType.MEDICAL_SUPPLIES,
      title: 'Emergency Trauma Medical Kits',
      capacityTotal: 10,
      unit: 'first aid trauma kits',
      latitude: 13.4980,
      longitude: 39.4770,
      serviceRadiusKm: 25,
    });
    testOfferId = offer.id;
  });

  it('strictly prevents double allocation when two concurrent requests compete for the same stock', async () => {
    // Both responders attempt to confirm and allocate all 10 kits at the exact same instant
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/aid/matches/confirm')
        .set('Authorization', `Bearer ${responderToken}`)
        .send({
          needId: needAId,
          offerId: testOfferId,
          requestedQuantity: 10,
          timeoutMinutes: 60,
        }),
      request(app)
        .post('/api/v1/aid/matches/confirm')
        .set('Authorization', `Bearer ${responderToken}`)
        .send({
          needId: needBId,
          offerId: testOfferId,
          requestedQuantity: 10,
          timeoutMinutes: 60,
        }),
    ]);

    const statuses = [resA.status, resB.status];

    // Exactly one must succeed (201) and exactly one must fail (409 Insufficient Capacity)
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    const failedResponse = resA.status === 409 ? resA : resB;
    expect(failedResponse.body.error.code).toBe('INSUFFICIENT_CAPACITY');
    expect(failedResponse.body.error.message).toMatch(/Insufficient available inventory capacity/i);

    // Verify inventory integrity: stock must never be negative or double-committed
    const finalOffer = await matchingRepository.getAidOfferById(testOfferId);
    expect(finalOffer).not.toBeNull();
    expect(finalOffer!.capacityRemaining).toBe(0);
    expect(finalOffer!.capacityReserved).toBe(10);
    expect(finalOffer!.capacityTotal).toBe(10);
    expect(finalOffer!.status).toBe(AidStatus.COMMITTED);
  });

  it('rejects allocation when requested quantity exceeds available capacity', async () => {
    const res = await request(app)
      .post('/api/v1/aid/matches/confirm')
      .set('Authorization', `Bearer ${responderToken}`)
      .send({
        needId: needAId,
        offerId: testOfferId,
        requestedQuantity: 15, // Only 10 available!
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_CAPACITY');

    const offer = await matchingRepository.getAidOfferById(testOfferId);
    expect(offer!.capacityRemaining).toBe(10);
    expect(offer!.capacityReserved).toBe(0);
  });
});
