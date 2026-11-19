import { z } from 'zod';

export const RequestAnonymousTokenSchema = z.object({
  reportId: z.string().uuid('Invalid report ID format'),
  trackingCode: z
    .string()
    .min(6, 'Invalid tracking code format')
    .max(30)
    .regex(/^[A-Za-z0-9-]+$/, 'Tracking code contains invalid characters'),
});

export const VerifyAnonymousTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type RequestAnonymousTokenInput = z.infer<typeof RequestAnonymousTokenSchema>;
export type VerifyAnonymousTokenInput = z.infer<typeof VerifyAnonymousTokenSchema>;
