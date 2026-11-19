import { OrgType, MemberRole } from '@relieflink/shared';
import { prisma } from '../config/db.js';

export interface OrganizationRecord {
  id: string;
  name: string;
  legalName: string | null;
  type: OrgType;
  registrationNo: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  contactEmail: string;
  contactPhone: string;
  website: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface OrganizationDocumentRecord {
  id: string;
  organizationId: string;
  documentType: string;
  fileUrl: string;
  uploadedAt: Date;
}

export interface OrganizationMemberRecord {
  id: string;
  organizationId: string;
  userId: string;
  memberRole: MemberRole;
  joinedAt: Date;
}

export interface IOrganizationRepository {
  createOrganization(data: {
    name: string;
    legalName?: string;
    type: OrgType;
    registrationNo: string;
    contactEmail: string;
    contactPhone: string;
    website?: string;
    documentUrls: string[];
    ownerUserId: string;
  }): Promise<{ organization: OrganizationRecord; documents: OrganizationDocumentRecord[] }>;

  findById(id: string): Promise<OrganizationRecord | null>;
  findByRegistrationNo(registrationNo: string): Promise<OrganizationRecord | null>;
  getPendingOrganizations(): Promise<OrganizationRecord[]>;
  listOrganizations(isVerified?: boolean): Promise<OrganizationRecord[]>;
  approveOrganization(id: string, notes?: string): Promise<OrganizationRecord>;
  rejectOrganization(id: string, reason: string): Promise<OrganizationRecord>;
  getOrganizationDocuments(organizationId: string): Promise<OrganizationDocumentRecord[]>;

  // Membership
  addMember(organizationId: string, userId: string, memberRole: MemberRole): Promise<OrganizationMemberRecord>;
  getMembers(organizationId: string): Promise<OrganizationMemberRecord[]>;
  getUserOrganization(userId: string): Promise<{ organization: OrganizationRecord; memberRole: MemberRole } | null>;
}

// In-Memory Implementation
export class InMemoryOrganizationRepository implements IOrganizationRepository {
  public organizations: Map<string, OrganizationRecord> = new Map();
  public documents: Map<string, OrganizationDocumentRecord> = new Map();
  public members: Map<string, OrganizationMemberRecord> = new Map();

  async createOrganization(data: {
    name: string;
    legalName?: string;
    type: OrgType;
    registrationNo: string;
    contactEmail: string;
    contactPhone: string;
    website?: string;
    documentUrls: string[];
    ownerUserId: string;
  }): Promise<{ organization: OrganizationRecord; documents: OrganizationDocumentRecord[] }> {
    const orgId = crypto.randomUUID();
    const now = new Date();
    const org: OrganizationRecord = {
      id: orgId,
      name: data.name,
      legalName: data.legalName || null,
      type: data.type,
      registrationNo: data.registrationNo,
      isVerified: false,
      verifiedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      website: data.website || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.organizations.set(orgId, org);

    const docs: OrganizationDocumentRecord[] = [];
    for (const url of data.documentUrls) {
      const docId = crypto.randomUUID();
      const doc: OrganizationDocumentRecord = {
        id: docId,
        organizationId: orgId,
        documentType: 'VERIFICATION_DOCUMENT',
        fileUrl: url,
        uploadedAt: now,
      };
      this.documents.set(docId, doc);
      docs.push(doc);
    }

    const memberId = crypto.randomUUID();
    const member: OrganizationMemberRecord = {
      id: memberId,
      organizationId: orgId,
      userId: data.ownerUserId,
      memberRole: MemberRole.OWNER,
      joinedAt: now,
    };
    this.members.set(memberId, member);

    return { organization: org, documents: docs };
  }

  async findById(id: string): Promise<OrganizationRecord | null> {
    return this.organizations.get(id) || null;
  }

  async findByRegistrationNo(registrationNo: string): Promise<OrganizationRecord | null> {
    for (const org of this.organizations.values()) {
      if (org.registrationNo === registrationNo) return org;
    }
    return null;
  }

  async getPendingOrganizations(): Promise<OrganizationRecord[]> {
    return Array.from(this.organizations.values()).filter(
      (org) => !org.isVerified && !org.rejectedAt && !org.deletedAt
    );
  }

  async listOrganizations(isVerified?: boolean): Promise<OrganizationRecord[]> {
    let list = Array.from(this.organizations.values()).filter((org) => !org.deletedAt);
    if (typeof isVerified === 'boolean') {
      list = list.filter((org) => org.isVerified === isVerified);
    }
    return list;
  }

  async approveOrganization(id: string): Promise<OrganizationRecord> {
    const org = this.organizations.get(id);
    if (!org) throw new Error('Organization not found');
    const updated: OrganizationRecord = {
      ...org,
      isVerified: true,
      verifiedAt: new Date(),
      rejectedAt: null,
      rejectionReason: null,
      updatedAt: new Date(),
    };
    this.organizations.set(id, updated);
    return updated;
  }

  async rejectOrganization(id: string, reason: string): Promise<OrganizationRecord> {
    const org = this.organizations.get(id);
    if (!org) throw new Error('Organization not found');
    const updated: OrganizationRecord = {
      ...org,
      isVerified: false,
      rejectedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    };
    this.organizations.set(id, updated);
    return updated;
  }

  async getOrganizationDocuments(organizationId: string): Promise<OrganizationDocumentRecord[]> {
    return Array.from(this.documents.values()).filter((doc) => doc.organizationId === organizationId);
  }

  async addMember(organizationId: string, userId: string, memberRole: MemberRole): Promise<OrganizationMemberRecord> {
    const id = crypto.randomUUID();
    const member: OrganizationMemberRecord = {
      id,
      organizationId,
      userId,
      memberRole,
      joinedAt: new Date(),
    };
    this.members.set(id, member);
    return member;
  }

  async getMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    return Array.from(this.members.values()).filter((m) => m.organizationId === organizationId);
  }

