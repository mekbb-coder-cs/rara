import crypto from 'node:crypto';
import {
  HazardType,
  UrgencyLevel,
  ReportStatus,
  AbuseFlagReason,
  AbuseStatus,
  VerificationMethod,
  TriageQueueQuery,
} from '@relieflink/shared';
import { prisma } from '../config/db.js';
import { calculateHaversineDistanceMeters } from '../utils/geo.js';
import { ConcurrencyConflictError, NotFoundError } from '../utils/errors.js';
import { PriorityCalculationResult } from '../services/priority.service.js';

export interface ReportRecord {
  id: string;
  trackingCode: string;
  title: string;
  description: string;
  hazardType: HazardType;
  status: ReportStatus;
  initialUrgency: UrgencyLevel;
  latitude: number;
  longitude: number;
  approximateLocation: string;
  exactAddressEncrypted: string | null;
  peopleAffectedCount: number;
  hasInjured: boolean;
  hasTrapped: boolean;
  hasVulnerable: boolean;
  vulnerabilityDetails: string | null;
  vulnerableGroups: string[];
  isAnonymous: boolean;
  reporterId: string | null;
  reporterName: string | null;
  reporterPhoneEncrypted: string | null;
  reporterIpHash: string | null;
  regionId: string | null;
  duplicateClusterId: string | null;
  isMasterInCluster: boolean;
  idempotencyKey: string | null;
  offlineCreatedAt: Date | null;
  isHoneypotTriggered: boolean;
  version: number;
  assignedResponderId: string | null;
  lockedById: string | null;
  lockedAt: Date | null;
  manualOverrideScore: number | null;
  manualOverrideReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ReportMediaRecord {
  id: string;
  reportId: string;
  storageKey: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  isSensitive: boolean;
  exifStripped: boolean;
  uploadedAt: Date;
}

export interface ReportUpdateRecord {
  id: string;
  reportId: string;
  authorId: string | null;
  previousStatus: ReportStatus | null;
  newStatus: ReportStatus | null;
  note: string;
  isPublic: boolean;
  createdAt: Date;
}

export interface ReportVerificationRecord {
  id: string;
  reportId: string;
  verifiedById: string;
  status: string;
  method: string;
  notes: string;
  confidence: number;
  verifiedAt: Date;
}

export interface PriorityScoreRecord {
  id: string;
  reportId: string;
  compositeScore: number;
  severityScore: number;
  peopleAffectedScore: number;
  vulnerabilityScore: number;
  waitingTimeScore: number;
  hazardWeight: number;
  verificationMultiplier: number;
  calculationBreakdown: any;
  calculatedAt: Date;
  updatedAt: Date;
}

export interface DuplicateClusterRecord {
  id: string;
  masterReportId: string | null;
  radiusMeters: number;
  corroborationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AbuseFlagRecord {
  id: string;
  reportId: string;
  reporterId: string | null;
  reason: AbuseFlagReason;
  details: string | null;
  status: AbuseStatus;
  reviewedById: string | null;
  actionNotes: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface IReportRepository {
  createReport(data: {
    title: string;
    description: string;
    hazardType: HazardType;
    initialUrgency: UrgencyLevel;
    latitude: number;
    longitude: number;
    approximateLocation: string;
    exactAddressEncrypted: string;
    peopleAffectedCount: number;
    vulnerableGroups: string[];
    isAnonymous: boolean;
    reporterId?: string;
    reporterName?: string;
    reporterPhoneEncrypted?: string;
    reporterIpHash?: string;
    regionId?: string;
    idempotencyKey?: string;
    offlineCreatedAt?: Date;
    isHoneypotTriggered?: boolean;
    status?: ReportStatus;
    media?: Array<{
      url: string;
      mimeType: string;
      fileSizeBytes: number;
      isSensitive: boolean;
    }>;
  }): Promise<{ report: ReportRecord; media: ReportMediaRecord[] }>;

  findById(id: string): Promise<{
    report: ReportRecord;
    media: ReportMediaRecord[];
    updates: ReportUpdateRecord[];
    cluster?: DuplicateClusterRecord | null;
    verification?: ReportVerificationRecord | null;
    priorityScore?: PriorityScoreRecord | null;
  } | null>;

  findByTrackingCode(trackingCode: string): Promise<{
    report: ReportRecord;
    media: ReportMediaRecord[];
    updates: ReportUpdateRecord[];
  } | null>;

  findByIdempotencyKey(key: string): Promise<ReportRecord | null>;
  saveIdempotencyResponse(key: string, statusCode: number, body: unknown): Promise<void>;
  getIdempotencyResponse(key: string): Promise<{ statusCode: number; body: unknown } | null>;

  findNearbyDuplicates(params: {
    hazardType: HazardType;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    timeWindowHours: number;
  }): Promise<ReportRecord[]>;

  assignToDuplicateCluster(
    reportId: string,
    existingCandidate: ReportRecord
  ): Promise<{ clusterId: string; corroborationCount: number }>;

  getPublicFeed(query: {
    type?: HazardType;
    severity?: UrgencyLevel;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ReportRecord[]; total: number }>;

  addReportUpdate(data: {
    reportId: string;
    authorId?: string;
    note: string;
    newStatus?: ReportStatus;
    isPublic?: boolean;
    media?: Array<{
      url: string;
      mimeType: string;
      fileSizeBytes: number;
      isSensitive: boolean;
    }>;
  }): Promise<ReportUpdateRecord>;

  createAbuseFlag(data: {
    reportId: string;
    reporterId?: string;
    reason: AbuseFlagReason;
    details?: string;
  }): Promise<AbuseFlagRecord>;

  getUserAbuseCount(params: { ipHash?: string; userId?: string }): Promise<number>;

  // Phase 5: Responder Triage, Verification & Optimistic Locking Methods
  updateReportStatusWithLock(params: {
    reportId: string;
    newStatus: ReportStatus;
    expectedVersion?: number;
    userId?: string;
    notes?: string;
    isPublic?: boolean;
  }): Promise<{ report: ReportRecord; update: ReportUpdateRecord }>;

  verifyReportWithLock(params: {
    reportId: string;
    status: 'VERIFIED' | 'REJECTED';
    method: VerificationMethod;
    confidence: number;
    notes: string;
    verifiedById: string;
    expectedVersion?: number;
  }): Promise<{ report: ReportRecord; verification: ReportVerificationRecord }>;

  lockReport(params: {
    reportId: string;
    userId: string;
    expectedVersion?: number;
  }): Promise<ReportRecord>;

  unlockReport(params: { reportId: string; userId: string }): Promise<ReportRecord>;

  assignResponder(params: {
    reportId: string;
    responderId: string | null;
    expectedVersion?: number;
  }): Promise<ReportRecord>;

  overridePriority(params: {
    reportId: string;
    overrideScore: number;
    overrideReason: string;
    userId: string;
    expectedVersion?: number;
  }): Promise<ReportRecord>;

  savePriorityScore(reportId: string, scoreData: PriorityCalculationResult): Promise<PriorityScoreRecord>;
  getPriorityScore(reportId: string): Promise<PriorityScoreRecord | null>;

  getTriageQueue(
    query: TriageQueueQuery,
    userRegions?: string[],
    currentUserId?: string
  ): Promise<{
    reports: Array<{
      report: ReportRecord;
      priorityScore: PriorityScoreRecord | null;
      corroborationCount: number;
      verification: ReportVerificationRecord | null;
    }>;
    total: number;
  }>;

  bulkAction(params: {
    reportIds: string[];
    action: string;
    userId: string;
    reason?: string;
  }): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }>;
}

// In-Memory Implementation for Hermetic Tests & Unit Testing
export class InMemoryReportRepository implements IReportRepository {
  public reports: Map<string, ReportRecord> = new Map();
  public media: Map<string, ReportMediaRecord> = new Map();
  public updates: Map<string, ReportUpdateRecord> = new Map();
  public clusters: Map<string, DuplicateClusterRecord> = new Map();
  public abuseFlags: Map<string, AbuseFlagRecord> = new Map();
  public idempotencyStore: Map<string, { statusCode: number; body: unknown }> = new Map();
  public verifications: Map<string, ReportVerificationRecord> = new Map();
  public priorityScores: Map<string, PriorityScoreRecord> = new Map();

  async createReport(data: {
    title: string;
    description: string;
    hazardType: HazardType;
    initialUrgency: UrgencyLevel;
    latitude: number;
    longitude: number;
    approximateLocation: string;
    exactAddressEncrypted: string;
    peopleAffectedCount: number;
    vulnerableGroups: string[];
    isAnonymous: boolean;
    reporterId?: string;
    reporterName?: string;
    reporterPhoneEncrypted?: string;
    reporterIpHash?: string;
    regionId?: string;
    idempotencyKey?: string;
    offlineCreatedAt?: Date;
    isHoneypotTriggered?: boolean;
    status?: ReportStatus;
    media?: Array<{
      url: string;
      mimeType: string;
      fileSizeBytes: number;
      isSensitive: boolean;
    }>;
  }): Promise<{ report: ReportRecord; media: ReportMediaRecord[] }> {
    const id = crypto.randomUUID();
    const trackingCode = `RL-${Math.floor(1000 + Math.random() * 9000)}-${Math.random()
      .toString(36)
      .substring(2, 4)
      .toUpperCase()}`;
    const now = data.offlineCreatedAt || new Date();

    const report: ReportRecord = {
      id,
      trackingCode,
      title: data.title,
      description: data.description,
      hazardType: data.hazardType,
      status: data.status || (data.isHoneypotTriggered ? ReportStatus.REJECTED : ReportStatus.SUBMITTED),
      initialUrgency: data.initialUrgency,
      latitude: data.latitude,
      longitude: data.longitude,
      approximateLocation: data.approximateLocation,
      exactAddressEncrypted: data.exactAddressEncrypted,
      peopleAffectedCount: data.peopleAffectedCount,
      hasInjured: false,
      hasTrapped: false,
      hasVulnerable: data.vulnerableGroups.length > 0,
      vulnerabilityDetails: null,
      vulnerableGroups: data.vulnerableGroups,
      isAnonymous: data.isAnonymous,
      reporterId: data.reporterId || null,
      reporterName: data.reporterName || null,
      reporterPhoneEncrypted: data.reporterPhoneEncrypted || null,
      reporterIpHash: data.reporterIpHash || null,
      regionId: data.regionId || null,
      duplicateClusterId: null,
      isMasterInCluster: false,
      idempotencyKey: data.idempotencyKey || null,
      offlineCreatedAt: data.offlineCreatedAt || null,
      isHoneypotTriggered: data.isHoneypotTriggered || false,
      version: 1,
      assignedResponderId: null,
      lockedById: null,
      lockedAt: null,
      manualOverrideScore: null,
      manualOverrideReason: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.reports.set(id, report);

    const savedMedia: ReportMediaRecord[] = [];
    if (data.media) {
      for (const m of data.media) {
        const mediaId = crypto.randomUUID();
        const mediaRecord: ReportMediaRecord = {
          id: mediaId,
          reportId: id,
          storageKey: `reports/${id}/${mediaId}`,
          fileUrl: m.url,
          mimeType: m.mimeType,
          fileSizeBytes: m.fileSizeBytes,
          isSensitive: m.isSensitive,
          exifStripped: true,
          uploadedAt: new Date(),
        };
        this.media.set(mediaId, mediaRecord);
        savedMedia.push(mediaRecord);
      }
    }

    return { report, media: savedMedia };
  }

  async findById(id: string): Promise<{
    report: ReportRecord;
    media: ReportMediaRecord[];
    updates: ReportUpdateRecord[];
    cluster?: DuplicateClusterRecord | null;
    verification?: ReportVerificationRecord | null;
    priorityScore?: PriorityScoreRecord | null;
  } | null> {
    const report = this.reports.get(id);
    if (!report || report.deletedAt) return null;

    const media = Array.from(this.media.values()).filter((m) => m.reportId === id);
    const updates = Array.from(this.updates.values())
      .filter((u) => u.reportId === id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const cluster = report.duplicateClusterId ? this.clusters.get(report.duplicateClusterId) || null : null;
    const verification = this.verifications.get(id) || null;
    const priorityScore = this.priorityScores.get(id) || null;

    return { report, media, updates, cluster, verification, priorityScore };
  }

  async findByTrackingCode(trackingCode: string): Promise<{
    report: ReportRecord;
    media: ReportMediaRecord[];
    updates: ReportUpdateRecord[];
  } | null> {
    const found = Array.from(this.reports.values()).find(
      (r) => r.trackingCode.toLowerCase() === trackingCode.toLowerCase() && !r.deletedAt
    );
    if (!found) return null;

    const media = Array.from(this.media.values()).filter((m) => m.reportId === found.id);
    const updates = Array.from(this.updates.values())
      .filter((u) => u.reportId === found.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { report: found, media, updates };
  }

  async findByIdempotencyKey(key: string): Promise<ReportRecord | null> {
    return Array.from(this.reports.values()).find((r) => r.idempotencyKey === key) || null;
  }

  async saveIdempotencyResponse(key: string, statusCode: number, body: unknown): Promise<void> {
    this.idempotencyStore.set(key, { statusCode, body });
  }

  async getIdempotencyResponse(key: string): Promise<{ statusCode: number; body: unknown } | null> {
    return this.idempotencyStore.get(key) || null;
  }

  async findNearbyDuplicates(params: {
    hazardType: HazardType;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    timeWindowHours: number;
  }): Promise<ReportRecord[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - params.timeWindowHours * 60 * 60 * 1000);

    const candidates: ReportRecord[] = [];
    for (const report of this.reports.values()) {
      if (
        report.hazardType === params.hazardType &&
        report.createdAt >= cutoff &&
        !report.deletedAt &&
        report.status !== ReportStatus.REJECTED
      ) {
        const dist = calculateHaversineDistanceMeters(
          params.latitude,
          params.longitude,
          report.latitude,
          report.longitude
        );
        if (dist <= params.radiusMeters) {
          candidates.push(report);
        }
      }
    }
    return candidates;
  }

  async assignToDuplicateCluster(
    reportId: string,
    existingCandidate: ReportRecord
  ): Promise<{ clusterId: string; corroborationCount: number }> {
    const targetReport = this.reports.get(reportId);
    if (!targetReport) throw new NotFoundError('Report not found');

    let clusterId = existingCandidate.duplicateClusterId;
    let cluster: DuplicateClusterRecord | undefined;

    if (!clusterId) {
      clusterId = crypto.randomUUID();
      cluster = {
        id: clusterId,
        masterReportId: existingCandidate.id,
        radiusMeters: 500.0,
        corroborationCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.clusters.set(clusterId, cluster);

      existingCandidate.duplicateClusterId = clusterId;
      existingCandidate.isMasterInCluster = true;
      existingCandidate.updatedAt = new Date();
      this.reports.set(existingCandidate.id, existingCandidate);
    } else {
      cluster = this.clusters.get(clusterId);
      if (cluster) {
        cluster.corroborationCount += 1;
        cluster.updatedAt = new Date();
      }
    }

    targetReport.duplicateClusterId = clusterId;
    targetReport.isMasterInCluster = false;
    targetReport.updatedAt = new Date();
    this.reports.set(reportId, targetReport);

    return {
      clusterId,
      corroborationCount: cluster ? cluster.corroborationCount : 2,
    };
  }

  async getPublicFeed(query: {
    type?: HazardType;
    severity?: UrgencyLevel;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ReportRecord[]; total: number }> {
    let matched = Array.from(this.reports.values()).filter(
      (r) => !r.deletedAt && r.status !== ReportStatus.REJECTED
    );

    if (query.type) {
      matched = matched.filter((r) => r.hazardType === query.type);
    }
    if (query.severity) {
      matched = matched.filter((r) => r.initialUrgency === query.severity);
    }
    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
      const radiusMeters = query.radiusKm * 1000;
      matched = matched.filter((r) => {
        const dist = calculateHaversineDistanceMeters(query.lat!, query.lng!, r.latitude, r.longitude);
        return dist <= radiusMeters;
      });
    }

    matched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = matched.length;
    const start = query.offset || 0;
    const limit = query.limit || 50;

    return { reports: matched.slice(start, start + limit), total };
  }

  async addReportUpdate(data: {
    reportId: string;
    authorId?: string;
    note: string;
    newStatus?: ReportStatus;
    isPublic?: boolean;
    media?: Array<{
      url: string;
      mimeType: string;
      fileSizeBytes: number;
      isSensitive: boolean;
    }>;
  }): Promise<ReportUpdateRecord> {
    const report = this.reports.get(data.reportId);
    if (!report) throw new NotFoundError('Report not found');

    const updateId = crypto.randomUUID();
    const updateRecord: ReportUpdateRecord = {
      id: updateId,
      reportId: data.reportId,
      authorId: data.authorId || null,
      previousStatus: report.status,
      newStatus: data.newStatus || null,
      note: data.note,
      isPublic: data.isPublic !== undefined ? data.isPublic : true,
      createdAt: new Date(),
    };

    this.updates.set(updateId, updateRecord);

    if (data.newStatus) {
      report.status = data.newStatus;
      report.updatedAt = new Date();
      this.reports.set(data.reportId, report);
    }

    return updateRecord;
  }

  async createAbuseFlag(data: {
    reportId: string;
    reporterId?: string;
    reason: AbuseFlagReason;
    details?: string;
  }): Promise<AbuseFlagRecord> {
    const flagId = crypto.randomUUID();
    const flag: AbuseFlagRecord = {
      id: flagId,
      reportId: data.reportId,
      reporterId: data.reporterId || null,
      reason: data.reason,
      details: data.details || null,
      status: AbuseStatus.PENDING_REVIEW,
      reviewedById: null,
      actionNotes: null,
      createdAt: new Date(),
      reviewedAt: null,
    };
    this.abuseFlags.set(flagId, flag);
    return flag;
  }

  async getUserAbuseCount(params: { ipHash?: string; userId?: string }): Promise<number> {
    return Array.from(this.abuseFlags.values()).filter(
      (f) =>
        f.status === AbuseStatus.CONFIRMED_ABUSE &&
        ((params.userId && f.reporterId === params.userId) || false)
    ).length;
  }

  // Phase 5 Methods
  async updateReportStatusWithLock(params: {
    reportId: string;
    newStatus: ReportStatus;
    expectedVersion?: number;
    userId?: string;
    notes?: string;
    isPublic?: boolean;
  }): Promise<{ report: ReportRecord; update: ReportUpdateRecord }> {
    const report = this.reports.get(params.reportId);
    if (!report) throw new NotFoundError('Report not found');

    // Optimistic Concurrency Check
    if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
      throw new ConcurrencyConflictError(
        'Someone else is currently handling or has already updated this case.'
      );
    }

    const previousStatus = report.status;
    report.status = params.newStatus;
    report.version += 1;
    report.updatedAt = new Date();

    // Release lock if locked
    if (report.lockedById === params.userId) {
      report.lockedById = null;
      report.lockedAt = null;
    }

    this.reports.set(params.reportId, report);

    const updateId = crypto.randomUUID();
    const updateRecord: ReportUpdateRecord = {
      id: updateId,
      reportId: params.reportId,
      authorId: params.userId || null,
      previousStatus,
      newStatus: params.newStatus,
      note: params.notes || `Status transitioned to ${params.newStatus}`,
      isPublic: params.isPublic !== undefined ? params.isPublic : true,
      createdAt: new Date(),
    };
    this.updates.set(updateId, updateRecord);

    return { report, update: updateRecord };
  }

  async verifyReportWithLock(params: {
    reportId: string;
    status: 'VERIFIED' | 'REJECTED';
    method: VerificationMethod;
    confidence: number;
    notes: string;
    verifiedById: string;
    expectedVersion?: number;
  }): Promise<{ report: ReportRecord; verification: ReportVerificationRecord }> {
    const report = this.reports.get(params.reportId);
    if (!report) throw new NotFoundError('Report not found');

    // Optimistic Concurrency Check
    if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
      throw new ConcurrencyConflictError(
        'Someone else is currently handling or has already updated this case.'
      );
    }

    const newReportStatus =
      params.status === 'VERIFIED' ? ReportStatus.VERIFIED : ReportStatus.REJECTED;

    const previousStatus = report.status;
    report.status = newReportStatus;
    report.version += 1;
    report.updatedAt = new Date();
    this.reports.set(params.reportId, report);

    const verificationId = crypto.randomUUID();
    const verificationRecord: ReportVerificationRecord = {
      id: verificationId,
      reportId: params.reportId,
      verifiedById: params.verifiedById,
      status: params.status,
      method: params.method,
      notes: params.notes,
      confidence: params.confidence,
      verifiedAt: new Date(),
    };
    this.verifications.set(params.reportId, verificationRecord);

    const updateId = crypto.randomUUID();
    const updateRecord: ReportUpdateRecord = {
      id: updateId,
      reportId: params.reportId,
      authorId: params.verifiedById,
      previousStatus,
      newStatus: newReportStatus,
      note: `Verification outcome: ${params.status} (${params.method}). Note: ${params.notes}`,
      isPublic: true,
      createdAt: new Date(),
    };
    this.updates.set(updateId, updateRecord);

    return { report, verification: verificationRecord };
  }

  async lockReport(params: {
    reportId: string;
    userId: string;
    expectedVersion?: number;
  }): Promise<ReportRecord> {
    const report = this.reports.get(params.reportId);
    if (!report) throw new NotFoundError('Report not found');

    // Optimistic Version Check
    if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
      throw new ConcurrencyConflictError(
        'Someone else is currently handling or has already updated this case.'
      );
    }

    // Active lock check: If someone else holds the lock and it's less than 5 minutes old
    const now = new Date();
    if (
      report.lockedById &&
      report.lockedById !== params.userId &&
      report.lockedAt &&
      now.getTime() - report.lockedAt.getTime() < 5 * 60 * 1000
    ) {
      throw new ConcurrencyConflictError(
        'Someone else is currently handling or has already updated this case.'
      );
    }

    report.lockedById = params.userId;
    report.lockedAt = now;
    report.updatedAt = now;
    this.reports.set(params.reportId, report);

    return report;
  }

  async unlockReport(params: { reportId: string; userId: string }): Promise<ReportRecord> {
    const report = this.reports.get(params.reportId);
    if (!report) throw new NotFoundError('Report not found');

    if (report.lockedById === params.userId) {
      report.lockedById = null;
      report.lockedAt = null;
      report.updatedAt = new Date();
      this.reports.set(params.reportId, report);
    }

    return report;
  }

  async assignResponder(params: {
    reportId: string;
    responderId: string | null;
    expectedVersion?: number;
  }): Promise<ReportRecord> {
    const report = this.reports.get(params.reportId);
    if (!report) throw new NotFoundError('Report not found');

    if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
      throw new ConcurrencyConflictError(
        'Someone else is currently handling or has already updated this case.'
      );
    }

    report.assignedResponderId = params.responderId;
    report.version += 1;
    report.updatedAt = new Date();
    this.reports.set(params.reportId, report);

    return report;
  }

  async overridePriority(params: {
    reportId: string;
    overrideScore: number;
    overrideReason: string;
    userId: string;
    expectedVersion?: number;
  }): Promise<ReportRecord> {
    const report = this.reports.get(params.reportId);
    if (!report) throw new NotFoundError('Report not found');

    if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
      throw new ConcurrencyConflictError(
        'Someone else is currently handling or has already updated this case.'
      );
    }

    report.manualOverrideScore = params.overrideScore;
    report.manualOverrideReason = params.overrideReason;
    report.version += 1;
    report.updatedAt = new Date();
    this.reports.set(params.reportId, report);

    return report;
  }

