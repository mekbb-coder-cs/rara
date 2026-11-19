import { Role } from './roles.js';

export interface JwtUserPayload {
  userId: string;
  role: Role;
  email?: string;
  isVerifiedResponder: boolean;
  assignedRegionIds: string[];
  organizationId?: string;
  isOrgApproved?: boolean;
}

export interface AnonymousTrackingPayload {
  reportId: string;
  trackingCode: string;
  tokenType: 'ANONYMOUS_REPORT_TRACKING';
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}
