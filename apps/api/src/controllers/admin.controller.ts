import { Request, Response, NextFunction } from 'express';
import { settingsRepository } from '../repositories/settings.repository.js';
import { userRepository, InMemoryUserRepository } from '../repositories/user.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { priorityService } from '../services/priority.service.js';
import { analyticsService } from '../services/analytics.service.js';
import { auditService } from '../services/audit.service.js';
import { complianceService } from '../services/compliance.service.js';
import {
  UpdatePriorityWeightsSchema,
  UpdateDuplicateClusteringSchema,
  UpdateEscalationThresholdsSchema,
  UpdateFeatureFlagsSchema,
  UpdateDataRetentionSchema,
  UpdateUserAdminSchema,
  AuditLogQuerySchema,
  AfterActionReportQuerySchema,
  AuditAction,
  Role,
} from '@relieflink/shared';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.js';
import { prisma } from '../config/db.js';

export class AdminController {
  // ==========================================
  // SYSTEM SETTINGS & CONFIG
  // ==========================================

  async getSystemConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await settingsRepository.getConfig();
      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (err) {
      next(err);
    }
  }

  async updatePriorityWeights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = UpdatePriorityWeightsSchema.parse(req.body);

      const updated = await settingsRepository.updatePriorityWeights(
        validated,
        req.user.userId,
        req.user.role as Role
      );

      // Immediately propagate new weights to priority calculation service
      priorityService.setWeights(updated);

      res.status(200).json({
        success: true,
        message: 'Priority weights updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDuplicateClustering(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = UpdateDuplicateClusteringSchema.parse(req.body);

      const updated = await settingsRepository.updateDuplicateClustering(
        validated,
        req.user.userId,
        req.user.role as Role
      );

      res.status(200).json({
        success: true,
        message: 'Duplicate clustering configuration updated.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateEscalationThresholds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = UpdateEscalationThresholdsSchema.parse(req.body);

      const updated = await settingsRepository.updateEscalationThresholds(
        validated,
        req.user.userId,
        req.user.role as Role
      );

      res.status(200).json({
        success: true,
        message: 'Escalation SLA thresholds updated.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateFeatureFlags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = UpdateFeatureFlagsSchema.parse(req.body);

      const updated = await settingsRepository.updateFeatureFlags(
        validated,
        req.user.userId,
        req.user.role as Role
      );

      res.status(200).json({
        success: true,
        message: 'Feature flags updated.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDataRetention(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = UpdateDataRetentionSchema.parse(req.body);

      const updated = await settingsRepository.updateDataRetention(
        validated,
        req.user.userId,
        req.user.role as Role
      );

      res.status(200).json({
        success: true,
        message: 'Data retention policy updated.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let usersList: any[] = [];
      if (userRepository instanceof InMemoryUserRepository) {
        usersList = Array.from(userRepository.users.values());
      } else {
        usersList = await prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
      }

      const sanitized = usersList.map((u) => {
        const item = { ...u };
        delete item.passwordHash;
        return item;
      });

      res.status(200).json({
        success: true,
        data: sanitized,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;
      const validated = UpdateUserAdminSchema.parse(req.body);

      let existingUser: any = null;
      if (userRepository instanceof InMemoryUserRepository) {
        existingUser = userRepository.users.get(id);
      } else {
        existingUser = await prisma.user.findUnique({ where: { id } });
      }

      if (!existingUser) throw new NotFoundError(`User ${id} not found`);

      const before = {
        role: existingUser.role,
        isVerifiedResponder: existingUser.isVerifiedResponder,
        isEmailVerified: existingUser.isEmailVerified,
      };

      if (validated.role) existingUser.role = validated.role as any;
      if (validated.isVerifiedResponder !== undefined)
        existingUser.isVerifiedResponder = validated.isVerifiedResponder;
      if (validated.isEmailVerified !== undefined)
        existingUser.isEmailVerified = validated.isEmailVerified;

      if (userRepository instanceof InMemoryUserRepository) {
        userRepository.users.set(id, existingUser);
      } else {
        await prisma.user.update({
          where: { id },
          data: {
            role: existingUser.role,
            isVerifiedResponder: existingUser.isVerifiedResponder,
            isEmailVerified: existingUser.isEmailVerified,
          },
        });
      }

      const after = {
        role: existingUser.role,
        isVerifiedResponder: existingUser.isVerifiedResponder,
        isEmailVerified: existingUser.isEmailVerified,
      };

      await auditRepository.createLog({
        userId: req.user.userId,
        userRole: req.user.role as Role,
        action: AuditAction.USER_ROLE_CHANGE,
        entityName: 'User',
        entityId: id,
        metadata: { before, after },
      });

      const sanitized = { ...existingUser };
      delete sanitized.passwordHash;

      res.status(200).json({
        success: true,
        message: 'User updated successfully.',
        data: sanitized,
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================

  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = AuditLogQuerySchema.parse(req.query);
      const logs = await auditService.getAuditLogs(query);
      res.status(200).json({
        success: true,
        data: logs,
        total: logs.length,
      });
    } catch (err) {
      next(err);
    }
  }

  async exportAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = AuditLogQuerySchema.parse(req.query);
      const csv = await auditService.exportAuditLogsToCsv(query);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="relieflink_audit_logs_${Date.now()}.csv"`
      );
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // PRIVACY & COMPLIANCE
  // ==========================================

  async triggerRetentionJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const retentionDays = req.body?.retentionDays ? parseInt(req.body.retentionDays, 10) : 30;
      const result = await complianceService.runRetentionAnonymizationJob(retentionDays);

      res.status(200).json({
        success: true,
        message: `Data retention job executed. ${result.anonymizedCount} incidents anonymized.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async exportUserData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = await complianceService.exportUserData(id);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteUserData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;
      const result = await complianceService.deleteUserData(id, req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // OPERATIONS & ANALYTICS
  // ==========================================

  async getOperationsMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await analyticsService.getOperationsMetrics();
      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (err) {
      next(err);
    }
  }

  async getAfterActionReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = AfterActionReportQuerySchema.parse(req.query);
      const report = await analyticsService.getAfterActionReport(
        query.regionId,
        query.startDate,
        query.endDate
      );

      if (query.format === 'csv') {
        const csv = auditService.exportAfterActionReportToCsv(report);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="after_action_report_${Date.now()}.csv"`
        );
        res.status(200).send(csv);
        return;
      }

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }

  async getPublicTransparency(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await analyticsService.getPublicTransparencyMetrics();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
