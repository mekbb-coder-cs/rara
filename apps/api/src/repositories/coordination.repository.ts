import { PrismaClient } from '@prisma/client';
import {
  TaskType,
  TaskStatus,
  TaskRecord,
  TaskChecklistItem,
  LiveVolunteerLocation,
  TeamChatMessageRecord,
  BroadcastAlertRecord,
  BroadcastSeverity,
  EscalationRuleRecord,
  EscalationAlertRecord,
  UserNotificationPreference,
  DeliveryLogRecord,
  NotificationChannel,
} from '@relieflink/shared';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

export interface ICoordinationRepository {
  // Tasks
  createTask(data: {
    reportId: string;
    matchId?: string | null;
    createdById: string;
    assigneeId?: string | null;
    assigneeName?: string | null;
    type: TaskType;
    title: string;
    description?: string | null;
    deadline?: string | null;
    checklist?: TaskChecklistItem[];
  }): Promise<TaskRecord>;
  getTaskById(id: string): Promise<TaskRecord | null>;
  listTasks(filters?: {
    reportId?: string;
    assigneeId?: string;
    status?: TaskStatus;
    type?: TaskType;
  }): Promise<TaskRecord[]>;
  updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    options?: {
      checklist?: TaskChecklistItem[];
      note?: string;
      userId?: string;
      userRole?: string;
    }
  ): Promise<TaskRecord>;
  updateTaskLocation(
    taskId: string,
    location: {
      latitude: number;
      longitude: number;
      heading?: number | null;
      speed?: number | null;
      isTrackingActive?: boolean;
    }
  ): Promise<TaskRecord>;
  getActiveTrackingLocations(): Promise<LiveVolunteerLocation[]>;

  // Case Closure & Reopening
  closeCase(
    reportId: string,
    data: {
      closingNote: string;
      confirmedWithReporter: boolean;
      closedByUserId: string;
    }
  ): Promise<any>;
  reopenCase(
    reportId: string,
    data: {
      reopenReason: string;
      reopenedByUserId: string;
    }
  ): Promise<any>;

  // Team Chat
  saveChatMessage(data: {
    reportId: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    senderOrg?: string | null;
    message: string;
  }): Promise<TeamChatMessageRecord>;
  listChatMessages(reportId: string): Promise<TeamChatMessageRecord[]>;

  // Broadcast Alerts
  createBroadcastAlert(data: {
    title: string;
    message: string;
    severity?: BroadcastSeverity;
    regionId?: string | null;
    areaName?: string | null;
    expiresAt?: string | null;
    createdByUserId: string;
    createdByName?: string;
  }): Promise<BroadcastAlertRecord>;
  listActiveBroadcasts(regionId?: string | null): Promise<BroadcastAlertRecord[]>;
  updateBroadcastAlert(
    id: string,
    data: Partial<BroadcastAlertRecord>
  ): Promise<BroadcastAlertRecord>;

  // Escalation Rules & Alerts
  getEscalationRule(regionId: string): Promise<EscalationRuleRecord | null>;
  updateEscalationRule(
    regionId: string,
    data: Partial<EscalationRuleRecord>
  ): Promise<EscalationRuleRecord>;
  createEscalationAlert(data: {
    reportId: string;
    reportTrackingCode: string;
    reportTitle: string;
    regionId: string;
    reason: 'UNVERIFIED_STALLED' | 'UNMATCHED_STALLED' | 'MANUAL_ESCALATION';
    waitingMinutes: number;
  }): Promise<EscalationAlertRecord>;
  listEscalationAlerts(regionId?: string | null): Promise<EscalationAlertRecord[]>;
  acknowledgeEscalationAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<EscalationAlertRecord>;

  // Notifications
  getUserNotificationPreference(
    userId: string
  ): Promise<UserNotificationPreference | null>;
  updateUserNotificationPreference(
    userId: string,
    data: Partial<UserNotificationPreference>
  ): Promise<UserNotificationPreference>;
  logDelivery(data: {
    notificationId: string;
    channel: NotificationChannel;
    recipient: string;
    status: 'SENT' | 'FAILED' | 'RETRYING';
    attempts: number;
    lastError?: string | null;
    deliveredAt?: string | null;
  }): Promise<DeliveryLogRecord>;
  listDeliveryLogs(notificationId?: string): Promise<DeliveryLogRecord[]>;
}

// State transition validation for Tasks
export const ALLOWED_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.ASSIGNED]: [TaskStatus.EN_ROUTE, TaskStatus.FAILED],
  [TaskStatus.EN_ROUTE]: [TaskStatus.ON_SITE, TaskStatus.FAILED],
  [TaskStatus.ON_SITE]: [TaskStatus.DONE, TaskStatus.FAILED],
  [TaskStatus.DONE]: [],
  [TaskStatus.FAILED]: [TaskStatus.ASSIGNED], // can be reassigned
};

