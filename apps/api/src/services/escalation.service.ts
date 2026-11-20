import { coordinationRepository } from '../repositories/coordination.repository.js';
import { reportRepository } from '../repositories/report.repository.js';
import { matchingRepository } from '../repositories/matching.repository.js';
import { notificationService } from './notification.service.js';
import {
  NotificationType,
  NotificationChannel,
  EscalationAlertRecord,
} from '@relieflink/shared';
import { logger } from '../config/logger.js';

export interface CheckStalledReportsResult {
  unverifiedStalledCount: number;
  unmatchedStalledCount: number;
  newAlerts: EscalationAlertRecord[];
}

export class EscalationService {
  /**
   * Scans reports in active regions to detect cases that exceeded configurable thresholds.
   * - UNVERIFIED_STALLED: status is SUBMITTED and age > unverifiedThresholdMinutes
   * - UNMATCHED_STALLED: status is VERIFIED, has open aid needs, but no confirmed matches/tasks > unmatchedThresholdMinutes
   */
  async checkStalledReports(now: Date = new Date()): Promise<CheckStalledReportsResult> {
    const defaultRegionId = 'reg-tigray-all';
    const rule = await coordinationRepository.getEscalationRule(defaultRegionId);
    const unverifiedThresholdMins = rule?.unverifiedThresholdMinutes || 30;
    const unmatchedThresholdMins = rule?.unmatchedThresholdMinutes || 60;

    const unverifiedCutoff = new Date(now.getTime() - unverifiedThresholdMins * 60 * 1000);
    const unmatchedCutoff = new Date(now.getTime() - unmatchedThresholdMins * 60 * 1000);

    const existingAlerts = await coordinationRepository.listEscalationAlerts();
    const existingAlertReportIds = new Set(existingAlerts.map((a) => a.reportId));

    const newAlerts: EscalationAlertRecord[] = [];
    let unverifiedCount = 0;
    let unmatchedCount = 0;

    // 1. Check for unverified reports past threshold
    const triageResult = await reportRepository.getTriageQueue({
      status: 'SUBMITTED',
    });
    const submittedReports = triageResult.reports.map((item) => item.report);

    for (const report of submittedReports) {
      const createdAt = new Date(report.createdAt);
      if (createdAt <= unverifiedCutoff && !existingAlertReportIds.has(report.id)) {
        unverifiedCount++;
        const waitingMinutes = Math.round((now.getTime() - createdAt.getTime()) / 60000);

        const alert = await coordinationRepository.createEscalationAlert({
          reportId: report.id,
          reportTrackingCode: report.trackingCode,
          reportTitle: report.title,
          regionId: report.regionId || defaultRegionId,
          reason: 'UNVERIFIED_STALLED',
          waitingMinutes,
        });

        newAlerts.push(alert);
        existingAlertReportIds.add(report.id);

        // Notify emergency coordinators
        await notificationService.dispatchNotification({
          type: NotificationType.CASE_ESCALATED,
          title: `⚠️ Stalled Case Alert: ${report.trackingCode}`,
          body: `Incident "${report.title}" has waited unverified for ${waitingMinutes} minutes. Immediate coordinator triage required.`,
          priority: 'CRITICAL',
          channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
          metadata: { reportId: report.id, trackingCode: report.trackingCode },
        });

        logger.warn(
          { reportId: report.id, trackingCode: report.trackingCode, waitingMinutes },
          'Case escalated to coordinators due to unverified stall'
        );
      }
    }

    // 2. Check for verified reports with open needs that remain unmatched
    const openNeeds = await matchingRepository.listAidNeeds({ status: 'OPEN' });

    for (const need of openNeeds.needs) {
      const needCreatedAt = new Date(need.createdAt);
      if (
        needCreatedAt <= unmatchedCutoff &&
        !existingAlertReportIds.has(need.reportId)
      ) {
        unmatchedCount++;
        const waitingMinutes = Math.round(
          (now.getTime() - needCreatedAt.getTime()) / 60000
        );

        const alert = await coordinationRepository.createEscalationAlert({
          reportId: need.reportId,
          reportTrackingCode: need.reportTrackingCode,
          reportTitle: need.reportTitle,
          regionId: defaultRegionId,
          reason: 'UNMATCHED_STALLED',
          waitingMinutes,
        });

        newAlerts.push(alert);
        existingAlertReportIds.add(need.reportId);

        await notificationService.dispatchNotification({
          type: NotificationType.CASE_ESCALATED,
          title: `⚠️ Unmatched Aid Need Alert: ${need.reportTrackingCode}`,
          body: `Aid need for ${need.quantityRequired} ${need.unit} of ${need.aidType} remains unmatched for ${waitingMinutes} minutes.`,
          priority: 'CRITICAL',
          channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
          metadata: { reportId: need.reportId, needId: need.id },
        });

        logger.warn(
          { reportId: need.reportId, needId: need.id, waitingMinutes },
          'Case escalated to coordinators due to unmatched aid need stall'
        );
      }
    }

    return {
      unverifiedStalledCount: unverifiedCount,
      unmatchedStalledCount: unmatchedCount,
      newAlerts,
    };
  }
}

export const escalationService = new EscalationService();
