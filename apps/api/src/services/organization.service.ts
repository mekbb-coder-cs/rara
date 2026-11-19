import {
  RegisterOrganizationInput,
  ApproveOrganizationInput,
  RejectOrganizationInput,
  AddOrganizationMemberInput,
  AuditAction,
  MemberRole,
} from '@relieflink/shared';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from '../utils/errors.js';
import {
  organizationRepository,
  OrganizationRecord,
  OrganizationDocumentRecord,
} from '../repositories/organization.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';

export class OrganizationService {
  async registerOrganization(
    ownerUserId: string,
    input: RegisterOrganizationInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ organization: OrganizationRecord; documents: OrganizationDocumentRecord[] }> {
    const existing = await organizationRepository.findByRegistrationNo(input.registrationNo);
    if (existing) {
      throw new ConflictError('An organization with this registration number already exists');
    }

    const result = await organizationRepository.createOrganization({
      name: input.name,
      legalName: input.legalName,
      type: input.type,
      registrationNo: input.registrationNo,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      website: input.website || undefined,
      documentUrls: input.documentUrls,
      ownerUserId,
    });

    await auditRepository.createLog({
      userId: ownerUserId,
      action: AuditAction.CREATE_REPORT, // Resource creation
      entityName: 'Organization',
      entityId: result.organization.id,
      ipAddress,
      userAgent,
      metadata: { name: input.name, registrationNo: input.registrationNo },
    });

    return result;
  }

  async getPendingOrganizations(): Promise<OrganizationRecord[]> {
    return await organizationRepository.getPendingOrganizations();
  }

  async listOrganizations(isVerified?: boolean): Promise<OrganizationRecord[]> {
    return await organizationRepository.listOrganizations(isVerified);
  }

  async getOrganization(id: string): Promise<{ organization: OrganizationRecord; documents: OrganizationDocumentRecord[] }> {
    const organization = await organizationRepository.findById(id);
    if (!organization || organization.deletedAt) {
      throw new NotFoundError('Organization not found');
    }
    const documents = await organizationRepository.getOrganizationDocuments(id);
    return { organization, documents };
  }

  async approveOrganization(
    adminUserId: string,
    organizationId: string,
    input: ApproveOrganizationInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OrganizationRecord> {
    const org = await organizationRepository.findById(organizationId);
    if (!org || org.deletedAt) {
      throw new NotFoundError('Organization not found');
    }

    if (org.isVerified) {
      throw new BadRequestError('Organization is already approved');
    }

    const updated = await organizationRepository.approveOrganization(organizationId, input.notes);

    await auditRepository.createLog({
      userId: adminUserId,
      action: AuditAction.APPROVE_ORGANIZATION,
      entityName: 'Organization',
      entityId: organizationId,
      ipAddress,
      userAgent,
      metadata: { notes: input.notes },
    });

    return updated;
  }

  async rejectOrganization(
    adminUserId: string,
    organizationId: string,
    input: RejectOrganizationInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OrganizationRecord> {
    const org = await organizationRepository.findById(organizationId);
    if (!org || org.deletedAt) {
      throw new NotFoundError('Organization not found');
    }

    const updated = await organizationRepository.rejectOrganization(organizationId, input.reason);

    await auditRepository.createLog({
      userId: adminUserId,
      action: AuditAction.REJECT_ORGANIZATION,
      entityName: 'Organization',
      entityId: organizationId,
      ipAddress,
      userAgent,
      metadata: { reason: input.reason },
    });

    return updated;
  }

  async addMember(
    currentUserId: string,
    organizationId: string,
    input: AddOrganizationMemberInput
  ): Promise<{ message: string }> {
    const org = await organizationRepository.findById(organizationId);
    if (!org) throw new NotFoundError('Organization not found');

    const targetUser = await userRepository.findByEmail(input.userEmail);
    if (!targetUser) throw new NotFoundError('No user found with the specified email address');

    await organizationRepository.addMember(organizationId, targetUser.id, input.memberRole || MemberRole.MEMBER);

    return { message: `User ${input.userEmail} successfully added to organization` };
  }
}

export const organizationService = new OrganizationService();
