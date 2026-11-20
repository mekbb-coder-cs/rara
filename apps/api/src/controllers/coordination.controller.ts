import { Request, Response, NextFunction } from 'express';
import { coordinationRepository } from '../repositories/coordination.repository.js';
import { reportRepository } from '../repositories/report.repository.js';
import { matchingRepository } from '../repositories/matching.repository.js';
import { notificationService } from '../services/notification.service.js';
import { escalationService } from '../services/escalation.service.js';
import {
  CreateTaskSchema,
  UpdateTaskStatusSchema,
  UpdateTaskLocationSchema,
  CloseCaseSchema,
  ReopenCaseSchema,
  SendTeamChatMessageSchema,
  CreateBroadcastAlertSchema,
  UpdateBroadcastAlertSchema,
  UpdateEscalationRuleSchema,
  UpdateNotificationPreferenceSchema,
} from '@relieflink/shared';
import {
  Role,
  NotificationType,
  NotificationChannel,
  TaskStatus,
} from '@relieflink/shared';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.js';
import { logger } from '../config/logger.js';

export class CoordinationController {
  // ==========================================
  // TASKS
  // ==========================================

  async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = CreateTaskSchema.parse(req.body);

      // Verify report exists
      const found = await reportRepository.findById(validated.reportId);
      if (!found || !found.report) throw new NotFoundError(`Report ${validated.reportId} not found`);
      const report = found.report;

      const task = await coordinationRepository.createTask({
        ...validated,
        createdById: req.user.userId,
        assigneeName: validated.assigneeName || req.user.email || 'Responder',
      });

      // Dispatch notification to assignee if assigned
      if (task.assigneeId) {
        await notificationService.dispatchNotification({
          type: NotificationType.TASK_ASSIGNED,
          title: `New Assignment: [${task.type}] ${task.title}`,
          body: `You have been assigned to case ${report.trackingCode}. Please review checklist and proceed.`,
          priority: 'HIGH',
          recipientUserId: task.assigneeId,
          channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
          metadata: { taskId: task.id, reportId: task.reportId },
        });
      }

