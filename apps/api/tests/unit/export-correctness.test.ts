import { describe, it, expect, beforeEach } from 'vitest';
import { auditService } from '../../src/services/audit.service.js';
import { analyticsService } from '../../src/services/analytics.service.js';
import { complianceService } from '../../src/services/compliance.service.js';
import { auditRepository, InMemoryAuditRepository } from '../../src/repositories/audit.repository.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { AuditAction, Role, HazardType, UrgencyLevel, ReportStatus } from '@relieflink/shared';

describe('Phase 8: Export Correctness Tests (CSV & GDPR)', () => {
  beforeEach(() => {
    if (auditRepository instanceof InMemoryAuditRepository) {
      auditRepository.logs = [];
    }
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
    }
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
    }
  });

  it('exports audit logs into compliant RFC 4180 CSV with correct headers and escaping', async () => {
    // Add audit log samples
    await auditRepository.createLog({
      userId: 'usr-admin-1',
      userRole: Role.ADMIN,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'SystemSetting',
      entityId: 'priority_weights',
      ipAddress: '192.168.1.100',
      metadata: {
        before: { weightSeverity: 3.5 },
        after: { weightSeverity: 4.5 },
      },
    });

    await auditRepository.createLog({
      userId: 'usr-resp-2',
      userRole: Role.RESPONDER,
      action: AuditAction.READ_PII,
      entityName: 'Report',
      entityId: 'rep-tig-99',
      ipAddress: '10.0.0.5',
      metadata: { reason: 'Calling reporter to verify rising water level' },
    });

    const csv = await auditService.exportAuditLogsToCsv();

    expect(typeof csv).toBe('string');
    const lines = csv.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);

    // Verify headers
    expect(lines[0]).toBe('Timestamp,ActorID,Role,Action,Entity,EntityID,Details,IPAddress');

    // Verify CSV contains entries for both actions and entities
    expect(csv).toContain('"SETTINGS_UPDATE"');
    expect(csv).toContain('"SystemSetting"');
    expect(csv).toContain('"usr-admin-1"');

    expect(csv).toContain('"READ_PII"');
    expect(csv).toContain('"Report"');
    expect(csv).toContain('"rep-tig-99"');
  });

  it('exports after-action disaster summary into structured CSV with timeline and expenditures', async () => {
    const report = await analyticsService.getAfterActionReport('reg-mekelle');
    const csv = auditService.exportAfterActionReportToCsv(report);

    expect(typeof csv).toBe('string');
    expect(csv).toContain('AFTER-ACTION CRISIS REPORT');
    expect(csv).toContain('RESOURCE EXPENDITURE');
    expect(csv).toContain('CHRONOLOGICAL TIMELINE OF CRITICAL EVENTS');
    expect(csv).toContain('"FOOD_WATER"');
    expect(csv).toContain('20L water jerrycans');
    expect(csv).toContain('Initial Flash Flood Inundation');
  });

  it('exports comprehensive GDPR user data bundle including submitted reports and audit events', async () => {
    const userId = 'usr-gdpr-subject-1';

    // Seed user
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.set(userId, {
        id: userId,
        email: 'subject@relieflink.local',
        phoneNumber: '+251-91-455-6677',
        fullName: 'Kidus Yohannes',
        role: Role.REPORTER,
        isVerifiedResponder: false,
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    }

    // Seed user submitted report
    await reportRepository.createReport({
      title: 'Water contamination notice',
      description: 'Well contaminated by mud runoff',
      hazardType: HazardType.FOOD_WATER,
      initialUrgency: UrgencyLevel.HIGH,
      latitude: 13.5,
      longitude: 39.47,
      approximateLocation: 'Mekelle Center',
      exactAddressEncrypted: 'Block B, Mekelle',
      peopleAffectedCount: 20,
      vulnerableGroups: [],
      isAnonymous: false,
      reporterId: userId,
      reporterName: 'Kidus Yohannes',
    });

    const exportBundle = await complianceService.exportUserData(userId);

    expect(exportBundle.user.id).toBe(userId);
    expect(exportBundle.user.email).toBe('subject@relieflink.local');
    expect(exportBundle.user.passwordHash).toBeUndefined(); // PII / credential protection
    expect(exportBundle.reportsSubmitted.length).toBe(1);
    expect(exportBundle.reportsSubmitted[0].title).toBe('Water contamination notice');
    expect(exportBundle.exportedAt).toBeDefined();
  });
});
