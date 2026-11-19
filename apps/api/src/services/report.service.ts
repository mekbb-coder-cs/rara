import crypto from 'node:crypto';
import {
  CreateReportInput,
  OfflineSyncInput,
  CreateReportUpdateInput,
  CreateAbuseFlagInput,
  PublicReportFeedQuery,
  AuditAction,
  HazardType,
  ReportStatus,
  AbuseFlagReason,
  VerificationMethod,
  VerifyReportInput,
  UpdateReportStatusInput,
  PriorityOverrideInput,
  TriageQueueQuery,
  BulkActionInput,
  RequestMoreInfoInput,
  Role,
} from '@relieflink/shared';
import { reportRepository, ReportRecord, ReportMediaRecord } from '../repositories/report.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { validateAndSanitizeMedia } from '../utils/media.js';
import { obfuscateCoordinatesForPublic, obfuscateAddressForPublic } from '../utils/geo.js';
import { generateAnonymousToken } from '../utils/crypto.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';
import { priorityService } from './priority.service.js';
import { assertValidReportTransition } from './stateMachine.js';
import {
  broadcastReportCreated,
  broadcastReportStatusChanged,
  broadcastPriorityUpdated,
  broadcastReportLocked,
  broadcastReportUnlocked,
} from '../socket/index.js';
import { logger } from '../config/logger.js';

export interface ReportSubmissionResult {
  reportId: string;
  trackingCode: string;
  status: ReportStatus;
  isDuplicate: boolean;
  duplicateClusterId: string | null;
  corroborationCount: number;
  anonymousTrackingToken?: string;
  version: number;
  priorityScore?: number;
  notice: string;
}

export interface PublicSanitizedReport {
  id: string;
  trackingCode: string;
  title: string;
  description: string;
  hazardType: HazardType;
  status: ReportStatus;
  severity: string;
  approximateLocation: string;
  latitude: number;
  longitude: number;
  peopleAffectedCount: number;
  vulnerableGroups: string[];
  duplicateClusterId: string | null;
  isMasterInCluster: boolean;
  mediaUrls: string[];
  createdAt: string;
}

