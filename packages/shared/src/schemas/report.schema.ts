import { z } from 'zod';
import { HazardType, UrgencyLevel, ReportStatus, AbuseFlagReason } from '../types/roles.js';

export const VulnerableGroupEnum = z.enum(['children', 'elderly', 'disabled', 'pregnant']);
export type VulnerableGroup = z.infer<typeof VulnerableGroupEnum>;

export const ReportMediaItemSchema = z.object({
  url: z.string().url('Invalid media URL'),
  mimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ]),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024, 'File size exceeds maximum limit of 25MB'),
  isSensitive: z.boolean().default(false),
});

export const CreateReportSchema = z.object({
  type: z.nativeEnum(HazardType),
  title: z.string().min(3).max(150).optional(),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters detailing the crisis situation')
    .max(5000)
    .trim(),
  severity: z.nativeEnum(UrgencyLevel).default(UrgencyLevel.MEDIUM),
  peopleAffectedCount: z.coerce.number().int().min(1, 'People affected count must be at least 1').default(1),
  vulnerableGroups: z.array(VulnerableGroupEnum).default([]),
  latitude: z.coerce.number().min(-90).max(90, 'Invalid latitude coordinate'),
  longitude: z.coerce.number().min(-180).max(180, 'Invalid longitude coordinate'),
  address: z.string().min(3, 'Human readable location/address is required').trim(),
  contactPhone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid international phone number format')
    .optional()
    .or(z.literal('')),
  isAnonymous: z.boolean().default(false),
  reporterName: z.string().max(100).optional(),
  media: z.array(ReportMediaItemSchema).max(5, 'Maximum of 5 photos or videos allowed').default([]),
  // Anti-bot honeypot: hidden field that legitimate users never populate
  honeypot: z.string().optional().or(z.literal('')),
  // Optional client idempotency key provided in body (or in header Idempotency-Key)
  idempotencyKey: z.string().uuid().optional(),
});

export const OfflineSyncReportItemSchema = CreateReportSchema.extend({
  localId: z.string().min(1, 'Local offline UUID is required'),
  offlineCreatedAt: z.string().datetime({ message: 'Invalid ISO timestamp for offline report' }),
});

export const OfflineSyncSchema = z.object({
  reports: z
    .array(OfflineSyncReportItemSchema)
    .min(1, 'At least one offline report is required for batch sync')
    .max(50, 'Batch limit is 50 reports per sync request'),
});

export const CreateReportUpdateSchema = z.object({
  note: z.string().min(3, 'Update note must be at least 3 characters').max(2000).trim(),
  status: z.nativeEnum(ReportStatus).optional(),
  media: z.array(ReportMediaItemSchema).max(5).default([]),
  isPublic: z.boolean().default(true),
});

export const CreateAbuseFlagSchema = z.object({
  reason: z.nativeEnum(AbuseFlagReason),
  details: z.string().max(1000).optional(),
});

export const PublicReportFeedQuerySchema = z.object({
  type: z.nativeEnum(HazardType).optional(),
  severity: z.nativeEnum(UrgencyLevel).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).default(25),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const VerifyReportSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  method: z.enum([
    'PHONE_CALL',
    'ON_SITE_VISIT',
    'OFFICIAL_AGENCY',
    'PHOTO_METADATA',
    'CROSS_REPORT_CORROBORATION',
  ]).default('PHONE_CALL'),
  confidence: z.number().min(0).max(1).default(1.0),
  reason: z.string().min(3, 'Mandatory verification or rejection reason is required').trim(),
  expectedVersion: z.number().int().positive().optional(),
});

export const RequestMoreInfoSchema = z.object({
  message: z.string().min(5, 'Message must be at least 5 characters').max(2000).trim(),
  expectedVersion: z.number().int().positive().optional(),
});

export const UpdateReportStatusSchema = z.object({
  newStatus: z.nativeEnum(ReportStatus),
  reason: z.string().max(1000).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export const PriorityOverrideSchema = z.object({
  overrideScore: z.number().min(0).max(100),
  overrideReason: z.string().min(5, 'Mandatory note explaining priority override').max(1000).trim(),
  expectedVersion: z.number().int().positive().optional(),
});

export const LockReportSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

export const TriageQueueQuerySchema = z.object({
  status: z.string().optional(),
  hazardType: z.nativeEnum(HazardType).optional(),
  urgency: z.nativeEnum(UrgencyLevel).optional(),
  assignment: z.enum(['all', 'assigned_to_me', 'unassigned']).default('all'),
  regionId: z.string().optional(),
  maxAgeHours: z.coerce.number().positive().optional(),
  sortBy: z.enum(['priority', 'createdAt', 'waitingTime', 'affectedCount']).default('priority'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const BulkActionSchema = z.object({
  reportIds: z.array(z.string().uuid()).min(1, 'Select at least one report').max(50),
  action: z.enum(['VERIFY', 'REJECT', 'PRIORITIZE', 'ASSIGN_TO_ME', 'UNASSIGN']),
  reason: z.string().optional(),
});

export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type ReportMediaItem = z.infer<typeof ReportMediaItemSchema>;
export type OfflineSyncReportItem = z.infer<typeof OfflineSyncReportItemSchema>;
export type OfflineSyncInput = z.infer<typeof OfflineSyncSchema>;
export type CreateReportUpdateInput = z.infer<typeof CreateReportUpdateSchema>;
export type CreateAbuseFlagInput = z.infer<typeof CreateAbuseFlagSchema>;
export type PublicReportFeedQuery = z.infer<typeof PublicReportFeedQuerySchema>;
export type VerifyReportInput = z.infer<typeof VerifyReportSchema>;
export type RequestMoreInfoInput = z.infer<typeof RequestMoreInfoSchema>;
export type UpdateReportStatusInput = z.infer<typeof UpdateReportStatusSchema>;
export type PriorityOverrideInput = z.infer<typeof PriorityOverrideSchema>;
export type LockReportInput = z.infer<typeof LockReportSchema>;
export type TriageQueueQuery = z.infer<typeof TriageQueueQuerySchema>;
export type BulkActionInput = z.infer<typeof BulkActionSchema>;