  async savePriorityScore(
    reportId: string,
    scoreData: PriorityCalculationResult
  ): Promise<PriorityScoreRecord> {
    const existing = this.priorityScores.get(reportId);
    const now = new Date();
    const record: PriorityScoreRecord = {
      id: existing ? existing.id : crypto.randomUUID(),
      reportId,
      compositeScore: scoreData.compositeScore,
      severityScore: scoreData.severityScore,
      peopleAffectedScore: scoreData.peopleAffectedScore,
      vulnerabilityScore: scoreData.vulnerabilityScore,
      waitingTimeScore: scoreData.waitingTimeScore,
      hazardWeight: scoreData.hazardWeight,
      verificationMultiplier: scoreData.verificationMultiplier,
      calculationBreakdown: scoreData.breakdown,
      calculatedAt: now,
      updatedAt: now,
    };
    this.priorityScores.set(reportId, record);
    return record;
  }

  async getPriorityScore(reportId: string): Promise<PriorityScoreRecord | null> {
    return this.priorityScores.get(reportId) || null;
  }

  async getTriageQueue(
    query: TriageQueueQuery,
    userRegions?: string[],
    currentUserId?: string
  ): Promise<{
    reports: Array<{
      report: ReportRecord;
      priorityScore: PriorityScoreRecord | null;
      corroborationCount: number;
      verification: ReportVerificationRecord | null;
    }>;
    total: number;
  }> {
    let list = Array.from(this.reports.values()).filter((r) => !r.deletedAt);

    // 1. Regional Scope filter: if user has assigned regions, filter to those regions
    if (userRegions && userRegions.length > 0) {
      list = list.filter((r) => r.regionId && userRegions.includes(r.regionId));
    } else if (query.regionId) {
      list = list.filter((r) => r.regionId === query.regionId);
    }

    // 2. Status Filter
    if (query.status && query.status !== 'ALL') {
      list = list.filter((r) => r.status === query.status);
    }

    // 3. Hazard Type Filter
    if (query.hazardType) {
      list = list.filter((r) => r.hazardType === query.hazardType);
    }

    // 4. Urgency Filter
    if (query.urgency) {
      list = list.filter((r) => r.initialUrgency === query.urgency);
    }

    // 5. Assignment Filter
    if (query.assignment === 'assigned_to_me' && currentUserId) {
      list = list.filter((r) => r.assignedResponderId === currentUserId);
    } else if (query.assignment === 'unassigned') {
      list = list.filter((r) => !r.assignedResponderId);
    }

    // 6. Max Age Hours Filter
    if (query.maxAgeHours) {
      const now = Date.now();
      const maxAgeMs = query.maxAgeHours * 60 * 60 * 1000;
      list = list.filter((r) => now - r.createdAt.getTime() <= maxAgeMs);
    }

    // Attach PriorityScores & Clusters
    const mapped = list.map((r) => {
      const priorityScore = this.priorityScores.get(r.id) || null;
      const cluster = r.duplicateClusterId ? this.clusters.get(r.duplicateClusterId) : null;
      const verification = this.verifications.get(r.id) || null;
      return {
        report: r,
        priorityScore,
        corroborationCount: cluster ? cluster.corroborationCount : 1,
        verification,
      };
    });

    // 7. Sort
    mapped.sort((a, b) => {
      let comp = 0;
      if (query.sortBy === 'priority') {
        const scoreA = a.priorityScore ? a.priorityScore.compositeScore : 0;
        const scoreB = b.priorityScore ? b.priorityScore.compositeScore : 0;
        comp = scoreB - scoreA; // Highest priority first
      } else if (query.sortBy === 'createdAt') {
        comp = b.report.createdAt.getTime() - a.report.createdAt.getTime();
      } else if (query.sortBy === 'waitingTime') {
        comp = a.report.createdAt.getTime() - b.report.createdAt.getTime(); // Oldest first
      } else if (query.sortBy === 'affectedCount') {
        comp = b.report.peopleAffectedCount - a.report.peopleAffectedCount;
      }
      return query.sortOrder === 'asc' ? -comp : comp;
    });

    const total = mapped.length;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const start = (page - 1) * limit;

    return {
      reports: mapped.slice(start, start + limit),
      total,
    };
  }

