import { describe, it, expect, beforeEach } from 'vitest';
import { complianceService } from '../../src/services/compliance.service.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { auditRepository, InMemoryAuditRepository } from '../../src/repositories/audit.repository.js';
import { HazardType, UrgencyLevel, ReportStatus } from '@relieflink/shared';

describe('Phase 8: Data Retention & Anonymization Job Tests', () => {
  beforeEach(() => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
    }
    if (auditRepository instanceof InMemoryAuditRepository) {
      auditRepository.logs = [];
    }
  });

  it('anonymizes sensitive PII on resolved reports older than retention threshold', async () => {
    // 1. Create old resolved report (45 days old)
    const oldDate = new Date(Date.now() - 45 * 24 * 3600 * 1000);
    const { report: oldReport } = await reportRepository.createReport({
      title: 'Old Flood Incident in Ayder',
      description: 'Historical flood waters affecting residential block',
      hazardType: HazardType.FLOOD,
      initialUrgency: UrgencyLevel.HIGH,
      latitude: 13.498,
      longitude: 39.475,
      approximateLocation: 'Ayder Subcity, Mekelle',
      exactAddressEncrypted: 'House 41, Street 12, Ayder',
      peopleAffectedCount: 8,
      vulnerableGroups: ['elderly'],
      isAnonymous: false,
      reporterName: 'Almaz Gebre',
      reporterPhoneEncrypted: '+251-91-499-8877',
      status: ReportStatus.RESOLVED,
    });

    // Manually age the report in memory
    if (reportRepository instanceof InMemoryReportRepository) {
      const stored = reportRepository.reports.get(oldReport.id)!;
      stored.createdAt = oldDate;
      stored.status = ReportStatus.RESOLVED;
      reportRepository.reports.set(oldReport.id, stored);
    }

    // 2. Create recent resolved report (5 days old)
    const { report: recentReport } = await reportRepository.createReport({
      title: 'Recent Medical Emergency in Axum',
      description: 'Clinic supplies dispatched yesterday',
      hazardType: HazardType.MEDICAL,
      initialUrgency: UrgencyLevel.CRITICAL,
      latitude: 14.123,
      longitude: 38.724,
      approximateLocation: 'Axum General Hospital',
      exactAddressEncrypted: 'ER Ward Room 4, Axum',
      peopleAffectedCount: 3,
      vulnerableGroups: ['injured'],
      isAnonymous: false,
      reporterName: 'Berhane K.',
      reporterPhoneEncrypted: '+251-91-411-2233',
      status: ReportStatus.RESOLVED,
    });

    // 3. Create active unresolved old report (40 days old, still in progress)
    const { report: activeOldReport } = await reportRepository.createReport({
      title: 'Unresolved Road Blockage in Shire',
      description: 'Debris still impassable across corridor',
      hazardType: HazardType.ROAD_BLOCKED,
      initialUrgency: UrgencyLevel.MEDIUM,
      latitude: 14.103,
      longitude: 38.286,
      approximateLocation: 'Shire Highway Exit 2',
      exactAddressEncrypted: 'Milepost 18, Shire',
      peopleAffectedCount: 50,
      vulnerableGroups: [],
      isAnonymous: false,
      reporterName: 'Dawit T.',
      reporterPhoneEncrypted: '+251-91-433-4455',
      status: ReportStatus.IN_PROGRESS,
    });
    if (reportRepository instanceof InMemoryReportRepository) {
      const stored = reportRepository.reports.get(activeOldReport.id)!;
      stored.createdAt = oldDate;
      reportRepository.reports.set(activeOldReport.id, stored);
    }

    // Run retention anonymization job with 30-day threshold
    const result = await complianceService.runRetentionAnonymizationJob(30);

    expect(result.anonymizedCount).toBe(1);

    // Verify old resolved report was anonymized
    const scrubbed = (await reportRepository.findById(oldReport.id))!.report;
    expect(scrubbed.reporterName).toBe('[ANONYMOUS_REPORTER]');
    expect(scrubbed.reporterPhoneEncrypted).toBe('[REDACTED_GDPR_RETENTION]');
    expect(scrubbed.exactAddressEncrypted).toBe('[REDACTED_GDPR_RETENTION]');

    // Verify recent report retained PII
    const keptRecent = (await reportRepository.findById(recentReport.id))!.report;
    expect(keptRecent.reporterName).toBe('Berhane K.');
    expect(keptRecent.reporterPhoneEncrypted).toBe('+251-91-411-2233');

    // Verify active unresolved report retained PII (not closed)
    const keptActive = (await reportRepository.findById(activeOldReport.id))!.report;
    expect(keptActive.reporterName).toBe('Dawit T.');
  });
});
