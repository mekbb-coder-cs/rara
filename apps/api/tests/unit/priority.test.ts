import { describe, it, expect } from 'vitest';
import { priorityService } from '../../src/services/priority.service.js';
import { HazardType, UrgencyLevel, ReportStatus } from '@relieflink/shared';
import { ReportRecord } from '../../src/repositories/report.repository.js';

describe('Priority Engine Unit Tests', () => {
  const createMockReport = (overrides: Partial<ReportRecord> = {}): ReportRecord => ({
    id: 'test-report-id',
    trackingCode: 'RL-1234-AB',
    title: 'Test Incident',
    description: 'Test emergency incident description',
    hazardType: HazardType.FLOOD,
    status: ReportStatus.SUBMITTED,
    initialUrgency: UrgencyLevel.HIGH,
    latitude: 25.7617,
    longitude: -80.1918,
    approximateLocation: 'Downtown',
    exactAddressEncrypted: '100 Main St',
    peopleAffectedCount: 1,
    hasInjured: false,
    hasTrapped: false,
    hasVulnerable: false,
    vulnerabilityDetails: null,
    vulnerableGroups: [],
    isAnonymous: false,
    reporterId: null,
    reporterName: null,
    reporterPhoneEncrypted: null,
    reporterIpHash: null,
    regionId: null,
    duplicateClusterId: null,
    isMasterInCluster: false,
    idempotencyKey: null,
    offlineCreatedAt: null,
    isHoneypotTriggered: false,
    version: 1,
    assignedResponderId: null,
    lockedById: null,
    lockedAt: null,
    manualOverrideScore: null,
    manualOverrideReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  it('should scale severity correctly from LOW to LIFE_THREATENING', () => {
    const lowReport = createMockReport({ initialUrgency: UrgencyLevel.LOW });
    const lifeThreateningReport = createMockReport({
      initialUrgency: UrgencyLevel.LIFE_THREATENING,
    });

    const lowScore = priorityService.calculate(lowReport);
    const highUrgencyScore = priorityService.calculate(lifeThreateningReport);

    expect(highUrgencyScore.compositeScore).toBeGreaterThan(lowScore.compositeScore);
    expect(lowScore.breakdown.components.severity.raw).toBe(2);
    expect(highUrgencyScore.breakdown.components.severity.raw).toBe(10);
  });

  it('should apply logarithmic people affected scaling', () => {
    const report1 = createMockReport({ peopleAffectedCount: 1 });
    const report10 = createMockReport({ peopleAffectedCount: 10 });
    const report100 = createMockReport({ peopleAffectedCount: 100 });
    const report1000 = createMockReport({ peopleAffectedCount: 1000 });

    const score1 = priorityService.calculate(report1);
    const score10 = priorityService.calculate(report10);
    const score100 = priorityService.calculate(report100);
    const score1000 = priorityService.calculate(report1000);

    expect(score1.breakdown.components.peopleAffected.score).toBe(1.0);
    expect(score10.breakdown.components.peopleAffected.score).toBe(4.0);
    expect(score100.breakdown.components.peopleAffected.score).toBe(7.0);
    expect(score1000.breakdown.components.peopleAffected.score).toBe(10.0);
  });

  it('should additively sum vulnerable groups and cap at 10', () => {
    const reportAllVulnerable = createMockReport({
      vulnerableGroups: ['children', 'elderly', 'disabled', 'pregnant'],
    });

    const score = priorityService.calculate(reportAllVulnerable);
    // 2.5 + 2.5 + 3.5 + 4.0 = 12.5 -> capped at 10.0
    expect(score.breakdown.components.vulnerabilities.score).toBe(10.0);
  });

  it('should increase score as waiting time elapses', () => {
    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const freshReport = createMockReport({ createdAt: now });
    const waitingReport = createMockReport({ createdAt: fourHoursAgo });

    const freshScore = priorityService.calculate(freshReport, 1, undefined, false, now);
    const waitingScore = priorityService.calculate(waitingReport, 1, undefined, false, now);

    expect(waitingScore.compositeScore).toBeGreaterThan(freshScore.compositeScore);
    expect(waitingScore.breakdown.components.waitingTime.hoursElapsed).toBeCloseTo(4.0, 1);
    expect(waitingScore.breakdown.components.waitingTime.score).toBeCloseTo(1.0, 1);
  });

  it('should apply hazard multipliers according to disaster danger levels', () => {
    const fireReport = createMockReport({ hazardType: HazardType.FIRE });
    const otherReport = createMockReport({ hazardType: HazardType.OTHER });

    const fireScore = priorityService.calculate(fireReport);
    const otherScore = priorityService.calculate(otherReport);

    expect(fireScore.breakdown.multipliers.hazardType.factor).toBe(1.4);
    expect(otherScore.breakdown.multipliers.hazardType.factor).toBe(0.8);
    expect(fireScore.compositeScore).toBeGreaterThan(otherScore.compositeScore);
  });

  it('should apply verification confidence discount and boosts', () => {
    const unverified = createMockReport({ status: ReportStatus.SUBMITTED });
    const corroborated = createMockReport({ status: ReportStatus.SUBMITTED });
    const phoneVerified = createMockReport({ status: ReportStatus.VERIFIED });
    const officialVerified = createMockReport({ status: ReportStatus.VERIFIED });
    const rejected = createMockReport({ status: ReportStatus.REJECTED });

    const sUnverified = priorityService.calculate(unverified, 1);
    const sCorroborated = priorityService.calculate(corroborated, 3);
    const sPhone = priorityService.calculate(phoneVerified, 1, 'PHONE_CALL');
    const sOfficial = priorityService.calculate(officialVerified, 1, 'OFFICIAL_AGENCY');
    const sRejected = priorityService.calculate(rejected);

    expect(sUnverified.verificationMultiplier).toBe(0.4);
    expect(sCorroborated.verificationMultiplier).toBe(0.7);
    expect(sPhone.verificationMultiplier).toBe(0.9);
    expect(sOfficial.verificationMultiplier).toBe(1.0);
    expect(sRejected.verificationMultiplier).toBe(0.0);
    expect(sRejected.compositeScore).toBe(0);
  });

  it('should strictly clamp composite score between 0.0 and 100.0', () => {
    const extremeReport = createMockReport({
      initialUrgency: UrgencyLevel.LIFE_THREATENING,
      hazardType: HazardType.FIRE,
      status: ReportStatus.VERIFIED,
      peopleAffectedCount: 5000,
      vulnerableGroups: ['children', 'elderly', 'disabled', 'pregnant'],
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours waiting
    });

    const score = priorityService.calculate(extremeReport, 1, 'OFFICIAL_AGENCY');
    expect(score.compositeScore).toBeLessThanOrEqual(100.0);
    expect(score.compositeScore).toBeGreaterThanOrEqual(0.0);
  });

  it('should respect manual override with reason and preserve formula explanation', () => {
    const reportWithOverride = createMockReport({
      manualOverrideScore: 92.5,
      manualOverrideReason: 'Critical nursing home generator failure confirmed by coordinator',
    });

    const score = priorityService.calculate(reportWithOverride);
    expect(score.compositeScore).toBe(92.5);
    expect(score.breakdown.isOverride).toBe(true);
    expect(score.breakdown.overrideDetails?.overrideReason).toContain('nursing home generator failure');
    expect(score.breakdown.formula).toBeDefined();
  });
});
