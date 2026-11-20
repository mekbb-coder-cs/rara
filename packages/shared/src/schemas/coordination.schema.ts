import { z } from 'zod';
import {
  TaskType,
  TaskStatus,
  NotificationChannel,
  NotificationPriority,
  BroadcastSeverity,
} from '../types/coordination.js';

export const TaskChecklistItemSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  text: z.string().min(1, 'Checklist item cannot be empty'),
  completed: z.boolean().default(false),
});

export const CreateTaskSchema = z.object({
  reportId: z.string().uuid('Valid reportId required'),
  matchId: z.string().uuid().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  assigneeName: z.string().optional().nullable(),
  type: z.nativeEnum(TaskType),
  title: z.string().min(3, 'Task title must be at least 3 characters'),
  description: z.string().optional().nullable(),
  deadline: z.string().datetime().optional().nullable(),
  checklist: z.array(TaskChecklistItemSchema).default([]),
});

export const UpdateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
  checklist: z.array(TaskChecklistItemSchema).optional(),
  note: z.string().optional(),
});

export const UpdateTaskLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional().nullable(),
  speed: z.number().min(0).optional().nullable(),
  isTrackingActive: z.boolean().default(true),
});

export const CloseCaseSchema = z.object({
  closingNote: z.string().min(5, 'Closing note must be at least 5 characters'),
  confirmedWithReporter: z.boolean().default(false),
});

export const ReopenCaseSchema = z.object({
  reopenReason: z.string().min(5, 'Reopen reason must be at least 5 characters'),
});

export const UpdateNotificationPreferenceSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:MM')
    .optional()
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:MM')
    .optional()
    .nullable(),
});

export const SendTeamChatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
});

export const CreateBroadcastAlertSchema = z.object({
  title: z.string().min(3, 'Alert title must be at least 3 characters'),
  message: z.string().min(5, 'Alert description must be at least 5 characters'),
  severity: z.nativeEnum(BroadcastSeverity).default(BroadcastSeverity.WARNING),
  regionId: z.string().uuid().optional().nullable(),
  areaName: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const UpdateBroadcastAlertSchema = z.object({
  active: z.boolean().optional(),
  title: z.string().min(3).optional(),
  message: z.string().min(5).optional(),
  severity: z.nativeEnum(BroadcastSeverity).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const UpdateEscalationRuleSchema = z.object({
  unverifiedThresholdMinutes: z.number().int().min(5).max(1440).optional(),
  unmatchedThresholdMinutes: z.number().int().min(5).max(1440).optional(),
  isActive: z.boolean().optional(),
});
