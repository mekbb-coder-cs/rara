import { describe, it, expect, beforeEach } from 'vitest';
import { escalationService } from '../../src/services/escalation.service.js';
import { coordinationRepository } from '../../src/repositories/coordination.repository.js';
import { reportRepository } from '../../src/repositories/report.repository.js';
import { matchingRepository } from '../../src/repositories/matching.repository.js';

describe('Escalation Timers & Stalled Cases Unit Tests', () => {
  beforeEach(() => {
    // Fresh state
  });

  it('triggers UNVERIFIED_STALLED escalation when a report remains unverified past threshold', async () => {
    const fixedNow = new Date('2026-11-20T12:00:00Z');
    // Create an unverified report created 45 minutes ago (threshold is 30 min)
    const { report } = await reportRepository.createReport({
      title: 'Stalled Flood Report in Axum',
      description: 'Flood waters rising near central market, residents need rescue.',
      hazardType: 'FLOOD',
      severity: 'HIGH',
      approximateLocation: 'Axum Central Market',
      latitude: 14.12,
      longitude: 38.72,
      peopleAffectedCount: 20,
    });

    // Artificially age the report to 45 mins ago
    const storedReport = (reportRepository as any).reports?.get(report.id);
    if (storedReport) {
      storedReport.createdAt = new Date(fixedNow.getTime() - 45 * 60 * 1000);
    }

    const result = await escalationService.checkStalledReports(fixedNow);
    expect(result.unverifiedStalledCount).toBeGreaterThanOrEqual(1);

    const alert = result.newAlerts.find((a) => a.reportId === report.id);
    expect(alert).toBeDefined();
    expect(alert?.reason).toBe('UNVERIFIED_STALLED');
    expect(alert?.waitingMinutes).toBeGreaterThanOrEqual(44);
  });

  it('triggers UNMATCHED_STALLED escalation when verified case aid need remains open past threshold', async () => {
    const fixedNow = new Date('2026-11-20T12:00:00Z');
    const { report } = await reportRepository.createReport({
      title: 'Verified Need in Shire',
      description: 'Medical supplies required for displaced clinic.',
      hazardType: 'MEDICAL',
      severity: 'CRITICAL',
      approximateLocation: 'Shire Town Clinic',
      latitude: 14.10,
      longitude: 38.28,
      peopleAffectedCount: 35,
    });
    await reportRepository.updateReportStatusWithLock({
      reportId: report.id,
      status: 'VERIFIED',
      reason: 'Field verified by responder',
      userId: 'test-user',
    });

    const need = await matchingRepository.createAidNeed({
      reportId: report.id,
      reportTitle: report.title,
      reportTrackingCode: report.trackingCode,
      aidType: 'MEDICAL',
      quantityRequired: 50,
      unit: 'emergency trauma kits',
      urgency: 'CRITICAL',
      latitude: report.latitude,
      longitude: report.longitude,
    });

    // Artificially age the need to 75 mins ago (threshold is 60 min)
    const storedNeed = (matchingRepository as any).needs?.get(need.id);
    if (storedNeed) {
      storedNeed.createdAt = new Date(fixedNow.getTime() - 75 * 60 * 1000).toISOString();
    }

    const result = await escalationService.checkStalledReports(fixedNow);
    expect(result.unmatchedStalledCount).toBeGreaterThanOrEqual(1);

    const alert = result.newAlerts.find((a) => a.reportId === report.id);
    expect(alert).toBeDefined();
    expect(alert?.reason).toBe('UNMATCHED_STALLED');
    expect(alert?.waitingMinutes).toBeGreaterThanOrEqual(74);
  });

  it('does not trigger escalation if report was created recently within threshold', async () => {
    const fixedNow = new Date('2026-11-20T12:00:00Z');
    // Report created only 10 minutes ago (well under 30 min threshold)
    const { report: freshReport } = await reportRepository.createReport({
      title: 'Fresh Report in Adigrat',
      description: 'Minor road block.',
      hazardType: 'ROAD_BLOCKED',
      severity: 'LOW',
      approximateLocation: 'Adigrat North Road',
      latitude: 14.27,
      longitude: 39.46,
      peopleAffectedCount: 5,
    });
    (freshReport as any).createdAt = new Date(fixedNow.getTime() - 10 * 60 * 1000).toISOString();

    const result = await escalationService.checkStalledReports(fixedNow);
    const alert = result.newAlerts.find((a) => a.reportId === freshReport.id);
    expect(alert).toBeUndefined();
  });
});
