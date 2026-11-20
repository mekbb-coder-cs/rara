import { z } from 'zod';
import { AidType, AidStatus, NeedUrgency, MatchStatus, NeedStatus } from '../types/aid.js';

export const CreateAidOfferSchema = z.object({
  aidType: z.nativeEnum(AidType),
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().max(2000).optional(),
  capacityTotal: z.number().int().positive('Total capacity must be greater than zero'),
  unit: z.string().min(1, 'Unit is required').max(50), // e.g. "liters", "boxes", "beds", "volunteers"
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  serviceRadiusKm: z.number().positive().max(500).default(30.0),
  regionId: z.string().uuid().optional(),
  availableFrom: z.string().datetime().optional(),
  availableUntil: z.string().datetime().optional(),
});

export type CreateAidOfferInput = z.infer<typeof CreateAidOfferSchema>;

export const UpdateAidOfferSchema = z.object({
  title: z.string().min(3).max(150).optional(),
  description: z.string().max(2000).optional(),
  capacityTotal: z.number().int().positive().optional(),
  status: z.nativeEnum(AidStatus).optional(),
  serviceRadiusKm: z.number().positive().max(500).optional(),
  availableUntil: z.string().datetime().nullable().optional(),
});

export type UpdateAidOfferInput = z.infer<typeof UpdateAidOfferSchema>;

export const AidOfferQuerySchema = z.object({
  aidType: z.nativeEnum(AidType).optional(),
  status: z.nativeEnum(AidStatus).optional(),
  organizationId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  maxDistanceKm: z.coerce.number().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AidOfferQueryInput = z.infer<typeof AidOfferQuerySchema>;

export const CreateAidNeedSchema = z.object({
  reportId: z.string().uuid('Valid report ID is required'),
  aidType: z.nativeEnum(AidType),
  quantityRequired: z.number().int().positive('Quantity must be greater than zero'),
  unit: z.string().min(1, 'Unit is required').max(50),
  urgency: z.nativeEnum(NeedUrgency).default(NeedUrgency.URGENT),
  notes: z.string().max(1000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export type CreateAidNeedInput = z.infer<typeof CreateAidNeedSchema>;

export const UpdateAidNeedSchema = z.object({
  quantityRequired: z.number().int().positive().optional(),
  urgency: z.nativeEnum(NeedUrgency).optional(),
  status: z.nativeEnum(NeedStatus).optional(),
  notes: z.string().max(1000).optional(),
});

export type UpdateAidNeedInput = z.infer<typeof UpdateAidNeedSchema>;

export const AidNeedQuerySchema = z.object({
  reportId: z.string().uuid().optional(),
  aidType: z.nativeEnum(AidType).optional(),
  status: z.nativeEnum(NeedStatus).optional(),
  urgency: z.nativeEnum(NeedUrgency).optional(),
  isEscalated: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AidNeedQueryInput = z.infer<typeof AidNeedQuerySchema>;

export const ConfirmMatchSchema = z.object({
  needId: z.string().uuid('Valid need ID is required'),
  offerId: z.string().uuid('Valid offer ID is required'),
  requestedQuantity: z.number().int().positive('Requested quantity must be positive'),
  notes: z.string().max(500).optional(),
  timeoutMinutes: z.number().int().min(5).max(1440).default(60), // default 1 hour provider acceptance window
});

export type ConfirmMatchInput = z.infer<typeof ConfirmMatchSchema>;

export const ProviderMatchResponseSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE', 'PARTIAL']),
  declineReason: z.string().max(500).optional(),
  partiallyFulfilledQuantity: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
}).refine(
  (data) => {
    if (data.action === 'DECLINE' && (!data.declineReason || data.declineReason.trim().length === 0)) {
      return false;
    }
    return true;
  },
  {
    message: 'A mandatory decline reason must be provided when declining a match request.',
    path: ['declineReason'],
  }
).refine(
  (data) => {
    if (data.action === 'PARTIAL' && (!data.partiallyFulfilledQuantity || data.partiallyFulfilledQuantity <= 0)) {
      return false;
    }
    return true;
  },
  {
    message: 'Partially fulfilled quantity must be specified and positive.',
    path: ['partiallyFulfilledQuantity'],
  }
);

export type ProviderMatchResponseInput = z.infer<typeof ProviderMatchResponseSchema>;

export const EscalateNeedSchema = z.object({
  reason: z.string().min(5, 'Escalation reason must be at least 5 characters').max(1000),
});

export type EscalateNeedInput = z.infer<typeof EscalateNeedSchema>;
