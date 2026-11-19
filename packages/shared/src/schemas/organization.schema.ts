import { z } from 'zod';
import { OrgType, MemberRole } from '../types/roles.js';

export const RegisterOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').trim(),
  legalName: z.string().optional(),
  type: z.nativeEnum(OrgType).default(OrgType.NGO),
  registrationNo: z.string().min(3, 'Official registration/license number is required').trim(),
  contactEmail: z.string().email('Invalid organization contact email').toLowerCase().trim(),
  contactPhone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  documentUrls: z
    .array(z.string().url('Invalid document URL'))
    .min(1, 'At least one verification document URL is required'),
});

export const ApproveOrganizationSchema = z.object({
  notes: z.string().optional(),
});

export const RejectOrganizationSchema = z.object({
  reason: z.string().min(5, 'Rejection reason must be provided (minimum 5 characters)').trim(),
});

export const AddOrganizationMemberSchema = z.object({
  userEmail: z.string().email('Invalid email address').toLowerCase().trim(),
  memberRole: z.nativeEnum(MemberRole).default(MemberRole.MEMBER),
});

export type RegisterOrganizationInput = z.infer<typeof RegisterOrganizationSchema>;
export type ApproveOrganizationInput = z.infer<typeof ApproveOrganizationSchema>;
export type RejectOrganizationInput = z.infer<typeof RejectOrganizationSchema>;
export type AddOrganizationMemberInput = z.infer<typeof AddOrganizationMemberSchema>;