  async getUserOrganization(userId: string): Promise<{ organization: OrganizationRecord; memberRole: MemberRole } | null> {
    for (const member of this.members.values()) {
      if (member.userId === userId) {
        const org = this.organizations.get(member.organizationId);
        if (org) {
          return { organization: org, memberRole: member.memberRole };
        }
      }
    }
    return null;
  }
}

// Prisma Implementation
export class PrismaOrganizationRepository implements IOrganizationRepository {
  async createOrganization(data: {
    name: string;
    legalName?: string;
    type: OrgType;
    registrationNo: string;
    contactEmail: string;
    contactPhone: string;
    website?: string;
    documentUrls: string[];
    ownerUserId: string;
  }): Promise<{ organization: OrganizationRecord; documents: OrganizationDocumentRecord[] }> {
    return await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.name,
          legalName: data.legalName,
          type: data.type as any,
          registrationNo: data.registrationNo,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          website: data.website,
        },
      });

      const docs = await Promise.all(
        data.documentUrls.map((url) =>
          tx.organizationDocument.create({
            data: {
              organizationId: org.id,
              fileUrl: url,
            },
          })
        )
      );

      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: data.ownerUserId,
          memberRole: MemberRole.OWNER as any,
        },
      });

      return {
        organization: org as unknown as OrganizationRecord,
        documents: docs as unknown as OrganizationDocumentRecord[],
      };
    });
  }

  async findById(id: string): Promise<OrganizationRecord | null> {
    const org = await prisma.organization.findUnique({ where: { id } });
    return (org as unknown as OrganizationRecord) || null;
  }

  async findByRegistrationNo(registrationNo: string): Promise<OrganizationRecord | null> {
    const org = await prisma.organization.findUnique({ where: { registrationNo } });
    return (org as unknown as OrganizationRecord) || null;
  }

  async getPendingOrganizations(): Promise<OrganizationRecord[]> {
    const orgs = await prisma.organization.findMany({
      where: { isVerified: false, rejectedAt: null, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return orgs as unknown as OrganizationRecord[];
  }

  async listOrganizations(isVerified?: boolean): Promise<OrganizationRecord[]> {
    const where: any = { deletedAt: null };
    if (typeof isVerified === 'boolean') {
      where.isVerified = isVerified;
    }
    const orgs = await prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return orgs as unknown as OrganizationRecord[];
  }

  async approveOrganization(id: string): Promise<OrganizationRecord> {
    const org = await prisma.organization.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
    });
    return org as unknown as OrganizationRecord;
  }

  async rejectOrganization(id: string, reason: string): Promise<OrganizationRecord> {
    const org = await prisma.organization.update({
      where: { id },
      data: {
        isVerified: false,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });
    return org as unknown as OrganizationRecord;
  }

  async getOrganizationDocuments(organizationId: string): Promise<OrganizationDocumentRecord[]> {
    const docs = await prisma.organizationDocument.findMany({
      where: { organizationId },
    });
    return docs as unknown as OrganizationDocumentRecord[];
  }

  async addMember(organizationId: string, userId: string, memberRole: MemberRole): Promise<OrganizationMemberRecord> {
    const member = await prisma.organizationMember.create({
      data: {
        organizationId,
        userId,
        memberRole: memberRole as any,
      },
    });
    return member as unknown as OrganizationMemberRecord;
  }

  async getMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
    });
    return members as unknown as OrganizationMemberRecord[];
  }

  async getUserOrganization(userId: string): Promise<{ organization: OrganizationRecord; memberRole: MemberRole } | null> {
    const member = await prisma.organizationMember.findFirst({
      where: { userId },
      include: { organization: true },
    });
    if (!member) return null;
    return {
      organization: member.organization as unknown as OrganizationRecord,
      memberRole: member.memberRole as unknown as MemberRole,
    };
  }
}

export const organizationRepository: IOrganizationRepository =
  process.env.NODE_ENV === 'test' ? new InMemoryOrganizationRepository() : new PrismaOrganizationRepository();