export class InMemoryCoordinationRepository implements ICoordinationRepository {
  private tasks = new Map<string, TaskRecord>();
  private chatMessages: TeamChatMessageRecord[] = [];
  private broadcastAlerts = new Map<string, BroadcastAlertRecord>();
  private escalationRules = new Map<string, EscalationRuleRecord>();
  private escalationAlerts = new Map<string, EscalationAlertRecord>();
  private notificationPreferences = new Map<string, UserNotificationPreference>();
  private deliveryLogs: DeliveryLogRecord[] = [];

  // References to reports store for updating timelines
  public reportTimelineEvents = new Map<
    string,
    Array<{ id: string; status: string; note: string; createdAt: string }>
  >();

  async createTask(data: {
    reportId: string;
    matchId?: string | null;
    createdById: string;
    assigneeId?: string | null;
    assigneeName?: string | null;
    type: TaskType;
    title: string;
    description?: string | null;
    deadline?: string | null;
    checklist?: TaskChecklistItem[];
  }): Promise<TaskRecord> {
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const task: TaskRecord = {
      id,
      reportId: data.reportId,
      matchId: data.matchId || null,
      assigneeId: data.assigneeId || null,
      assigneeName: data.assigneeName || null,
      type: data.type,
      title: data.title,
      description: data.description || null,
      deadline: data.deadline || null,
      status: TaskStatus.ASSIGNED,
      checklist: data.checklist || [],
      isTrackingActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(id, task);

    // Record initial assignment event on report timeline
    this.addTimelineEvent(
      data.reportId,
      'HELP_ASSIGNED',
      `Field task created: [${data.type}] "${data.title}" assigned to ${data.assigneeName || 'responder team'}.`
    );

    return task;
  }

  async getTaskById(id: string): Promise<TaskRecord | null> {
    return this.tasks.get(id) || null;
  }

  async listTasks(filters?: {
    reportId?: string;
    assigneeId?: string;
    status?: TaskStatus;
    type?: TaskType;
  }): Promise<TaskRecord[]> {
    let result = Array.from(this.tasks.values());
    if (filters?.reportId) {
      result = result.filter((t) => t.reportId === filters.reportId);
    }
    if (filters?.assigneeId) {
      result = result.filter((t) => t.assigneeId === filters.assigneeId);
    }
    if (filters?.status) {
      result = result.filter((t) => t.status === filters.status);
    }
    if (filters?.type) {
      result = result.filter((t) => t.type === filters.type);
    }
    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    options?: {
      checklist?: TaskChecklistItem[];
      note?: string;
      userId?: string;
      userRole?: string;
    }
  ): Promise<TaskRecord> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    if (task.status !== newStatus) {
      const allowed = ALLOWED_TASK_TRANSITIONS[task.status] || [];
      if (!allowed.includes(newStatus)) {
        throw new BadRequestError(
          `Invalid task state transition from ${task.status} to ${newStatus}. Allowed next states: ${allowed.join(', ') || 'none (terminal)'}`
        );
      }
    }

    // If task is completed or failed, automatically disable live tracking
    const autoDisableTracking =
      newStatus === TaskStatus.DONE || newStatus === TaskStatus.FAILED;

    const updated: TaskRecord = {
      ...task,
      status: newStatus,
      checklist: options?.checklist || task.checklist,
      isTrackingActive: autoDisableTracking ? false : task.isTrackingActive,
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, updated);

    // Add corresponding update to the case report's immutable timeline
    let timelineStatus = 'IN_PROGRESS';
    if (newStatus === TaskStatus.EN_ROUTE) timelineStatus = 'HELP_EN_ROUTE';
    if (newStatus === TaskStatus.ON_SITE) timelineStatus = 'RESPONDERS_ON_SITE';
    if (newStatus === TaskStatus.DONE) timelineStatus = 'TASK_COMPLETED';
    if (newStatus === TaskStatus.FAILED) timelineStatus = 'TASK_FAILED';

    this.addTimelineEvent(
      task.reportId,
      timelineStatus,
      `Task [${task.type}] "${task.title}" status changed to ${newStatus}.${options?.note ? ` Note: ${options.note}` : ''}`
    );

    return updated;
  }

