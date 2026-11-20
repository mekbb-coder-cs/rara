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
  MatchStatus,
  NeedStatus,
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

describe('Match Lifecycle, Provider Flow, and Timeout Re-Routing Tests', () => {
  const app = createApp();

  let responderUser: any;
  let providerAUser: any;
  let providerBUser: any;
  let responderToken: string;
  let providerAToken: string;
  let providerBToken: string;

  let testNeedId: string;
  let offerAId: string;
  let offerBId: string;

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

    responderUser = await userRepository.createUser({
      email: `responder.${Date.now()}@relief.org`,
      passwordHash: 'hashedPass',
      fullName: 'Field Responder',
      role: Role.RESPONDER,
    });
    responderToken = generateAccessToken({
      userId: responderUser.id,
      role: Role.RESPONDER,
      email: responderUser.email!,
    });

    providerAUser = await userRepository.createUser({
      email: `provider.a.${Date.now()}@ngo.org`,
      passwordHash: 'hashedPass',
      fullName: 'Provider Alpha Logistics',
      role: Role.AID_PROVIDER,
    });
    providerAToken = generateAccessToken({
      userId: providerAUser.id,
      role: Role.AID_PROVIDER,
      email: providerAUser.email!,
    });

    providerBUser = await userRepository.createUser({
      email: `provider.b.${Date.now()}@ngo.org`,
      passwordHash: 'hashedPass',
      fullName: 'Provider Beta Logistics',
      role: Role.AID_PROVIDER,
    });
    providerBToken = generateAccessToken({
      userId: providerBUser.id,
      role: Role.AID_PROVIDER,
      email: providerBUser.email!,
    });

    // Create report
    const { report } = await reportRepository.createReport({
      title: 'Shire Suhul Displacement Center',
      description: 'Displaced community in urgent need of clean drinking water.',
      hazardType: HazardType.FOOD_WATER,
      initialUrgency: UrgencyLevel.HIGH,
      latitude: 14.1032, // Shire
      longitude: 38.2865,
      approximateLocation: 'Suhul Hospital Area, Shire',
      exactAddressEncrypted: 'Suhul Primary School Compound',
      peopleAffectedCount: 80,
      vulnerableGroups: ['children', 'pregnant'],
      isAnonymous: false,
    });

    // Create AidNeed (30 clean water jerrycans)
    const need = await matchingRepository.createAidNeed({
      reportId: report.id,
      aidType: AidType.FOOD_WATER,
      quantityRequired: 30,
      unit: '20L water jerrycans',
      urgency: NeedUrgency.URGENT,
      latitude: 14.1032,
      longitude: 38.2865,
    });
    testNeedId = need.id;

    // Create Offer A (Closest: 2 km away, capacity 50)
    const offerA = await matchingRepository.createAidOffer({
      organizationId: 'org-alpha',
      organizationName: 'Relief NGO Alpha',
      userId: providerAUser.id,
      aidType: AidType.FOOD_WATER,
      title: 'Potable Drinking Water Storage',
      capacityTotal: 50,
      unit: '20L water jerrycans',
      latitude: 14.1100,
      longitude: 38.2900,
      serviceRadiusKm: 30,
    });
    offerAId = offerA.id;

    // Create Offer B (Secondary: 10 km away, capacity 100)
    const offerB = await matchingRepository.createAidOffer({
      organizationId: 'org-beta',
      organizationName: 'Relief NGO Beta',
      userId: providerBUser.id,
      aidType: AidType.FOOD_WATER,
      title: 'Water Purification Depot',
      capacityTotal: 100,
      unit: '20L water jerrycans',
      latitude: 14.1800,
      longitude: 38.3200,
      serviceRadiusKm: 40,
    });
    offerBId = offerB.id;
  });

  it('allows provider to accept a match request and updates inventory and reliability score', async () => {
    // 1. Responder confirms match with Offer A
    const confirmRes = await request(app)
      .post('/api/v1/aid/matches/confirm')
      .set('Authorization', `Bearer ${responderToken}`)
      .send({
        needId: testNeedId,
        offerId: offerAId,
        requestedQuantity: 30,
      });

    expect(confirmRes.status).toBe(201);
    const matchId = confirmRes.body.data.id;

    // Verify stock is reserved
    const offerBefore = await matchingRepository.getAidOfferById(offerAId);
    expect(offerBefore!.capacityReserved).toBe(30);
    expect(offerBefore!.capacityRemaining).toBe(20);

    // 2. Provider A accepts match
    const acceptRes = await request(app)
      .post(`/api/v1/aid/matches/${matchId}/respond`)
      .set('Authorization', `Bearer ${providerAToken}`)
      .send({
        action: 'ACCEPT',
      });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.match.status).toBe(MatchStatus.ACCEPTED_BY_PROVIDER);

    // 3. Verify offer inventory: reserved converted to fulfilled
    const offerAfter = await matchingRepository.getAidOfferById(offerAId);
    expect(offerAfter!.capacityReserved).toBe(0);
    expect(offerAfter!.capacityFulfilled).toBe(30);
    expect(offerAfter!.capacityRemaining).toBe(20);

    // 4. Verify need is fulfilled
    const needAfter = await matchingRepository.getAidNeedById(testNeedId);
    expect(needAfter!.status).toBe(NeedStatus.FULFILLED);
    expect(needAfter!.quantityFulfilled).toBe(30);
  });

  it('allows provider to decline a match request with mandatory reason and restores inventory', async () => {
    // 1. Confirm match
    const confirmRes = await request(app)
      .post('/api/v1/aid/matches/confirm')
      .set('Authorization', `Bearer ${responderToken}`)
      .send({
        needId: testNeedId,
        offerId: offerAId,
        requestedQuantity: 30,
      });

    const matchId = confirmRes.body.data.id;

    // 2. Decline without reason should fail
    const invalidDecline = await request(app)
      .post(`/api/v1/aid/matches/${matchId}/respond`)
      .set('Authorization', `Bearer ${providerAToken}`)
      .send({
        action: 'DECLINE',
        declineReason: '',
      });
    expect(invalidDecline.status).toBe(400);

    // 3. Decline with valid reason succeeds
    const declineRes = await request(app)
      .post(`/api/v1/aid/matches/${matchId}/respond`)
      .set('Authorization', `Bearer ${providerAToken}`)
      .send({
        action: 'DECLINE',
        declineReason: 'Transport truck damaged in road obstacle; unable to dispatch immediately.',
      });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.data.match.status).toBe(MatchStatus.DECLINED_BY_PROVIDER);

    // 4. Verify stock is completely restored back to available
    const offerAfter = await matchingRepository.getAidOfferById(offerAId);
    expect(offerAfter!.capacityReserved).toBe(0);
    expect(offerAfter!.capacityRemaining).toBe(50);
    expect(offerAfter!.status).toBe(AidStatus.AVAILABLE);

    // 5. Need returns to OPEN state
    const needAfter = await matchingRepository.getAidNeedById(testNeedId);
    expect(needAfter!.status).toBe(NeedStatus.OPEN);
  });

  it('automatically unreserves stock and re-routes to next best offer on provider timeout', async () => {
    // 1. Confirm match with Offer A
    const confirmRes = await request(app)
      .post('/api/v1/aid/matches/confirm')
      .set('Authorization', `Bearer ${responderToken}`)
      .send({
        needId: testNeedId,
        offerId: offerAId,
        requestedQuantity: 30,
        timeoutMinutes: 60,
      });

    const matchAId = confirmRes.body.data.id;

    // 2. Simulate timeout: set timeoutAt to 10 minutes ago
    const matchA = await matchingRepository.getMatchById(matchAId);
    expect(matchA).not.toBeNull();
    const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    (matchingRepository as InMemoryMatchingRepository).matches.get(matchAId)!.timeoutAt = pastTime;

    // 3. Process timeouts via endpoint
    const sweepRes = await request(app)
      .post('/api/v1/aid/matches/process-timeouts')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(sweepRes.status).toBe(200);
    expect(sweepRes.body.data.length).toBe(1);

    const sweepResult = sweepRes.body.data[0];
    expect(sweepResult.timedOutMatch.id).toBe(matchAId);
    expect(sweepResult.timedOutMatch.status).toBe(MatchStatus.TIMED_OUT);

    // 4. Offer A stock must be completely restored!
    const offerAAfter = await matchingRepository.getAidOfferById(offerAId);
    expect(offerAAfter!.capacityReserved).toBe(0);
    expect(offerAAfter!.capacityRemaining).toBe(50);

    // 5. System must have automatically re-routed to Offer B!
    expect(sweepResult.reroutedMatch).not.toBeNull();
    expect(sweepResult.reroutedMatch.offerId).toBe(offerBId);
    expect(sweepResult.reroutedMatch.status).toBe(MatchStatus.PENDING_PROVIDER);
    expect(sweepResult.reroutedMatch.matchedQuantity).toBe(30);

    // 6. Offer B inventory must now be reserved!
    const offerBAfter = await matchingRepository.getAidOfferById(offerBId);
    expect(offerBAfter!.capacityReserved).toBe(30);
    expect(offerBAfter!.capacityRemaining).toBe(70);

    // 7. Provider B can now accept the re-routed match!
    const acceptRes = await request(app)
      .post(`/api/v1/aid/matches/${sweepResult.reroutedMatch.id}/respond`)
      .set('Authorization', `Bearer ${providerBToken}`)
      .send({ action: 'ACCEPT' });

    expect(acceptRes.status).toBe(200);
    const finalOfferB = await matchingRepository.getAidOfferById(offerBId);
    expect(finalOfferB!.capacityFulfilled).toBe(30);
    expect(finalOfferB!.capacityReserved).toBe(0);
  });
});