  async bulkAction(params: {
    reportIds: string[];
    action: string;
    userId: string;
    reason?: string;
  }): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of params.reportIds) {
      try {
        const report = this.reports.get(id);
        if (!report) {
          failed.push({ id, error: 'Report not found' });
          continue;
        }

        switch (params.action) {
          case 'VERIFY':
            await this.verifyReportWithLock({
              reportId: id,
              status: 'VERIFIED',
              method: VerificationMethod.OFFICIAL_AGENCY,
              confidence: 1.0,
              notes: params.reason || 'Bulk verified by authorized responder',
              verifiedById: params.userId,
            });
            break;
          case 'REJECT':
            await this.verifyReportWithLock({
              reportId: id,
              status: 'REJECTED',
              method: VerificationMethod.OFFICIAL_AGENCY,
              confidence: 0.0,
              notes: params.reason || 'Bulk rejected',
              verifiedById: params.userId,
            });
            break;
          case 'PRIORITIZE':
            await this.updateReportStatusWithLock({
              reportId: id,
              newStatus: ReportStatus.PRIORITIZED,
              userId: params.userId,
              notes: 'Bulk prioritized',
            });
            break;
          case 'ASSIGN_TO_ME':
            await this.assignResponder({
              reportId: id,
              responderId: params.userId,
            });
            break;
          case 'UNASSIGN':
            await this.assignResponder({
              reportId: id,
              responderId: null,
            });
            break;
          default:
            failed.push({ id, error: `Unknown bulk action: ${params.action}` });
            continue;
        }

        succeeded.push(id);
      } catch (err: unknown) {
        failed.push({ id, error: (err as Error).message });
      }
    }

