import { describe, it, expect } from 'vitest';
import {
  AidType,
  AidStatus,
  NeedUrgency,
  NeedStatus,
  AidNeedRecord,
  AidOfferRecord,
} from '@relieflink/shared';
import { matchingService } from '../../src/services/matching.service.js';

describe('Aid Matching Engine & Ranking Formula Unit Tests', () => {
  const baseNeed: AidNeedRecord = {
    id: 'need-test-1',
    reportId: 'rep-test-1',
    aidType: AidType.FOOD_WATER,
    quantityRequired: 50,
    quantityFulfilled: 0,
    unit: 'water boxes',
    urgency: NeedUrgency.URGENT,
    status: NeedStatus.OPEN,
    notes: 'Urgent drinking water for flood victims',
    latitude: 13.4967, // Mekelle center
    longitude: 39.4753,
    isEscalated: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('awards maximum type fit score (30 pts) for exact aid type match and 0 for mismatched type', () => {
    const matchingOffer: AidOfferRecord = {
      id: 'offer-1',
      organizationId: 'org-1',
      aidType: AidType.FOOD_WATER,
      title: 'Bottled Drinking Water',
      capacityTotal: 100,
      capacityRemaining: 100,
      capacityReserved: 0,
      capacityFulfilled: 0,
      unit: 'water boxes',
      status: AidStatus.AVAILABLE,
      latitude: 13.4967,
      longitude: 39.4753,
      serviceRadiusKm: 25,
      version: 1,
      availableFrom: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mismatchedOffer: AidOfferRecord = {
      ...matchingOffer,
      id: 'offer-2',
      aidType: AidType.SHELTER_BEDDING,
      title: 'Tents and Blankets',
    };

    const matchScore = matchingService.calculateMatchScore(baseNeed, matchingOffer, 1.0);
    expect(matchScore.scoreBreakdown.typeFitScore).toBe(30);

    const mismatchScore = matchingService.calculateMatchScore(baseNeed, mismatchedOffer, 1.0);
    expect(mismatchScore.scoreBreakdown.typeFitScore).toBe(0);
  });

  it('ranks closer offers higher with lower estimated travel times', () => {
    // Offer close (2 km)
    const closeOffer: AidOfferRecord = {
      id: 'offer-close',
      organizationId: 'org-1',
      aidType: AidType.FOOD_WATER,
      title: 'Ayder Hospital Aid Depot',
      capacityTotal: 100,
      capacityRemaining: 100,
      capacityReserved: 0,
      capacityFulfilled: 0,
      unit: 'water boxes',
      status: AidStatus.AVAILABLE,
      latitude: 13.5100,
      longitude: 39.4800, // ~2 km
      serviceRadiusKm: 25,
      version: 1,
      availableFrom: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Offer far (20 km)
    const farOffer: AidOfferRecord = {
      ...closeOffer,
      id: 'offer-far',
      latitude: 13.6500,
      longitude: 39.5500, // ~20 km
    };

    const closeCalc = matchingService.calculateMatchScore(baseNeed, closeOffer, 0.95);
    const farCalc = matchingService.calculateMatchScore(baseNeed, farOffer, 0.95);

    expect(closeCalc.scoreBreakdown.distanceScore).toBeGreaterThan(
      farCalc.scoreBreakdown.distanceScore
    );
    expect(closeCalc.estimatedTravelMinutes).toBeLessThan(farCalc.estimatedTravelMinutes);
    expect(closeCalc.compatibilityScore).toBeGreaterThan(farCalc.compatibilityScore);
  });

  it('calculates capacity fit score proportionally for full vs partial availability', () => {
    // 100% capacity available (50 needed, 100 available)
    const fullOffer: AidOfferRecord = {
      id: 'offer-full',
      organizationId: 'org-1',
      aidType: AidType.FOOD_WATER,
      title: 'Full Capacity Warehouse',
      capacityTotal: 100,
      capacityRemaining: 100,
      capacityReserved: 0,
      capacityFulfilled: 0,
      unit: 'water boxes',
      status: AidStatus.AVAILABLE,
      latitude: 13.4967,
      longitude: 39.4753,
      serviceRadiusKm: 25,
      version: 1,
      availableFrom: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 50% capacity available (25 available out of 50 needed)
    const halfOffer: AidOfferRecord = {
      ...fullOffer,
      id: 'offer-half',
      capacityRemaining: 25,
    };

    const fullCalc = matchingService.calculateMatchScore(baseNeed, fullOffer, 1.0);
    const halfCalc = matchingService.calculateMatchScore(baseNeed, halfOffer, 1.0);

    expect(fullCalc.scoreBreakdown.capacityScore).toBe(20);
    expect(halfCalc.scoreBreakdown.capacityScore).toBe(10);
  });

  it('weights provider reliability score proportionally (15 pts * reliability ratio)', () => {
    const offer: AidOfferRecord = {
      id: 'offer-rel',
      organizationId: 'org-1',
      aidType: AidType.FOOD_WATER,
      title: 'Reliability Test Offer',
      capacityTotal: 100,
      capacityRemaining: 100,
      capacityReserved: 0,
      capacityFulfilled: 0,
      unit: 'water boxes',
      status: AidStatus.AVAILABLE,
      latitude: 13.4967,
      longitude: 39.4753,
      serviceRadiusKm: 25,
      version: 1,
      availableFrom: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const reliableCalc = matchingService.calculateMatchScore(baseNeed, offer, 1.0);
    const averageCalc = matchingService.calculateMatchScore(baseNeed, offer, 0.5);

    expect(reliableCalc.scoreBreakdown.reliabilityScore).toBe(15);
    expect(averageCalc.scoreBreakdown.reliabilityScore).toBe(7.5);
  });

  it('adjusts priority score according to urgency levels', () => {
    const immediateNeed = { ...baseNeed, urgency: NeedUrgency.IMMEDIATE };
    const flexibleNeed = { ...baseNeed, urgency: NeedUrgency.FLEXIBLE };

    const offer: AidOfferRecord = {
      id: 'offer-urgency',
      organizationId: 'org-1',
      aidType: AidType.FOOD_WATER,
      title: 'Urgency Test Depot',
      capacityTotal: 100,
      capacityRemaining: 100,
      capacityReserved: 0,
      capacityFulfilled: 0,
      unit: 'water boxes',
      status: AidStatus.AVAILABLE,
      latitude: 13.4967,
      longitude: 39.4753,
      serviceRadiusKm: 25,
      version: 1,
      availableFrom: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const immCalc = matchingService.calculateMatchScore(immediateNeed, offer, 0.9);
    const flexCalc = matchingService.calculateMatchScore(flexibleNeed, offer, 0.9);

    expect(immCalc.compatibilityScore).toBeGreaterThan(flexCalc.compatibilityScore);
    expect(immCalc.scoreBreakdown.urgencyMultiplier).toBe(1.5);
    expect(flexCalc.scoreBreakdown.urgencyMultiplier).toBe(1.0);
  });
});