export class ReportService {
  /**
   * Submits a new crisis report with idempotency, anti-abuse, duplicate detection,
   * priority score initialization, and real-time dispatch
   */
  async submitReport(
    input: CreateReportInput,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    idempotencyKey?: string,
    offlineCreatedAt?: Date
  ): Promise<ReportSubmissionResult> {
    const activeIdempotencyKey = idempotencyKey || input.idempotencyKey;

    // 1. Idempotency Check
    if (activeIdempotencyKey) {
      const existingCached = await reportRepository.getIdempotencyResponse(activeIdempotencyKey);
      if (existingCached) {
        logger.info({ key: activeIdempotencyKey }, 'Returning cached idempotent report submission');
        return existingCached.body as ReportSubmissionResult;
      }

      const existingReport = await reportRepository.findByIdempotencyKey(activeIdempotencyKey);
      if (existingReport) {
        const token = input.isAnonymous
          ? generateAnonymousToken({ reportId: existingReport.id, trackingCode: existingReport.trackingCode })
          : undefined;
        return {
          reportId: existingReport.id,
          trackingCode: existingReport.trackingCode,
          status: existingReport.status,
          isDuplicate: !!existingReport.duplicateClusterId && !existingReport.isMasterInCluster,
          duplicateClusterId: existingReport.duplicateClusterId,
          corroborationCount: 1,
          anonymousTrackingToken: token,
          version: existingReport.version,
          notice:
            'For life-threatening emergencies, call your local emergency number immediately. ReliefLink does not replace official emergency services.',
        };
      }
    }

    // 2. Anti-Abuse: Honeypot Trap
    const isBot = Boolean(input.honeypot && input.honeypot.trim().length > 0);

    // 3. Compute privacy-preserving hashed IP
    const ipHash = ipAddress
      ? crypto.createHash('sha256').update(ipAddress + '_relieflink_salt').digest('hex')
      : undefined;

    // 4. Repeated False Report Detection
    let isQuarantined = false;
    if (ipHash || userId) {
      const abuseCount = await reportRepository.getUserAbuseCount({ ipHash, userId });
      if (abuseCount >= 3) {
        isQuarantined = true;
        logger.warn({ ipHash, userId, abuseCount }, 'Quarantining report from suspected repeat-abuse source');
      }
    }

    // 5. Media Validation & EXIF Stripping
    const sanitizedMedia = validateAndSanitizeMedia(input.media || []);

    // 6. Generate approximate location text
    const approximateLocation = obfuscateAddressForPublic(input.address);

    // 7. Initial Urgency
    const initialUrgency = input.severity;

    // 8. Create Report Record
    const initialStatus = isBot || isQuarantined ? ReportStatus.REJECTED : ReportStatus.SUBMITTED;

    const { report } = await reportRepository.createReport({
      title: input.title || `${input.type.replace('_', ' ')} incident near ${approximateLocation}`,
      description: input.description,
      hazardType: input.type,
      initialUrgency,
      latitude: input.latitude,
      longitude: input.longitude,
      approximateLocation,
      exactAddressEncrypted: input.address,
      peopleAffectedCount: input.peopleAffectedCount,
      vulnerableGroups: input.vulnerableGroups,
      isAnonymous: input.isAnonymous,
      reporterId: input.isAnonymous ? undefined : userId,
      reporterName: input.isAnonymous ? undefined : input.reporterName,
      reporterPhoneEncrypted: input.isAnonymous ? undefined : input.contactPhone,
      reporterIpHash: ipHash,
      idempotencyKey: activeIdempotencyKey,
      offlineCreatedAt,
      isHoneypotTriggered: isBot,
      status: initialStatus,
      media: sanitizedMedia,
    });

    if (isBot) {
      logger.warn({ reportId: report.id, ipHash }, 'Spam bot blocked by honeypot');
      await reportRepository.createAbuseFlag({
        reportId: report.id,
        reason: AbuseFlagReason.SPAM,
        details: 'honeypot trap triggered by automated submission bot',
      });
    }

    // 9. Spatial Deduplication (500m radius, 2-hour window)
    let isDuplicate = false;
    let clusterId: string | null = null;
    let corroborationCount = 1;

    if (!isBot && initialStatus !== ReportStatus.REJECTED) {
      const duplicates = await reportRepository.findNearbyDuplicates({
        hazardType: input.type,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMeters: 500.0,
        timeWindowHours: 2.0,
      });

      const existingCandidate = duplicates.find((d) => d.id !== report.id);
      if (existingCandidate) {
        const clusterResult = await reportRepository.assignToDuplicateCluster(report.id, existingCandidate);
        clusterId = clusterResult.clusterId;
        corroborationCount = clusterResult.corroborationCount;
        isDuplicate = true;
        logger.info(
          { reportId: report.id, masterReportId: existingCandidate.id, clusterId, corroborationCount },
          'Incident report matched with existing crisis cluster'
        );
      }
    }

    // 10. Compute Initial Explainable PriorityScore
    const priorityCalc = priorityService.calculate(
      report,
      corroborationCount,
      undefined,
      false,
      new Date()
    );
    await reportRepository.savePriorityScore(report.id, priorityCalc);

    // 11. Anonymous Tracking Token
    const anonymousTrackingToken =
      input.isAnonymous || !userId
        ? generateAnonymousToken({ reportId: report.id, trackingCode: report.trackingCode })
        : undefined;

    // 12. Audit Logging
    await auditRepository.createLog({
      userId,
      action: AuditAction.CREATE_REPORT,
      entityName: 'Report',
      entityId: report.id,
      ipAddress,
      userAgent,
      metadata: {
        hazardType: input.type,
        isDuplicate,
        clusterId,
        trackingCode: report.trackingCode,
        priorityScore: priorityCalc.compositeScore,
      },
    });

    // 13. Real-time broadcast to responders
    broadcastReportCreated(report, report.regionId);
    broadcastPriorityUpdated({
      reportId: report.id,
      compositeScore: priorityCalc.compositeScore,
      breakdown: priorityCalc.breakdown,
      regionId: report.regionId,
    });

    const result: ReportSubmissionResult = {
      reportId: report.id,
      trackingCode: report.trackingCode,
      status: report.status,
      isDuplicate,
      duplicateClusterId: clusterId,
      corroborationCount,
      anonymousTrackingToken,
      version: report.version,
      priorityScore: priorityCalc.compositeScore,
      notice:
        'For life-threatening emergencies, call your local emergency number immediately. ReliefLink does not replace official emergency services.',
    };

    // 14. Save Idempotency Cache
    if (activeIdempotencyKey) {
      await reportRepository.saveIdempotencyResponse(activeIdempotencyKey, 201, result);
    }

    return result;
  }

