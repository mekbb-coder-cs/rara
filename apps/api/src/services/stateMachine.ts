import { ReportStatus } from '@relieflink/shared';
import { BadRequestError } from '../utils/errors.js';

export const ALLOWED_REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  [ReportStatus.SUBMITTED]: [
    ReportStatus.UNDER_REVIEW,
    ReportStatus.VERIFIED,
    ReportStatus.REJECTED,
  ],
  [ReportStatus.UNDER_REVIEW]: [
    ReportStatus.VERIFIED,
    ReportStatus.REJECTED,
    ReportStatus.SUBMITTED, // Unlock/return to queue
  ],
  [ReportStatus.VERIFIED]: [
    ReportStatus.PRIORITIZED,
    ReportStatus.IN_PROGRESS,
    ReportStatus.MATCHED,
    ReportStatus.UNDER_REVIEW, // Re-triage if dispute
  ],
  [ReportStatus.PRIORITIZED]: [
    ReportStatus.MATCHED,
    ReportStatus.IN_PROGRESS,
    ReportStatus.VERIFIED,
  ],
  [ReportStatus.MATCHED]: [
    ReportStatus.IN_PROGRESS,
    ReportStatus.PRIORITIZED,
  ],
  [ReportStatus.IN_PROGRESS]: [
    ReportStatus.RESOLVED,
    ReportStatus.PRIORITIZED, // If aid fails and needs re-dispatch
  ],
  [ReportStatus.RESOLVED]: [
    ReportStatus.CLOSED,
    ReportStatus.IN_PROGRESS, // If recurring crisis
  ],
  [ReportStatus.CLOSED]: [
    ReportStatus.UNDER_REVIEW, // Appeal / Reopen
  ],
  [ReportStatus.REJECTED]: [
    ReportStatus.UNDER_REVIEW, // Coordinator appeal
  ],
};

export function validateReportTransition(
  currentStatus: ReportStatus,
  newStatus: ReportStatus
): boolean {
  if (currentStatus === newStatus) return true;
  const allowed = ALLOWED_REPORT_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

export function assertValidReportTransition(
  currentStatus: ReportStatus,
  newStatus: ReportStatus
): void {
  if (!validateReportTransition(currentStatus, newStatus)) {
    throw new BadRequestError(
      `Invalid report status transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${(
        ALLOWED_REPORT_TRANSITIONS[currentStatus] || []
      ).join(', ') || 'None'}`
    );
  }
}
