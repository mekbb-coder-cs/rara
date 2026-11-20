export enum TaskType {
  DELIVER_SUPPLIES = 'DELIVER_SUPPLIES',
  EVACUATE = 'EVACUATE',
  MEDICAL_VISIT = 'MEDICAL_VISIT',
  SEARCH_RESCUE = 'SEARCH_RESCUE',
  DAMAGE_ASSESSMENT = 'DAMAGE_ASSESSMENT',
  OTHER = 'OTHER',
}

export enum TaskStatus {
  ASSIGNED = 'ASSIGNED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SITE = 'ON_SITE',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TaskRecord {
  id: string;
  reportId: string;
  reportTrackingCode?: string;
  matchId?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeRole?: string | null;
  type: TaskType;
  title: string;
  description?: string | null;
  deadline?: string | null;
  status: TaskStatus;
  checklist: TaskChecklistItem[];
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastLocationAt?: string | null;
  isTrackingActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LiveVolunteerLocation {
  taskId: string;
  assigneeId: string;
  assigneeName: string;
  taskTitle: string;
  taskType: TaskType;
  taskStatus: TaskStatus;
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  updatedAt: string;
}

export enum NotificationType {
  REPORT_RECEIVED = 'REPORT_RECEIVED',
  REPORT_VERIFIED = 'REPORT_VERIFIED',
  HELP_ASSIGNED = 'HELP_ASSIGNED',
  HELP_EN_ROUTE = 'HELP_EN_ROUTE',
  CASE_RESOLVED = 'CASE_RESOLVED',
  CASE_REOPENED = 'CASE_REOPENED',
  CASE_ESCALATED = 'CASE_ESCALATED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
  BROADCAST_ALERT = 'BROADCAST_ALERT',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  WEB_PUSH = 'WEB_PUSH',
  SMS = 'SMS',
}

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface UserNotificationPreference {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursStart?: string | null; // e.g. "22:00"
  quietHoursEnd?: string | null; // e.g. "07:00"
}

export interface DeliveryLogRecord {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  recipient: string;
  status: 'SENT' | 'FAILED' | 'RETRYING';
  attempts: number;
  lastError?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export interface EscalationRuleRecord {
  id: string;
  regionId: string;
  regionName?: string;
  unverifiedThresholdMinutes: number;
  unmatchedThresholdMinutes: number;
  isActive: boolean;
}

export interface EscalationAlertRecord {
  id: string;
  reportId: string;
  reportTrackingCode: string;
  reportTitle: string;
  regionId: string;
  reason: 'UNVERIFIED_STALLED' | 'UNMATCHED_STALLED' | 'MANUAL_ESCALATION';
  waitingMinutes: number;
  triggeredAt: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
}

export interface TeamChatMessageRecord {
  id: string;
  reportId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderOrg?: string | null;
  message: string;
  createdAt: string;
}

export enum BroadcastSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface BroadcastAlertRecord {
  id: string;
  title: string;
  message: string;
  severity: BroadcastSeverity;
  regionId?: string | null;
  areaName?: string | null;
  active: boolean;
  expiresAt?: string | null;
  createdByUserId: string;
  createdByName?: string;
  createdAt: string;
}
