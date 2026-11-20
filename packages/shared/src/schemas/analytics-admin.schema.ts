import { z } from 'zod';

export const UpdatePriorityWeightsSchema = z.object({
  weightSeverity: z.number().min(0).max(10),
  weightPeople: z.number().min(0).max(10),
  weightVulnerability: z.number().min(0).max(10),
  weightWaitingTime: z.number().min(0).max(10),
});

export const UpdateDuplicateClusteringSchema = z.object({
  radiusMeters: z.number().min(50).max(10000),
  timeWindowMinutes: z.number().min(5).max(1440),
  textSimilarityThreshold: z.number().min(0.1).max(1.0).optional(),
});

export const UpdateEscalationThresholdsSchema = z.object({
  defaultUnverifiedMinutes: z.number().min(5).max(1440),
  defaultUnmatchedMinutes: z.number().min(5).max(1440),
});

export const UpdateFeatureFlagsSchema = z.record(z.string(), z.boolean());

export const UpdateDataRetentionSchema = z.object({
  retentionDays: z.number().min(1).max(365),
  autoAnonymizeEnabled: z.boolean(),
});

export const UpdateUserAdminSchema = z.object({
  role: z.enum(['REPORTER', 'RESPONDER', 'AID_PROVIDER', 'COORDINATOR', 'ADMIN']).optional(),
  isVerifiedResponder: z.boolean().optional(),
  isEmailVerified: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const AuditLogQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  entityName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  format: z.enum(['json', 'csv']).default('json'),
});

export const AfterActionReportQuerySchema = z.object({
  regionId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export type UpdatePriorityWeightsInput = z.infer<typeof UpdatePriorityWeightsSchema>;
export type UpdateDuplicateClusteringInput = z.infer<typeof UpdateDuplicateClusteringSchema>;
export type UpdateEscalationThresholdsInput = z.infer<typeof UpdateEscalationThresholdsSchema>;
export type UpdateFeatureFlagsInput = z.infer<typeof UpdateFeatureFlagsSchema>;
export type UpdateDataRetentionInput = z.infer<typeof UpdateDataRetentionSchema>;
export type UpdateUserAdminInput = z.infer<typeof UpdateUserAdminSchema>;
export type AuditLogQueryInput = z.infer<typeof AuditLogQuerySchema>;
export type AfterActionReportQueryInput = z.infer<typeof AfterActionReportQuerySchema>;
