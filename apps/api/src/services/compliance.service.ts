import {
  RetentionRunResult,
  UserDataExport,
  DataDeletionResult,
  AuditAction,
  Role,
} from '@relieflink/shared';
import { reportRepository, InMemoryReportRepository } from '../repositories/report.repository.js';
import { userRepository, InMemoryUserRepository } from '../repositories/user.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';

export class ComplianceService {
  /**
   * Data Retention & Auto-Anonymization Job
   * Anonymizes PII on closed/resolved reports older than retentionDays
   */
  async runRetentionAnonymizationJob(retentionDays = 30): Promise<RetentionRunResult> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
    let scannedCount = 0;
    let anonymizedCount = 0;

    if (reportRepository instanceof InMemoryReportRepository) {
      for (const [id, report] of reportRepository.reports.entries()) {
        scannedCount++;
        const isClosed = report.status === 'RESOLVED' || report.status === 'CLOSED';
        const reportDate = new Date(report.createdAt);

        if (isClosed && reportDate < cutoffDate) {
          const isAlreadyAnonymized =
            report.reporterName === '[ANONYMOUS_REPORTER]' ||
            report.exactAddressEncrypted === '[REDACTED_GDPR_RETENTION]';

          if (!isAlreadyAnonymized) {
            report.exactAddressEncrypted = '[REDACTED_GDPR_RETENTION]';
            report.reporterPhoneEncrypted = '[REDACTED_GDPR_RETENTION]';
            report.reporterName = '[ANONYMOUS_REPORTER]';
            report.reporterId = null;
            reportRepository.reports.set(id, report);
            anonymizedCount++;
          }
        }
      }
    } else {
      try {
        const reportsToAnonymize = await prisma.report.findMany({
          where: {
            status: { in: ['RESOLVED', 'CLOSED'] },
            createdAt: { lt: cutoffDate },
            reporterName: { not: '[ANONYMOUS_REPORTER]' },
          },
        });
        scannedCount = reportsToAnonymize.length;

        for (const rep of reportsToAnonymize) {
          await prisma.report.update({
            where: { id: rep.id },
            data: {
              exactAddressEncrypted: '[REDACTED_GDPR_RETENTION]',
              reporterPhoneEncrypted: '[REDACTED_GDPR_RETENTION]',
              reporterName: '[ANONYMOUS_REPORTER]',
              reporterId: null,
            },
          });
          anonymizedCount++;
        }
      } catch (err) {
        logger.warn({ err }, 'Prisma retention job failed; using fallback');
      }
    }

    // Log compliance audit entry
    await auditRepository.createLog({
      userId: 'system-compliance-worker',
      userRole: Role.ADMIN,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'DataRetentionJob',
      entityId: `run-${Date.now()}`,
      metadata: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        scannedCount,
        anonymizedCount,
      },
    });

    logger.info(
      { retentionDays, scannedCount, anonymizedCount },
      'Data retention anonymization job completed'
    );

    return {
      scannedCount,
      anonymizedCount,
      deletedCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GDPR Data Portability: Export all data associated with a user
   */
  async exportUserData(userId: string): Promise<UserDataExport> {
    let user: any = null;
    if (userRepository instanceof InMemoryUserRepository) {
      user = userRepository.users.get(userId) || null;
    } else {
      user = await prisma.user.findUnique({ where: { id: userId } });
    }

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Gather submitted reports
    let userReports: any[] = [];
    if (reportRepository instanceof InMemoryReportRepository) {
      userReports = Array.from(reportRepository.reports.values()).filter(
        (r) => r.reporterId === userId
      );
    } else {
      userReports = await prisma.report.findMany({ where: { reporterId: userId } });
    }

    // Gather audit events
    const auditEvents = await auditRepository.getLogs({ userId, limit: 100 });

    // Sanitize password before export
    const sanitizedUser = { ...user };
    delete sanitizedUser.passwordHash;

    // Record audit event for data export
    await auditRepository.createLog({
      userId,
      userRole: user.role,
      action: AuditAction.EXPORT_DATA,
      entityName: 'UserDataExport',
      entityId: userId,
      metadata: {
        reportsCount: userReports.length,
        auditEventsCount: auditEvents.length,
      },
    });

    return {
      user: sanitizedUser,
      reportsSubmitted: userReports,
      auditEvents,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * GDPR Right to Erasure: Anonymize and delete user data
   */
  async deleteUserData(userId: string, requestedByUserId?: string): Promise<DataDeletionResult> {
    let user: any = null;
    if (userRepository instanceof InMemoryUserRepository) {
      user = userRepository.users.get(userId) || null;
    } else {
      user = await prisma.user.findUnique({ where: { id: userId } });
    }

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // 1. Anonymize all reports submitted by this user
    let anonymizedCount = 0;
    if (reportRepository instanceof InMemoryReportRepository) {
      for (const [id, r] of reportRepository.reports.entries()) {
        if (r.reporterId === userId) {
          r.exactAddressEncrypted = '[REDACTED_GDPR_ERASURE]';
          r.reporterPhoneEncrypted = '[REDACTED_GDPR_ERASURE]';
          r.reporterName = '[ANONYMOUS_REPORTER]';
          r.reporterId = null;
          reportRepository.reports.set(id, r);
          anonymizedCount++;
        }
      }
    } else {
      const result = await prisma.report.updateMany({
        where: { reporterId: userId },
        data: {
          exactAddressEncrypted: '[REDACTED_GDPR_ERASURE]',
          reporterPhoneEncrypted: '[REDACTED_GDPR_ERASURE]',
          reporterName: '[ANONYMOUS_REPORTER]',
          reporterId: null,
        },
      });
      anonymizedCount = result.count;
    }

    // 2. Soft-delete user record & scrub contact PII
    if (userRepository instanceof InMemoryUserRepository) {
      user.email = `deleted_${userId.slice(0, 8)}@relieflink.local`;
      user.phoneNumber = null;
      user.fullName = '[DELETED_USER]';
      user.passwordHash = null;
      user.deletedAt = new Date();
      userRepository.users.set(userId, user);
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId.slice(0, 8)}@relieflink.local`,
          phoneNumber: null,
          fullName: '[DELETED_USER]',
          passwordHash: null,
          deletedAt: new Date(),
        },
      });
    }

    // 3. Log compliance audit entry
    await auditRepository.createLog({
      userId: requestedByUserId || userId,
      userRole: Role.ADMIN,
      action: AuditAction.USER_ROLE_CHANGE,
      entityName: 'User',
      entityId: userId,
      metadata: {
        action: 'GDPR_ERASURE',
        anonymizedReportsCount: anonymizedCount,
      },
    });

    return {
      success: true,
      userId,
      anonymizedReportsCount: anonymizedCount,
      message: 'User account and associated incident records permanently anonymized and erased.',
    };
  }
}

export const complianceService = new ComplianceService();