  async updateTaskLocation(
    taskId: string,
    location: {
      latitude: number;
      longitude: number;
      heading?: number | null;
      speed?: number | null;
      isTrackingActive?: boolean;
    }
  ): Promise<TaskRecord> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    // Cannot track finished tasks
    const canTrack =
      task.status !== TaskStatus.DONE &&
      task.status !== TaskStatus.FAILED &&
      (location.isTrackingActive ?? true);

    const updated: TaskRecord = {
      ...task,
      lastLatitude: location.latitude,
      lastLongitude: location.longitude,
      lastLocationAt: new Date().toISOString(),
      isTrackingActive: canTrack,
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, updated);
    return updated;
  }

  async getActiveTrackingLocations(): Promise<LiveVolunteerLocation[]> {
    const activeTasks = Array.from(this.tasks.values()).filter(
      (t) =>
        t.isTrackingActive &&
        t.lastLatitude != null &&
        t.lastLongitude != null &&
        t.status !== TaskStatus.DONE &&
        t.status !== TaskStatus.FAILED
    );

    return activeTasks.map((t) => ({
      taskId: t.id,
      assigneeId: t.assigneeId || 'unassigned',
      assigneeName: t.assigneeName || 'Volunteer Responder',
      taskTitle: t.title,
      taskType: t.type,
      taskStatus: t.status,
      latitude: t.lastLatitude!,
      longitude: t.lastLongitude!,
      updatedAt: t.lastLocationAt || t.updatedAt,
    }));
  }

  async closeCase(
    reportId: string,
    data: {
      closingNote: string;
      confirmedWithReporter: boolean;
      closedByUserId: string;
    }
  ): Promise<any> {
    this.addTimelineEvent(
      reportId,
      'RESOLVED',
      `Case closed. Note: ${data.closingNote}. Confirmation with reporter: ${data.confirmedWithReporter ? 'VERIFIED' : 'PENDING'}.`
    );

    return {
      reportId,
      status: 'RESOLVED',
      closingNote: data.closingNote,
      confirmedWithReporter: data.confirmedWithReporter,
      closedByUserId: data.closedByUserId,
      closedAt: new Date().toISOString(),
    };
  }

  async reopenCase(
    reportId: string,
    data: {
      reopenReason: string;
      reopenedByUserId: string;
    }
  ): Promise<any> {
    this.addTimelineEvent(
      reportId,
      'IN_PROGRESS',
      `Case reopened by responder. Reason: ${data.reopenReason}.`
    );

    return {
      reportId,
      status: 'IN_PROGRESS',
      reopenReason: data.reopenReason,
      reopenedByUserId: data.reopenedByUserId,
      reopenedAt: new Date().toISOString(),
    };
  }

  async saveChatMessage(data: {
    reportId: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    senderOrg?: string | null;
    message: string;
  }): Promise<TeamChatMessageRecord> {
    const msg: TeamChatMessageRecord = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      reportId: data.reportId,
      senderId: data.senderId,
      senderName: data.senderName,
      senderRole: data.senderRole,
      senderOrg: data.senderOrg || null,
      message: data.message,
      createdAt: new Date().toISOString(),
    };
    this.chatMessages.push(msg);
    return msg;
  }

  async listChatMessages(reportId: string): Promise<TeamChatMessageRecord[]> {
    return this.chatMessages
      .filter((m) => m.reportId === reportId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createBroadcastAlert(data: {
    title: string;
    message: string;
    severity?: BroadcastSeverity;
    regionId?: string | null;
    areaName?: string | null;
    expiresAt?: string | null;
    createdByUserId: string;
    createdByName?: string;
  }): Promise<BroadcastAlertRecord> {
    const id = `bcast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const alert: BroadcastAlertRecord = {
      id,
      title: data.title,
      message: data.message,
      severity: data.severity || BroadcastSeverity.WARNING,
      regionId: data.regionId || null,
      areaName: data.areaName || null,
      active: true,
      expiresAt: data.expiresAt || null,
      createdByUserId: data.createdByUserId,
      createdByName: data.createdByName || 'Emergency Coordinator',
      createdAt: new Date().toISOString(),
    };
    this.broadcastAlerts.set(id, alert);
    return alert;
  }

  async listActiveBroadcasts(regionId?: string | null): Promise<BroadcastAlertRecord[]> {
    const now = new Date();
    return Array.from(this.broadcastAlerts.values()).filter((b) => {
      if (!b.active) return false;
      if (b.expiresAt && new Date(b.expiresAt) <= now) return false;
      if (regionId && b.regionId && b.regionId !== regionId) return false;
      return true;
    });
  }

  async updateBroadcastAlert(
    id: string,
    data: Partial<BroadcastAlertRecord>
  ): Promise<BroadcastAlertRecord> {
    const existing = this.broadcastAlerts.get(id);
    if (!existing) throw new NotFoundError(`Broadcast ${id} not found`);
    const updated = { ...existing, ...data };
    this.broadcastAlerts.set(id, updated);
    return updated;
  }

  async getEscalationRule(regionId: string): Promise<EscalationRuleRecord | null> {
    return (
      this.escalationRules.get(regionId) || {
        id: `rule-${regionId}`,
        regionId,
        unverifiedThresholdMinutes: 30,
        unmatchedThresholdMinutes: 60,
        isActive: true,
      }
    );
  }

  async updateEscalationRule(
    regionId: string,
    data: Partial<EscalationRuleRecord>
  ): Promise<EscalationRuleRecord> {
    const existing = await this.getEscalationRule(regionId);
    const updated = { ...existing!, ...data };
    this.escalationRules.set(regionId, updated);
    return updated;
  }

  async createEscalationAlert(data: {
    reportId: string;
    reportTrackingCode: string;
    reportTitle: string;
    regionId: string;
    reason: 'UNVERIFIED_STALLED' | 'UNMATCHED_STALLED' | 'MANUAL_ESCALATION';
    waitingMinutes: number;
  }): Promise<EscalationAlertRecord> {
    const id = `esc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const alert: EscalationAlertRecord = {
      id,
      reportId: data.reportId,
      reportTrackingCode: data.reportTrackingCode,
      reportTitle: data.reportTitle,
      regionId: data.regionId,
      reason: data.reason,
      waitingMinutes: data.waitingMinutes,
      triggeredAt: new Date().toISOString(),
    };
    this.escalationAlerts.set(id, alert);

    this.addTimelineEvent(
      data.reportId,
      'ESCALATED_TO_COORDINATOR',
      `Case escalated automatically: ${data.reason === 'UNVERIFIED_STALLED' ? 'Unverified for over threshold' : 'Unmatched aid need stalled'}. Priority alert dispatched to regional emergency coordination.`
    );

    return alert;
  }

  async listEscalationAlerts(regionId?: string | null): Promise<EscalationAlertRecord[]> {
    let result = Array.from(this.escalationAlerts.values());
    if (regionId) {
      result = result.filter((a) => a.regionId === regionId);
    }
    return result.sort(
      (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    );
  }

  async acknowledgeEscalationAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<EscalationAlertRecord> {
    const alert = this.escalationAlerts.get(alertId);
    if (!alert) throw new NotFoundError(`Escalation alert ${alertId} not found`);
    const updated: EscalationAlertRecord = {
      ...alert,
      acknowledgedBy,
      acknowledgedAt: new Date().toISOString(),
    };
    this.escalationAlerts.set(alertId, updated);
    return updated;
  }

  async getUserNotificationPreference(
    userId: string
  ): Promise<UserNotificationPreference | null> {
    return (
      this.notificationPreferences.get(userId) || {
        userId,
        emailEnabled: true,
        smsEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
      }
    );
  }

  async updateUserNotificationPreference(
    userId: string,
    data: Partial<UserNotificationPreference>
  ): Promise<UserNotificationPreference> {
    const existing = await this.getUserNotificationPreference(userId);
    const updated: UserNotificationPreference = { ...existing!, ...data, userId };
    this.notificationPreferences.set(userId, updated);
    return updated;
  }

  async logDelivery(data: {
    notificationId: string;
    channel: NotificationChannel;
    recipient: string;
    status: 'SENT' | 'FAILED' | 'RETRYING';
    attempts: number;
    lastError?: string | null;
    deliveredAt?: string | null;
  }): Promise<DeliveryLogRecord> {
    const id = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const log: DeliveryLogRecord = {
      id,
      notificationId: data.notificationId,
      channel: data.channel,
      recipient: data.recipient,
      status: data.status,
      attempts: data.attempts,
      lastError: data.lastError || null,
      deliveredAt: data.deliveredAt || null,
      createdAt: new Date().toISOString(),
    };
    this.deliveryLogs.push(log);
    return log;
  }

  async listDeliveryLogs(notificationId?: string): Promise<DeliveryLogRecord[]> {
    if (notificationId) {
      return this.deliveryLogs.filter((l) => l.notificationId === notificationId);
    }
    return this.deliveryLogs;
  }

  private addTimelineEvent(reportId: string, status: string, note: string) {
    const existing = this.reportTimelineEvents.get(reportId) || [];
    existing.push({
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      status,
      note,
      createdAt: new Date().toISOString(),
    });
    this.reportTimelineEvents.set(reportId, existing);
  }
}

// Global active instance
export const coordinationRepository: ICoordinationRepository =
  new InMemoryCoordinationRepository();