      res.status(201).json({
        success: true,
        message: 'Task created and dispatched to field responder.',
        data: task,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const task = await coordinationRepository.getTaskById(id);
      if (!task) throw new NotFoundError(`Task ${id} not found`);

      res.status(200).json({
        success: true,
        data: task,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reportId, assigneeId, status, type } = req.query;
      const tasks = await coordinationRepository.listTasks({
        reportId: reportId as string | undefined,
        assigneeId: assigneeId as string | undefined,
        status: status as any,
        type: type as any,
      });

      res.status(200).json({
        success: true,
        data: tasks,
        total: tasks.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async updateTaskStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;
      const validated = UpdateTaskStatusSchema.parse(req.body);

      const existing = await coordinationRepository.getTaskById(id);
      if (!existing) throw new NotFoundError(`Task ${id} not found`);

      const updated = await coordinationRepository.updateTaskStatus(
        id,
        validated.status,
        {
          checklist: validated.checklist,
          note: validated.note,
          userId: req.user.userId,
          userRole: req.user.role,
        }
      );

      // Notify case responders and reporter if task state progressed
      let notifType: NotificationType = NotificationType.TASK_STATUS_CHANGED;
      if (validated.status === TaskStatus.EN_ROUTE) {
        notifType = NotificationType.HELP_EN_ROUTE;
      }

      await notificationService.dispatchNotification({
        type: notifType,
        title: `Task Status: [${updated.type}] is now ${updated.status}`,
        body: `Progress on case ${updated.reportId}: ${updated.title} is ${updated.status}.${validated.note ? ` (${validated.note})` : ''}`,
        priority: 'NORMAL',
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        metadata: { taskId: updated.id, reportId: updated.reportId, status: updated.status },
      });

      res.status(200).json({
        success: true,
        message: `Task status updated to ${updated.status}. Timeline event logged.`,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async updateTaskLocation(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;
      const validated = UpdateTaskLocationSchema.parse(req.body);

      const updated = await coordinationRepository.updateTaskLocation(id, {
        latitude: validated.latitude,
        longitude: validated.longitude,
        heading: validated.heading,
        speed: validated.speed,
        isTrackingActive: validated.isTrackingActive,
      });

      res.status(200).json({
        success: true,
        message: 'Live task location updated.',
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getLiveVolunteerTracking(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const locations = await coordinationRepository.getActiveTrackingLocations();
      res.status(200).json({
        success: true,
        data: locations,
        total: locations.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // CASE CLOSURE & REOPENING
  // ==========================================

  async closeCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { reportId } = req.params;
      const validated = CloseCaseSchema.parse(req.body);

      const found = await reportRepository.findById(reportId);
      if (!found || !found.report) throw new NotFoundError(`Report ${reportId} not found`);
      const report = found.report;

      const result = await coordinationRepository.closeCase(reportId, {
        closingNote: validated.closingNote,
        confirmedWithReporter: validated.confirmedWithReporter,
        closedByUserId: req.user.userId,
      });

      // Update report status in main repository
      await reportRepository.updateReportStatusWithLock({
        reportId,
        status: 'RESOLVED',
        reason: validated.closingNote,
        userId: req.user.userId,
      });

      // Notify reporter & team
      await notificationService.dispatchNotification({
        type: NotificationType.CASE_RESOLVED,
        title: `Incident Resolved: ${report.trackingCode}`,
        body: `Your emergency report has been marked as resolved. Reason/Note: ${validated.closingNote}. Thank you.`,
        priority: 'NORMAL',
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        metadata: { reportId, trackingCode: report.trackingCode },
      });

      res.status(200).json({
        success: true,
        message: 'Case successfully resolved and closed.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async reopenCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { reportId } = req.params;
      const validated = ReopenCaseSchema.parse(req.body);

      const found = await reportRepository.findById(reportId);
      if (!found || !found.report) throw new NotFoundError(`Report ${reportId} not found`);
      const report = found.report;

      const result = await coordinationRepository.reopenCase(reportId, {
        reopenReason: validated.reopenReason,
        reopenedByUserId: req.user.userId,
      });

      await reportRepository.updateReportStatusWithLock({
        reportId,
        status: 'IN_PROGRESS',
        reason: `Reopened: ${validated.reopenReason}`,
        userId: req.user.userId,
      });

      await notificationService.dispatchNotification({
        type: NotificationType.CASE_REOPENED,
        title: `Incident Reopened: ${report.trackingCode}`,
        body: `Case ${report.trackingCode} was reopened by emergency responders. Reason: ${validated.reopenReason}`,
        priority: 'HIGH',
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        metadata: { reportId, trackingCode: report.trackingCode },
      });

      res.status(200).json({
        success: true,
        message: 'Case reopened. Triage status set back to IN_PROGRESS.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // CASE TEAM CHAT
  // ==========================================

  async getCaseChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { reportId } = req.params;

      const found = await reportRepository.findById(reportId);
      if (!found || !found.report) throw new NotFoundError(`Report ${reportId} not found`);
      const report = found.report;

      // Authorization: Responders, Coordinators, Admins, or assigned Aid Providers
      if (
        req.user.role !== Role.ADMIN &&
        req.user.role !== Role.COORDINATOR &&
        req.user.role !== Role.RESPONDER &&
        req.user.role !== Role.AID_PROVIDER
      ) {
        throw new ForbiddenError('You are not authorized to view this case team chat.');
      }

      const messages = await coordinationRepository.listChatMessages(reportId);
      res.status(200).json({
        success: true,
        data: messages,
        total: messages.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async sendCaseChatMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { reportId } = req.params;
      const validated = SendTeamChatMessageSchema.parse(req.body);

      const found = await reportRepository.findById(reportId);
      if (!found || !found.report) throw new NotFoundError(`Report ${reportId} not found`);
      const report = found.report;

      if (
        req.user.role !== Role.ADMIN &&
        req.user.role !== Role.COORDINATOR &&
        req.user.role !== Role.RESPONDER &&
        req.user.role !== Role.AID_PROVIDER
      ) {
        throw new ForbiddenError('You are not authorized to post to this case chat.');
      }

      const message = await coordinationRepository.saveChatMessage({
        reportId,
        senderId: req.user.userId,
        senderName: req.user.email || 'Responder',
        senderRole: req.user.role,
        senderOrg: req.user.organizationId || null,
        message: validated.message,
      });

      res.status(201).json({
        success: true,
        data: message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // BROADCAST ALERTS
  // ==========================================

  async listBroadcastAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { regionId } = req.query;
      const alerts = await coordinationRepository.listActiveBroadcasts(
        regionId as string | undefined
      );

      res.status(200).json({
        success: true,
        data: alerts,
        total: alerts.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async createBroadcastAlert(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = CreateBroadcastAlertSchema.parse(req.body);

      const alert = await coordinationRepository.createBroadcastAlert({
        ...validated,
        createdByUserId: req.user.userId,
        createdByName: req.user.email || 'Emergency Coordinator',
      });

      // Broadcast alert across all public and push channels
      await notificationService.dispatchNotification({
        type: NotificationType.BROADCAST_ALERT,
        title: `📢 Emergency Broadcast: ${alert.title}`,
        body: alert.message,
        priority: alert.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        channels: [
          NotificationChannel.IN_APP,
          NotificationChannel.SMS,
          NotificationChannel.WEB_PUSH,
        ],
        metadata: { broadcastId: alert.id, severity: alert.severity },
      });

      res.status(201).json({
        success: true,
        message: 'Area-wide broadcast alert published.',
        data: alert,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async updateBroadcastAlert(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;
      const validated = UpdateBroadcastAlertSchema.parse(req.body);

      const updated = await coordinationRepository.updateBroadcastAlert(id, validated);
      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // ESCALATIONS
  // ==========================================

  async listEscalations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { regionId } = req.query;
      const alerts = await coordinationRepository.listEscalationAlerts(
        regionId as string | undefined
      );

      res.status(200).json({
        success: true,
        data: alerts,
        total: alerts.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async acknowledgeEscalation(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;

      const acknowledged = await coordinationRepository.acknowledgeEscalationAlert(
        id,
        req.user.email || req.user.userId
      );

      res.status(200).json({
        success: true,
        message: 'Escalation alert acknowledged by coordinator.',
        data: acknowledged,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async triggerEscalationScan(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await escalationService.checkStalledReports();
      res.status(200).json({
        success: true,
        message: `Escalation scan completed. Found ${result.unverifiedStalledCount} unverified stalled, ${result.unmatchedStalledCount} unmatched stalled.`,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // NOTIFICATION PREFERENCES
  // ==========================================

  async getNotificationPreferences(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const prefs = await coordinationRepository.getUserNotificationPreference(
        req.user.userId
      );
      res.status(200).json({
        success: true,
        data: prefs,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async updateNotificationPreferences(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = UpdateNotificationPreferenceSchema.parse(req.body);
      const updated = await coordinationRepository.updateUserNotificationPreference(
        req.user.userId,
        validated
      );
      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const coordinationController = new CoordinationController();