  /**
   * Synchronizes a batch of reports recorded offline
   */
  async syncOfflineBatch(
    input: OfflineSyncInput,
    userId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Array<ReportSubmissionResult & { localId: string }>> {
    const results: Array<ReportSubmissionResult & { localId: string }> = [];

    for (const item of input.reports) {
      const offlineDate = new Date(item.offlineCreatedAt);
      if (isNaN(offlineDate.getTime())) {
        throw new BadRequestError(`Invalid offline timestamp: ${item.offlineCreatedAt}`);
      }

      const idempotencyKey = item.idempotencyKey || crypto.createHash('md5').update(item.localId).digest('hex');

      const submission = await this.submitReport(
        {
          ...item,
          idempotencyKey: undefined,
        },
        userId,
        ipAddress,
        userAgent,
        idempotencyKey,
        offlineDate
      );

      results.push({
        ...submission,
        localId: item.localId,
      });
    }

    return results;
  }

  /**
   * Responder Verification Workflow:
   * Sets VERIFIED or REJECTED with mandatory notes and verification method.
   * Recalculates PriorityScore and broadcasts real-time updates.
   */
  async verifyReport(
    reportId: string,
    input: VerifyReportInput,
    verifiedById: string,
    userRole?: Role,
    ipAddress?: string
  ): Promise<{
    reportId: string;
    status: ReportStatus;
    version: number;
    priorityScore: number;
    breakdown: any;
  }> {
    const found = await reportRepository.findById(reportId);
    if (!found) throw new NotFoundError('Report not found');

    const targetStatus = input.status === 'VERIFIED' ? ReportStatus.VERIFIED : ReportStatus.REJECTED;

    // Validate state transition
    assertValidReportTransition(found.report.status, targetStatus);

    // Apply verification with optimistic lock check
    const { report } = await reportRepository.verifyReportWithLock({
      reportId,
      status: input.status,
      method: input.method as VerificationMethod,
      confidence: input.confidence,
      notes: input.reason,
      verifiedById,
      expectedVersion: input.expectedVersion,
    });

    // Recalculate explainable PriorityScore
    const corroborationCount = found.cluster ? found.cluster.corroborationCount : 1;
    const priorityCalc = priorityService.calculate(
      report,
      corroborationCount,
      input.method,
      false,
      new Date()
    );
    await reportRepository.savePriorityScore(report.id, priorityCalc);

    // Audit Log
    await auditRepository.createLog({
      userId: verifiedById,
      userRole,
      action: AuditAction.VERIFY_REPORT,
      entityName: 'Report',
      entityId: report.id,
      ipAddress,
      metadata: {
        verificationOutcome: input.status,
        method: input.method,
        confidence: input.confidence,
        reason: input.reason,
        newPriorityScore: priorityCalc.compositeScore,
      },
    });

    // Broadcast real-time Socket.IO updates
    broadcastReportStatusChanged({
      reportId: report.id,
      trackingCode: report.trackingCode,
      oldStatus: found.report.status,
      newStatus: report.status,
      regionId: report.regionId,
      updatedBy: verifiedById,
      version: report.version,
    });

    broadcastPriorityUpdated({
      reportId: report.id,
      compositeScore: priorityCalc.compositeScore,
      breakdown: priorityCalc.breakdown,
      regionId: report.regionId,
    });

    return {
      reportId: report.id,
      status: report.status,
      version: report.version,
      priorityScore: priorityCalc.compositeScore,
      breakdown: priorityCalc.breakdown,
    };
  }

  /**
   * Transitions Report Status in accordance with the lifecycle state machine
   */
  async updateReportStatus(
    reportId: string,
    input: UpdateReportStatusInput,
    userId: string,
    userRole?: Role,
    ipAddress?: string
  ): Promise<{
    reportId: string;
    previousStatus: ReportStatus;
    newStatus: ReportStatus;
    version: number;
    priorityScore: number;
  }> {
    const found = await reportRepository.findById(reportId);
    if (!found) throw new NotFoundError('Report not found');

    // State transition guard
    assertValidReportTransition(found.report.status, input.newStatus);

    if (input.newStatus === ReportStatus.REJECTED && (!input.reason || input.reason.trim().length === 0)) {
      throw new BadRequestError('A mandatory rejection reason is required when rejecting a report');
    }

    const { report } = await reportRepository.updateReportStatusWithLock({
      reportId,
      newStatus: input.newStatus,
      expectedVersion: input.expectedVersion,
      userId,
      notes: input.reason,
    });

    // Recalculate Priority Score
    const corroborationCount = found.cluster ? found.cluster.corroborationCount : 1;
    const priorityCalc = priorityService.calculate(
      report,
      corroborationCount,
      found.verification?.method,
      false,
      new Date()
    );
    await reportRepository.savePriorityScore(report.id, priorityCalc);

    // Audit Log
    await auditRepository.createLog({
      userId,
      userRole,
      action: AuditAction.UPDATE_REPORT_STATUS,
      entityName: 'Report',
      entityId: report.id,
      ipAddress,
      metadata: {
        fromStatus: found.report.status,
        toStatus: input.newStatus,
        reason: input.reason,
      },
    });

    broadcastReportStatusChanged({
      reportId: report.id,
      trackingCode: report.trackingCode,
      oldStatus: found.report.status,
      newStatus: report.status,
      regionId: report.regionId,
      updatedBy: userId,
      version: report.version,
    });

    broadcastPriorityUpdated({
      reportId: report.id,
      compositeScore: priorityCalc.compositeScore,
      breakdown: priorityCalc.breakdown,
      regionId: report.regionId,
    });

    return {
      reportId: report.id,
      previousStatus: found.report.status,
      newStatus: report.status,
      version: report.version,
      priorityScore: priorityCalc.compositeScore,
    };
  }

  /**
   * Acquire Active Triage Lock (optimistic concurrency guard)
   */
  async lockReport(
    reportId: string,
    userId: string,
    expectedVersion?: number
  ): Promise<{ reportId: string; lockedById: string; version: number }> {
    const report = await reportRepository.lockReport({ reportId, userId, expectedVersion });
    broadcastReportLocked({
      reportId: report.id,
      lockedById: userId,
      regionId: report.regionId,
    });
    return {
      reportId: report.id,
      lockedById: userId,
      version: report.version,
    };
  }

  /**
   * Release Active Triage Lock
   */
  async unlockReport(
    reportId: string,
    userId: string
  ): Promise<{ reportId: string; unlocked: boolean }> {
    const report = await reportRepository.unlockReport({ reportId, userId });
    broadcastReportUnlocked({
      reportId: report.id,
      regionId: report.regionId,
    });
    return { reportId: report.id, unlocked: true };
  }

  /**
   * Assign or Unassign Responder
   */
  async assignResponder(
    reportId: string,
    responderId: string | null,
    currentUserId: string,
    expectedVersion?: number
  ): Promise<{ reportId: string; assignedResponderId: string | null; version: number }> {
    const report = await reportRepository.assignResponder({
      reportId,
      responderId,
      expectedVersion,
    });

    broadcastReportStatusChanged({
      reportId: report.id,
      trackingCode: report.trackingCode,
      oldStatus: report.status,
      newStatus: report.status,
      regionId: report.regionId,
      updatedBy: currentUserId,
      version: report.version,
    });

    return {
      reportId: report.id,
      assignedResponderId: report.assignedResponderId,
      version: report.version,
    };
  }

  /**
   * Override Priority Score with mandatory justification note
   */
  async overridePriority(
    reportId: string,
    input: PriorityOverrideInput,
    userId: string,
    userRole?: Role,
    ipAddress?: string
  ): Promise<{ reportId: string; newScore: number; breakdown: any }> {
    const report = await reportRepository.overridePriority({
      reportId,
      overrideScore: input.overrideScore,
      overrideReason: input.overrideReason,
      userId,
      expectedVersion: input.expectedVersion,
    });

    const priorityCalc = priorityService.calculate(report, 1, undefined, false, new Date());
    await reportRepository.savePriorityScore(report.id, priorityCalc);

    await auditRepository.createLog({
      userId,
      userRole,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'ReportPriority',
      entityId: report.id,
      ipAddress,
      metadata: {
        overrideScore: input.overrideScore,
        overrideReason: input.overrideReason,
      },
    });

    broadcastPriorityUpdated({
      reportId: report.id,
      compositeScore: priorityCalc.compositeScore,
      breakdown: priorityCalc.breakdown,
      regionId: report.regionId,
    });

    return {
      reportId: report.id,
      newScore: priorityCalc.compositeScore,
      breakdown: priorityCalc.breakdown,
    };
  }

  /**
   * Request More Info from the reporter (timeline note)
   */
  async requestMoreInfo(
    reportId: string,
    input: RequestMoreInfoInput,
    userId: string
  ): Promise<{ updateId: string; message: string }> {
    const update = await reportRepository.addReportUpdate({
      reportId,
      authorId: userId,
      note: `Responder requested more info: ${input.message}`,
      isPublic: true,
    });

    return {
      updateId: update.id,
      message: 'Request for more information posted to timeline',
    };
  }

  /**
   * Query the live Triage Queue with filters and priority ordering
   */
  async getTriageQueue(
    query: TriageQueueQuery,
    user: { id: string; role: Role; assignedRegions?: string[] }
  ): Promise<{
    reports: Array<{
      id: string;
      trackingCode: string;
      title: string;
      description: string;
      hazardType: HazardType;
      status: ReportStatus;
      severity: UrgencyLevel;
      approximateLocation: string;
      latitude: number;
      longitude: number;
      peopleAffectedCount: number;
      vulnerableGroups: string[];
      corroborationCount: number;
      priorityScore: number;
      priorityBreakdown: any;
      version: number;
      assignedResponderId: string | null;
      lockedById: string | null;
      lockedAt: string | null;
      verificationStatus: string;
      createdAt: string;
    }>;
    total: number;
  }> {
    // Determine regional scoping: Coordinators/Admins see all or filtered,
    // Responders are scoped to their assigned regions
    const userRegions =
      user.role === Role.ADMIN || user.role === Role.COORDINATOR
        ? query.regionId
          ? [query.regionId]
          : undefined
        : user.assignedRegions && user.assignedRegions.length > 0
        ? user.assignedRegions
        : undefined;

    const { reports, total } = await reportRepository.getTriageQueue(
      query,
      userRegions,
      user.id
    );

    const formatted = reports.map((item) => {
      const score = item.priorityScore?.compositeScore ?? 0;
      return {
        id: item.report.id,
        trackingCode: item.report.trackingCode,
        title: item.report.title,
        description: item.report.description,
        hazardType: item.report.hazardType,
        status: item.report.status,
        severity: item.report.initialUrgency,
        approximateLocation: item.report.approximateLocation,
        latitude: item.report.latitude,
        longitude: item.report.longitude,
        peopleAffectedCount: item.report.peopleAffectedCount,
        vulnerableGroups: item.report.vulnerableGroups,
        corroborationCount: item.corroborationCount,
        priorityScore: score,
        priorityBreakdown: item.priorityScore?.calculationBreakdown || null,
        version: item.report.version,
        assignedResponderId: item.report.assignedResponderId,
        lockedById: item.report.lockedById,
        lockedAt: item.report.lockedAt ? item.report.lockedAt.toISOString() : null,
        verificationStatus: item.verification?.status || 'UNVERIFIED',
        createdAt: item.report.createdAt.toISOString(),
      };
    });

    return { reports: formatted, total };
  }

  /**
   * Reveal Sensitive Contact Details (Audit Log Mandatory!)
   */
  async revealSensitiveDetails(
    reportId: string,
    user: { id: string; role: Role; assignedRegions?: string[] },
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    exactAddress: string;
    reporterPhone: string | null;
    reporterName: string | null;
  }> {
    const found = await reportRepository.findById(reportId);
    if (!found) throw new NotFoundError('Report not found');

    // Region check for responders
    if (
      user.role === Role.RESPONDER &&
      user.assignedRegions &&
      user.assignedRegions.length > 0 &&
      found.report.regionId &&
      !user.assignedRegions.includes(found.report.regionId)
    ) {
      throw new ForbiddenError('You are not authorized to view PII for cases outside your assigned jurisdiction');
    }

    // MANDATORY AUDIT LOG: Record PII read
    await auditRepository.createLog({
      userId: user.id,
      userRole: user.role,
      action: AuditAction.READ_PII,
      entityName: 'Report',
      entityId: reportId,
      ipAddress,
      userAgent,
      metadata: {
        accessedFields: ['exactAddress', 'reporterPhone', 'reporterName'],
      },
    });

    return {
      exactAddress: found.report.exactAddressEncrypted || found.report.approximateLocation,
      reporterPhone: found.report.reporterPhoneEncrypted || null,
      reporterName: found.report.reporterName || null,
    };
  }

  /**
   * Execute bulk triage actions
   */
  async bulkAction(
    input: BulkActionInput,
    userId: string
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    return await reportRepository.bulkAction({
      reportIds: input.reportIds,
      action: input.action,
      userId,
      reason: input.reason,
    });
  }

  /**
   * Safe, Privacy-Filtered Public Map Feed:
   */
  async getPublicFeed(query: PublicReportFeedQuery): Promise<{
    reports: PublicSanitizedReport[];
    total: number;
    notice: string;
  }> {
    const { reports, total } = await reportRepository.getPublicFeed(query);

    const sanitized = reports.map((r) => {
      const publicCoords = obfuscateCoordinatesForPublic(r.latitude, r.longitude);
      return {
        id: r.id,
        trackingCode: r.trackingCode,
        title: r.title,
        description: r.description,
        hazardType: r.hazardType,
        status: r.status,
        severity: r.initialUrgency,
        approximateLocation: r.approximateLocation,
        latitude: publicCoords.lat,
        longitude: publicCoords.lng,
        peopleAffectedCount: r.peopleAffectedCount,
        vulnerableGroups: r.vulnerableGroups,
        duplicateClusterId: r.duplicateClusterId,
        isMasterInCluster: r.isMasterInCluster,
        mediaUrls: [],
        createdAt: r.createdAt.toISOString(),
      };
    });

    return {
      reports: sanitized,
      total,
      notice:
        'For life-threatening emergencies, call your local emergency number immediately. ReliefLink does not replace official emergency services.',
    };
  }

  /**
   * Public Case Tracking by Unguessable Tracking Code
   */
  async trackReportByCode(trackingCode: string): Promise<{
    trackingCode: string;
    title: string;
    description: string;
    hazardType: HazardType;
    status: ReportStatus;
    approximateLocation: string;
    createdAt: string;
    updates: Array<{ note: string; status: ReportStatus | null; createdAt: string }>;
    notice: string;
  }> {
    const found = await reportRepository.findByTrackingCode(trackingCode);
    if (!found) {
      throw new NotFoundError(`No incident report found matching tracking code: ${trackingCode}`);
    }

    const { report, updates } = found;

    return {
      trackingCode: report.trackingCode,
      title: report.title,
      description: report.description,
      hazardType: report.hazardType,
      status: report.status,
      approximateLocation: report.approximateLocation,
      createdAt: report.createdAt.toISOString(),
      updates: updates
        .filter((u) => u.isPublic)
        .map((u) => ({
          note: u.note,
          status: u.newStatus,
          createdAt: u.createdAt.toISOString(),
        })),
      notice:
        'For life-threatening emergencies, call your local emergency number immediately. ReliefLink does not replace official emergency services.',
    };
  }

  /**
   * Adds an immutable timeline progress update to an incident
   */
  async addReportUpdate(
    reportId: string,
    input: CreateReportUpdateInput,
    userId?: string
  ): Promise<{ updateId: string; newStatus: ReportStatus }> {
    const found = await reportRepository.findById(reportId);
    if (!found) throw new NotFoundError('Report not found');

    const sanitizedMedia = validateAndSanitizeMedia(input.media || []);

    const update = await reportRepository.addReportUpdate({
      reportId,
      authorId: userId,
      note: input.note,
      newStatus: input.status,
      isPublic: input.isPublic,
      media: sanitizedMedia,
    });

    return {
      updateId: update.id,
      newStatus: update.newStatus || found.report.status,
    };
  }

  /**
   * Community or responder abuse report
   */
  async flagReportAbuse(
    reportId: string,
    input: CreateAbuseFlagInput,
    userId?: string
  ): Promise<{ flagId: string; message: string }> {
    const found = await reportRepository.findById(reportId);
    if (!found) throw new NotFoundError('Report not found');

    const flag = await reportRepository.createAbuseFlag({
      reportId,
      reporterId: userId,
      reason: input.reason,
      details: input.details,
    });

    return {
      flagId: flag.id,
      message: 'Report flagged for responder investigation',
    };
  }
}

export const reportService = new ReportService();
