import { OrgType, MemberRole } from './roles.js';

export interface OrganizationDTO {
  id: string;
  name: string;
  legalName?: string | null;
  type: OrgType;
  registrationNo?: string | null;
  isVerified: boolean;
  contactEmail: string;
  contactPhone: string;
  website?: string | null;
  documentUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberDTO {
  id: string;
  organizationId: string;
  userId: string;
  memberRole: MemberRole;
  joinedAt: string;
}