    return { succeeded, failed };
  }
}

// PostgreSQL + Prisma Production Implementation
export class PrismaReportRepository implements IReportRepository {
  async createReport(data: {
    title: string;
    description: string;
    hazardType: HazardType;
    initialUrgency: UrgencyLevel;
    latitude: number;
    longitude: number;
    approximateLocation: string;
    exactAddressEncrypted: string;
    peopleAffectedCount: number;
    vulnerableGroups: string[];
    isAnonymous: boolean;
    reporterId?: string;
    reporterName?: string;
    reporterPhoneEncrypted?: string;
    reporterIpHash?: string;
    regionId?: string;
    idempotencyKey?: string;
    offlineCreatedAt?: Date;
    isHoneypotTriggered?: boolean;
    status?: ReportStatus;
    media?: Array<{
      url: string;
      mimeType: string;
      fileSizeBytes: number;
      isSensitive: boolean;
    }>;
  }): Promise<{ report: ReportRecord; media: ReportMediaRecord[] }> {
    const trackingCode = `RL-${Math.floor(1000 + Math.random() * 9000)}-${Math.random()
      .toString(36)
      .substring(2, 4)
      .toUpperCase()}`;
    const createdAt = data.offlineCreatedAt || new Date();

    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          trackingCode,
          title: data.title,
          description: data.description,
          hazardType: data.hazardType as any,
          initialUrgency: data.initialUrgency as any,
          status: (data.status ||
            (data.isHoneypotTriggered ? ReportStatus.REJECTED : ReportStatus.SUBMITTED)) as any,
          latitude: data.latitude,
          longitude: data.longitude,
          approximateLocation: data.approximateLocation,
          exactAddressEncrypted: data.exactAddressEncrypted,
          peopleAffectedCount: data.peopleAffectedCount,
          vulnerableGroups: data.vulnerableGroups,
          hasVulnerable: data.vulnerableGroups.length > 0,
          isAnonymous: data.isAnonymous,
          reporterId: data.reporterId,
          reporterName: data.reporterName,
          reporterPhoneEncrypted: data.reporterPhoneEncrypted,
          reporterIpHash: data.reporterIpHash,
          regionId: data.regionId,
          idempotencyKey: data.idempotencyKey,
          offlineCreatedAt: data.offlineCreatedAt,
          isHoneypotTriggered: data.isHoneypotTriggered || false,
          version: 1,
          createdAt,
        },
      });

      try {
        await tx.$executeRaw`
          UPDATE "Report"
          SET "location" = ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)::geography
          WHERE "id" = ${report.id}
        `;
      } catch {}

      const savedMedia: ReportMediaRecord[] = [];
      if (data.media && data.media.length > 0) {
        for (const m of data.media) {
          const media = await tx.reportMedia.create({
            data: {
              reportId: report.id,
              storageKey: `reports/${report.id}/${crypto.randomUUID()}`,
              fileUrl: m.url,
              mimeType: m.mimeType,
              fileSizeBytes: m.fileSizeBytes,
              isSensitive: m.isSensitive,
              exifStripped: true,
            },
          });
          savedMedia.push(media as unknown as ReportMediaRecord);
        }
      }

      return {
        report: report as unknown as ReportRecord,
        media: savedMedia,
      };
    });
  }

  async findById(id: string): Promise<{
    report: ReportRecord;
    media: ReportMediaRecord[];
    updates: ReportUpdateRecord[];
    cluster?: DuplicateClusterRecord | null;
    verification?: ReportVerificationRecord | null;
    priorityScore?: PriorityScoreRecord | null;
  } | null> {
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        media: true,
        updates: { orderBy: { createdAt: 'asc' } },
        duplicateCluster: true,
        verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 },
        priorityScore: true,
      },
    });

    if (!report || report.deletedAt) return null;

    return {
      report: report as unknown as ReportRecord,
      media: report.media as unknown as ReportMediaRecord[],
      updates: report.updates as unknown as ReportUpdateRecord[],
      cluster: report.duplicateCluster as unknown as DuplicateClusterRecord | null,
      verification: report.verifications[0] as unknown as ReportVerificationRecord | null,
      priorityScore: report.priorityScore as unknown as PriorityScoreRecord | null,
    };
  }

  async findByTrackingCode(trackingCode: string): Promise<{
    report: ReportRecord;
    media: ReportMediaRecord[];
    updates: ReportUpdateRecord[];
  } | null> {
    const report = await prisma.report.findUnique({
      where: { trackingCode },
      include: {
        media: true,
        updates: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!report || report.deletedAt) return null;

    return {
      report: report as unknown as ReportRecord,
      media: report.media as unknown as ReportMediaRecord[],
      updates: report.updates as unknown as ReportUpdateRecord[],
    };
  }

  async findByIdempotencyKey(key: string): Promise<ReportRecord | null> {
    const report = await prisma.report.findUnique({
      where: { idempotencyKey: key },
    });
    return report as unknown as ReportRecord | null;
  }

  async saveIdempotencyResponse(key: string, statusCode: number, body: unknown): Promise<void> {
    try {
      await prisma.systemSetting.upsert({
        where: { key: `idempotency:${key}` },
        create: {
          key: `idempotency:${key}`,
          value: { statusCode, body } as any,
          description: 'Idempotency response cache',
        },
        update: {
          value: { statusCode, body } as any,
        },
      });
    } catch {}
  }

  async getIdempotencyResponse(key: string): Promise<{ statusCode: number; body: unknown } | null> {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: `idempotency:${key}` },
      });
      if (setting && setting.value) {
        return setting.value as unknown as { statusCode: number; body: unknown };
      }
    } catch {}
    return null;
  }

  async findNearbyDuplicates(params: {
    hazardType: HazardType;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    timeWindowHours: number;
  }): Promise<ReportRecord[]> {
    const cutoffDate = new Date(Date.now() - params.timeWindowHours * 60 * 60 * 1000);
    try {
      const reports = await prisma.$queryRaw<ReportRecord[]>`
        SELECT *
        FROM "Report"
        WHERE "hazardType" = ${params.hazardType}::"HazardType"
          AND "createdAt" >= ${cutoffDate}
          AND "deletedAt" IS NULL
          AND "status" != 'REJECTED'::"ReportStatus"
          AND ST_DWithin(
            "location",
            ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)::geography,
            ${params.radiusMeters}
          )
        ORDER BY "createdAt" DESC
        LIMIT 10;
      `;
      return reports;
    } catch {
      const candidates = await prisma.report.findMany({
        where: {
          hazardType: params.hazardType as any,
          createdAt: { gte: cutoffDate },
          deletedAt: null,
          status: { not: 'REJECTED' as any },
        },
      });
      return candidates.filter((c) => {
        const d = calculateHaversineDistanceMeters(
          params.latitude,
          params.longitude,
          c.latitude,
          c.longitude
        );
        return d <= params.radiusMeters;
      }) as unknown as ReportRecord[];
    }
  }

  async assignToDuplicateCluster(
    reportId: string,
    existingCandidate: ReportRecord
  ): Promise<{ clusterId: string; corroborationCount: number }> {
    return await prisma.$transaction(async (tx) => {
      let clusterId = existingCandidate.duplicateClusterId;
      let count = 2;

      if (!clusterId) {
        const cluster = await tx.duplicateCluster.create({
          data: {
            masterReportId: existingCandidate.id,
            radiusMeters: 500.0,
            corroborationCount: 2,
          },
        });
        clusterId = cluster.id;

        await tx.report.update({
          where: { id: existingCandidate.id },
          data: {
            duplicateClusterId: clusterId,
            isMasterInCluster: true,
          },
        });
      } else {
        const updated = await tx.duplicateCluster.update({
          where: { id: clusterId },
          data: { corroborationCount: { increment: 1 } },
        });
        count = updated.corroborationCount;
      }

      await tx.report.update({
        where: { id: reportId },
        data: {
          duplicateClusterId: clusterId,
          isMasterInCluster: false,
        },
      });

      return { clusterId, corroborationCount: count };
    });
  }

  async getPublicFeed(query: {
    type?: HazardType;
    severity?: UrgencyLevel;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ReportRecord[]; total: number }> {
    const where: any = {
      deletedAt: null,
      status: { not: 'REJECTED' },
    };
    if (query.type) where.hazardType = query.type;
    if (query.severity) where.initialUrgency = query.severity;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      prisma.report.count({ where }),
    ]);

    return {
      reports: reports as unknown as ReportRecord[],
      total,
    };
  }

  async addReportUpdate(data: {
    reportId: string;
    authorId?: string;
    note: string;
    newStatus?: ReportStatus;
    isPublic?: boolean;
    media?: Array<{
      url: string;
      mimeType: string;
      fileSizeBytes: number;
      isSensitive: boolean;
    }>;
  }): Promise<ReportUpdateRecord> {
    return await prisma.$transaction(async (tx) => {
      const update = await tx.reportUpdate.create({
        data: {
          reportId: data.reportId,
          authorId: data.authorId,
          note: data.note,
          newStatus: data.newStatus as any,
          isPublic: data.isPublic !== undefined ? data.isPublic : true,
        },
      });

      if (data.newStatus) {
        await tx.report.update({
          where: { id: data.reportId },
          data: { status: data.newStatus as any },
        });
      }

      return update as unknown as ReportUpdateRecord;
    });
  }

  async createAbuseFlag(data: {
    reportId: string;
    reporterId?: string;
    reason: AbuseFlagReason;
    details?: string;
  }): Promise<AbuseFlagRecord> {
    const flag = await prisma.abuseFlag.create({
      data: {
        reportId: data.reportId,
        reporterId: data.reporterId,
        reason: data.reason as any,
        details: data.details,
      },
    });
    return flag as unknown as AbuseFlagRecord;
  }

  async getUserAbuseCount(params: { ipHash?: string; userId?: string }): Promise<number> {
    const where: any = { status: 'CONFIRMED_ABUSE' };
    if (params.userId) where.reporterId = params.userId;
    return await prisma.abuseFlag.count({ where });
  }

  // Phase 5 Methods
  async updateReportStatusWithLock(params: {
    reportId: string;
    newStatus: ReportStatus;
    expectedVersion?: number;
    userId?: string;
    notes?: string;
    isPublic?: boolean;
  }): Promise<{ report: ReportRecord; update: ReportUpdateRecord }> {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: params.reportId } });
      if (!report) throw new NotFoundError('Report not found');

      if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
        throw new ConcurrencyConflictError(
          'Someone else is currently handling or has already updated this case.'
        );
      }

      const updatedReport = await tx.report.update({
        where: { id: params.reportId },
        data: {
          status: params.newStatus as any,
          version: { increment: 1 },
          lockedById: report.lockedById === params.userId ? null : report.lockedById,
          lockedAt: report.lockedById === params.userId ? null : report.lockedAt,
        },
      });

      const update = await tx.reportUpdate.create({
        data: {
          reportId: params.reportId,
          authorId: params.userId,
          previousStatus: report.status,
          newStatus: params.newStatus as any,
          note: params.notes || `Status transitioned to ${params.newStatus}`,
          isPublic: params.isPublic !== undefined ? params.isPublic : true,
        },
      });

      return {
        report: updatedReport as unknown as ReportRecord,
        update: update as unknown as ReportUpdateRecord,
      };
    });
  }

  async verifyReportWithLock(params: {
    reportId: string;
    status: 'VERIFIED' | 'REJECTED';
    method: VerificationMethod;
    confidence: number;
    notes: string;
    verifiedById: string;
    expectedVersion?: number;
  }): Promise<{ report: ReportRecord; verification: ReportVerificationRecord }> {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: params.reportId } });
      if (!report) throw new NotFoundError('Report not found');

      if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
        throw new ConcurrencyConflictError(
          'Someone else is currently handling or has already updated this case.'
        );
      }

      const newStatus = params.status === 'VERIFIED' ? ReportStatus.VERIFIED : ReportStatus.REJECTED;

      const updatedReport = await tx.report.update({
        where: { id: params.reportId },
        data: {
          status: newStatus as any,
          version: { increment: 1 },
        },
      });

      const verification = await tx.reportVerification.create({
        data: {
          reportId: params.reportId,
          verifiedById: params.verifiedById,
          status: params.status as any,
          method: params.method as any,
          confidence: params.confidence,
          notes: params.notes,
        },
      });

      await tx.reportUpdate.create({
        data: {
          reportId: params.reportId,
          authorId: params.verifiedById,
          previousStatus: report.status,
          newStatus: newStatus as any,
          note: `Verification outcome: ${params.status} (${params.method}). Note: ${params.notes}`,
          isPublic: true,
        },
      });

      return {
        report: updatedReport as unknown as ReportRecord,
        verification: verification as unknown as ReportVerificationRecord,
      };
    });
  }

  async lockReport(params: {
    reportId: string;
    userId: string;
    expectedVersion?: number;
  }): Promise<ReportRecord> {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: params.reportId } });
      if (!report) throw new NotFoundError('Report not found');

      if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
        throw new ConcurrencyConflictError(
          'Someone else is currently handling or has already updated this case.'
        );
      }

      const now = new Date();
      if (
        report.lockedById &&
        report.lockedById !== params.userId &&
        report.lockedAt &&
        now.getTime() - report.lockedAt.getTime() < 5 * 60 * 1000
      ) {
        throw new ConcurrencyConflictError(
          'Someone else is currently handling or has already updated this case.'
        );
      }

      const updated = await tx.report.update({
        where: { id: params.reportId },
        data: {
          lockedById: params.userId,
          lockedAt: now,
        },
      });

      return updated as unknown as ReportRecord;
    });
  }

  async unlockReport(params: { reportId: string; userId: string }): Promise<ReportRecord> {
    const report = await prisma.report.findUnique({ where: { id: params.reportId } });
    if (!report) throw new NotFoundError('Report not found');

    if (report.lockedById === params.userId) {
      const updated = await prisma.report.update({
        where: { id: params.reportId },
        data: {
          lockedById: null,
          lockedAt: null,
        },
      });
      return updated as unknown as ReportRecord;
    }

    return report as unknown as ReportRecord;
  }

  async assignResponder(params: {
    reportId: string;
    responderId: string | null;
    expectedVersion?: number;
  }): Promise<ReportRecord> {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: params.reportId } });
      if (!report) throw new NotFoundError('Report not found');

      if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
        throw new ConcurrencyConflictError(
          'Someone else is currently handling or has already updated this case.'
        );
      }

      const updated = await tx.report.update({
        where: { id: params.reportId },
        data: {
          assignedResponderId: params.responderId,
          version: { increment: 1 },
        },
      });

      return updated as unknown as ReportRecord;
    });
  }

  async overridePriority(params: {
    reportId: string;
    overrideScore: number;
    overrideReason: string;
    userId: string;
    expectedVersion?: number;
  }): Promise<ReportRecord> {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: params.reportId } });
      if (!report) throw new NotFoundError('Report not found');

      if (params.expectedVersion !== undefined && report.version !== params.expectedVersion) {
        throw new ConcurrencyConflictError(
          'Someone else is currently handling or has already updated this case.'
        );
      }

      const updated = await tx.report.update({
        where: { id: params.reportId },
        data: {
          manualOverrideScore: params.overrideScore,
          manualOverrideReason: params.overrideReason,
          version: { increment: 1 },
        },
      });

      return updated as unknown as ReportRecord;
    });
  }

  async savePriorityScore(
    reportId: string,
    scoreData: PriorityCalculationResult
  ): Promise<PriorityScoreRecord> {
    const record = await prisma.priorityScore.upsert({
      where: { reportId },
      create: {
        reportId,
        compositeScore: scoreData.compositeScore,
        severityScore: scoreData.severityScore,
        peopleAffectedScore: scoreData.peopleAffectedScore,
        vulnerabilityScore: scoreData.vulnerabilityScore,
        waitingTimeScore: scoreData.waitingTimeScore,
        hazardWeight: scoreData.hazardWeight,
        verificationMultiplier: scoreData.verificationMultiplier,
        calculationBreakdown: scoreData.breakdown as any,
      },
      update: {
        compositeScore: scoreData.compositeScore,
        severityScore: scoreData.severityScore,
        peopleAffectedScore: scoreData.peopleAffectedScore,
        vulnerabilityScore: scoreData.vulnerabilityScore,
        waitingTimeScore: scoreData.waitingTimeScore,
        hazardWeight: scoreData.hazardWeight,
        verificationMultiplier: scoreData.verificationMultiplier,
        calculationBreakdown: scoreData.breakdown as any,
      },
    });

    return record as unknown as PriorityScoreRecord;
  }

  async getPriorityScore(reportId: string): Promise<PriorityScoreRecord | null> {
    const score = await prisma.priorityScore.findUnique({ where: { reportId } });
    return score as unknown as PriorityScoreRecord | null;
  }

  async getTriageQueue(
    query: TriageQueueQuery,
    userRegions?: string[],
    currentUserId?: string
  ): Promise<{
    reports: Array<{
      report: ReportRecord;
      priorityScore: PriorityScoreRecord | null;
      corroborationCount: number;
      verification: ReportVerificationRecord | null;
    }>;
    total: number;
  }> {
    const where: any = { deletedAt: null };

    if (userRegions && userRegions.length > 0) {
      where.regionId = { in: userRegions };
    } else if (query.regionId) {
      where.regionId = query.regionId;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as any;
    }
    if (query.hazardType) {
      where.hazardType = query.hazardType as any;
    }
    if (query.urgency) {
      where.initialUrgency = query.urgency as any;
    }
    if (query.assignment === 'assigned_to_me' && currentUserId) {
      where.assignedResponderId = currentUserId;
    } else if (query.assignment === 'unassigned') {
      where.assignedResponderId = null;
    }
    if (query.maxAgeHours) {
      where.createdAt = { gte: new Date(Date.now() - query.maxAgeHours * 60 * 60 * 1000) };
    }

    const orderBy: any = {};
    if (query.sortBy === 'createdAt') {
      orderBy.createdAt = query.sortOrder || 'desc';
    } else if (query.sortBy === 'waitingTime') {
      orderBy.createdAt = query.sortOrder === 'desc' ? 'asc' : 'desc';
    } else if (query.sortBy === 'affectedCount') {
      orderBy.peopleAffectedCount = query.sortOrder || 'desc';
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          priorityScore: true,
          duplicateCluster: true,
          verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 },
        },
        orderBy: Object.keys(orderBy).length > 0 ? orderBy : undefined,
        take: query.limit || 20,
        skip: ((query.page || 1) - 1) * (query.limit || 20),
      }),
      prisma.report.count({ where }),
    ]);

    const mapped = reports.map((r) => ({
      report: r as unknown as ReportRecord,
      priorityScore: r.priorityScore as unknown as PriorityScoreRecord | null,
      corroborationCount: r.duplicateCluster ? r.duplicateCluster.corroborationCount : 1,
      verification: r.verifications[0] as unknown as ReportVerificationRecord | null,
    }));

    if (query.sortBy === 'priority' || !query.sortBy) {
      mapped.sort((a, b) => {
        const scoreA = a.priorityScore?.compositeScore || 0;
        const scoreB = b.priorityScore?.compositeScore || 0;
        return query.sortOrder === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      });
    }

    return { reports: mapped, total };
  }

  async bulkAction(params: {
    reportIds: string[];
    action: string;
    userId: string;
    reason?: string;
  }): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of params.reportIds) {
      try {
        switch (params.action) {
          case 'VERIFY':
            await this.verifyReportWithLock({
              reportId: id,
              status: 'VERIFIED',
              method: VerificationMethod.OFFICIAL_AGENCY,
              confidence: 1.0,
              notes: params.reason || 'Bulk verified',
              verifiedById: params.userId,
            });
            break;
          case 'REJECT':
            await this.verifyReportWithLock({
              reportId: id,
              status: 'REJECTED',
              method: VerificationMethod.OFFICIAL_AGENCY,
              confidence: 0.0,
              notes: params.reason || 'Bulk rejected',
              verifiedById: params.userId,
            });
            break;
          case 'PRIORITIZE':
            await this.updateReportStatusWithLock({
              reportId: id,
              newStatus: ReportStatus.PRIORITIZED,
              userId: params.userId,
              notes: 'Bulk prioritized',
            });
            break;
          case 'ASSIGN_TO_ME':
            await this.assignResponder({
              reportId: id,
              responderId: params.userId,
            });
            break;
          case 'UNASSIGN':
            await this.assignResponder({
              reportId: id,
              responderId: null,
            });
            break;
          default:
            failed.push({ id, error: `Invalid action: ${params.action}` });
            continue;
        }
        succeeded.push(id);
      } catch (err: unknown) {
        failed.push({ id, error: (err as Error).message });
      }
    }

    return { succeeded, failed };
  }
}

export const reportRepository: IReportRepository =
  process.env.NODE_ENV === 'test' ? new InMemoryReportRepository() : new PrismaReportRepository();
