import { Request, Response, NextFunction } from 'express';
import {
  CreateReportSchema,
  OfflineSyncSchema,
  CreateReportUpdateSchema,
  CreateAbuseFlagSchema,
  PublicReportFeedQuerySchema,
  VerifyReportSchema,
  UpdateReportStatusSchema,
  PriorityOverrideSchema,
  LockReportSchema,
  TriageQueueQuerySchema,
  BulkActionSchema,
  RequestMoreInfoSchema,
  Role,
  AuditAction,
} from '@relieflink/shared';
import { reportService } from '../services/report.service.js';
import { reportRepository } from '../repositories/report.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { NotFoundError } from '../utils/errors.js';
import { obfuscateCoordinatesForPublic } from '../utils/geo.js';
import { ingestionQueue } from '../services/ingestion-queue.service.js';

// Setup async worker for queued reports under load
ingestionQueue.on('process', async (item) => {
  try {
    await reportService.submitReport(item.payload);
  } catch (err) {
    // Handled in ingestionQueue
  }
});

export class ReportController {
  async createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idempotencyKey =
        (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;

      const validated = CreateReportSchema.parse(req.body);

      // Backpressure check: If server is under extreme load, enqueue and respond immediately with 202
      if (ingestionQueue.isOverloaded()) {
        const queued = ingestionQueue.enqueue(validated);
        res.status(202).json({
          success: true,
          message: 'Report received and queued for asynchronous processing under high traffic load.',
          data: {
            trackingCode: queued.trackingCode,
            status: 'QUEUED',
            etaSeconds: 5,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await reportService.submitReport(
        validated,
        req.user?.userId,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent'] as string,
        idempotencyKey
      );

      res.status(201).json({
        success: true,
        message: 'Crisis incident report submitted successfully.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async syncOffline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = OfflineSyncSchema.parse(req.body);
      const results = await reportService.syncOfflineBatch(
        validated,
        req.user?.userId,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent'] as string
      );

      res.status(200).json({
        success: true,
        message: `Successfully synchronized batch of ${results.length} offline crisis reports.`,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getPublicFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = PublicReportFeedQuerySchema.parse(req.query);
      const result = await reportService.getPublicFeed(validated);

      res.status(200).json({
        success: true,
        data: result.reports,
        total: result.total,
        notice: result.notice,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async trackReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const trackingCode = typeof req.params.trackingCode === 'string'
        ? req.params.trackingCode
        : req.params.trackingCode[0];

      const result = await reportService.trackReportByCode(trackingCode);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const found = await reportRepository.findById(id);

      if (!found) throw new NotFoundError('Crisis report not found');

      const isVerifiedResponder =
        req.user &&
        (req.user.role === Role.ADMIN ||
          req.user.role === Role.COORDINATOR ||
          req.user.role === Role.RESPONDER);

      if (isVerifiedResponder) {
        // Record audit log for PII access
        await auditRepository.createLog({
          userId: req.user!.userId,
          action: AuditAction.READ_PII,
          entityType: 'Report',
          entityId: found.report.id,
          ipAddress: req.ip,
          metadata: {
            reason: 'Responder viewing report details',
            accessedFields: ['exactAddress', 'reporterPhone'],
          },
        });

        res.status(200).json({
          success: true,
          data: {
            ...found.report,
            exactAddress: found.report.exactAddressEncrypted,
            reporterPhone: found.report.reporterPhoneEncrypted,
            media: found.media,
            updates: found.updates,
            cluster: found.cluster,
            verification: found.verification,
            priorityScore: found.priorityScore,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Public / Guest view: Redact exact coordinates, address, and phone
      const publicCoords = obfuscateCoordinatesForPublic(
        found.report.latitude,
        found.report.longitude
      );

      res.status(200).json({
        success: true,
        data: {
          id: found.report.id,
          trackingCode: found.report.trackingCode,
          title: found.report.title,
          description: found.report.description,
          hazardType: found.report.hazardType,
          status: found.report.status,
          severity: found.report.initialUrgency,
          approximateLocation: found.report.approximateLocation,
          latitude: publicCoords.lat,
          longitude: publicCoords.lng,
          peopleAffectedCount: found.report.peopleAffectedCount,
          vulnerableGroups: found.report.vulnerableGroups,
          updates: found.updates.filter((u) => u.isPublic),
          media: found.media.filter((m) => !m.isSensitive),
          createdAt: found.report.createdAt,
        },
        notice:
          'For life-threatening emergencies, call your local emergency number immediately. ReliefLink does not replace official emergency services.',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async addUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = CreateReportUpdateSchema.parse(req.body);
      const result = await reportService.addReportUpdate(id, validated, req.user?.userId);

      res.status(201).json({
        success: true,
        message: 'Incident timeline update recorded.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async flagAbuse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = CreateAbuseFlagSchema.parse(req.body);
      const result = await reportService.flagReportAbuse(id, validated, req.user?.userId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: { flagId: result.flagId },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // PHASE 5: RESPONDER CONSOLE CONTROLLERS
  // ==========================================

  async getTriageQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = TriageQueueQuerySchema.parse(req.query);
      const result = await reportService.getTriageQueue(validated, {
        id: req.user!.userId,
        role: req.user!.role,
        assignedRegions: req.user?.assignedRegions || req.user?.assignedRegionIds || [],
      });

      res.status(200).json({
        success: true,
        data: result.reports,
        total: result.total,
        page: validated.page,
        limit: validated.limit,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = VerifyReportSchema.parse(req.body);
      const result = await reportService.verifyReport(
        id,
        validated,
        req.user!.userId,
        req.user!.role,
        req.ip || req.socket.remoteAddress
      );

      res.status(200).json({
        success: true,
        message: `Report successfully ${validated.status.toLowerCase()}.`,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = UpdateReportStatusSchema.parse(req.body);
      const result = await reportService.updateReportStatus(
        id,
        validated,
        req.user!.userId,
        req.user!.role,
        req.ip || req.socket.remoteAddress
      );

      res.status(200).json({
        success: true,
        message: `Report status transitioned to ${validated.newStatus}.`,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async lockReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = LockReportSchema.parse(req.body || {});
      const result = await reportService.lockReport(id, req.user!.userId, validated.expectedVersion);

      res.status(200).json({
        success: true,
        message: 'Report locked for triage.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async unlockReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const result = await reportService.unlockReport(id, req.user!.userId);

      res.status(200).json({
        success: true,
        message: 'Report lock released.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async assignResponder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const { responderId, expectedVersion } = req.body;
      const result = await reportService.assignResponder(
        id,
        responderId || null,
        req.user!.userId,
        expectedVersion
      );

      res.status(200).json({
        success: true,
        message: responderId ? 'Responder assigned to case.' : 'Responder unassigned.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async overridePriority(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = PriorityOverrideSchema.parse(req.body);
      const result = await reportService.overridePriority(
        id,
        validated,
        req.user!.userId,
        req.user!.role,
        req.ip || req.socket.remoteAddress
      );

      res.status(200).json({
        success: true,
        message: 'Priority score overridden with justification note.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async revealSensitive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const result = await reportService.revealSensitiveDetails(
        id,
        {
          id: req.user!.userId,
          role: req.user!.role,
          assignedRegions: req.user?.assignedRegions || req.user?.assignedRegionIds || [],
        },
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent'] as string
      );

      res.status(200).json({
        success: true,
        message: 'Sensitive contact details unmasked and audited.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async requestMoreInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = RequestMoreInfoSchema.parse(req.body);
      const result = await reportService.requestMoreInfo(id, validated, req.user!.userId);

      res.status(201).json({
        success: true,
        message: result.message,
        data: { updateId: result.updateId },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkAction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = BulkActionSchema.parse(req.body);
      const result = await reportService.bulkAction(validated, req.user!.userId);

      res.status(200).json({
        success: true,
        message: `Bulk action ${validated.action} executed. Succeeded: ${result.succeeded.length}, Failed: ${result.failed.length}`,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const reportController = new ReportController();
