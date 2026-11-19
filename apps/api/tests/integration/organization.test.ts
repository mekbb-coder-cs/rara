import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';
import { organizationRepository, InMemoryOrganizationRepository } from '../../src/repositories/organization.repository.js';
import { Role, OrgType } from '@relieflink/shared';
import { generateAccessToken } from '../../src/utils/crypto.js';

describe('Organization Lifecycle & Verification Integration Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
      userRepository.refreshTokens.clear();
    }
    if (organizationRepository instanceof InMemoryOrganizationRepository) {
      organizationRepository.organizations.clear();
      organizationRepository.documents.clear();
      organizationRepository.members.clear();
    }
  });

  it('should allow user to register organization with verification documents', async () => {
    // 1. Create a user representing an NGO leader
    const user = await userRepository.createUser({
      email: 'leader@redcross-local.org',
      passwordHash: 'hash',
      fullName: 'NGO Leader',
      role: Role.AID_PROVIDER,
    });

    const token = generateAccessToken({
      userId: user.id,
      role: Role.AID_PROVIDER,
      isVerifiedResponder: false,
      assignedRegionIds: [],
    });

    // 2. Register organization
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Relief Foundation Alpha',
        type: OrgType.NGO,
        registrationNo: 'NGO-FL-99482',
        contactEmail: 'contact@alpha-relief.org',
        contactPhone: '+13055550188',
        documentUrls: [
          'https://storage.relieflink.org/verifications/tax-exemption-501c3.pdf',
          'https://storage.relieflink.org/verifications/state-license.pdf',
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organization.name).toBe('Relief Foundation Alpha');
    expect(res.body.data.organization.isVerified).toBe(false); // Awaits admin review
    expect(res.body.data.documents).toHaveLength(2);
  });

  it('should restrict pending list and approval to ADMIN role only', async () => {
    const adminUser = await userRepository.createUser({
      email: 'superadmin@relieflink.org',
      passwordHash: 'hash',
      fullName: 'System Admin',
      role: Role.ADMIN,
    });

    const regularUser = await userRepository.createUser({
      email: 'citizen@relieflink.org',
      passwordHash: 'hash',
      fullName: 'Citizen',
      role: Role.REPORTER,
    });

    const adminToken = generateAccessToken({
      userId: adminUser.id,
      role: Role.ADMIN,
      isVerifiedResponder: false,
      assignedRegionIds: [],
    });

    const regularToken = generateAccessToken({
      userId: regularUser.id,
      role: Role.REPORTER,
      isVerifiedResponder: false,
      assignedRegionIds: [],
    });

    // Regular user cannot see pending queue
    const forbiddenRes = await request(app)
      .get('/api/v1/organizations/admin/pending')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(forbiddenRes.status).toBe(403);

    // Admin can see pending queue
    const adminRes = await request(app)
      .get('/api/v1/organizations/admin/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
  });

  it('should allow ADMIN to approve organization and enable operations', async () => {
    // 1. Create admin and NGO founder
    const admin = await userRepository.createUser({
      email: 'admin@gov.org',
      passwordHash: 'hash',
      fullName: 'Admin',
      role: Role.ADMIN,
    });

    const ngoUser = await userRepository.createUser({
      email: 'founder@rescue-crew.org',
      passwordHash: 'hash',
      fullName: 'Founder',
      role: Role.AID_PROVIDER,
    });

    const adminToken = generateAccessToken({
      userId: admin.id,
      role: Role.ADMIN,
      isVerifiedResponder: false,
      assignedRegionIds: [],
    });

    // 2. Create organization in repo
    const { organization } = await organizationRepository.createOrganization({
      name: 'Rapid Rescue NGO',
      type: OrgType.NGO,
      registrationNo: 'REG-99120',
      contactEmail: 'contact@rapidrescue.org',
      contactPhone: '+13055550177',
      documentUrls: ['https://storage.relieflink.org/docs/license.pdf'],
      ownerUserId: ngoUser.id,
    });

    expect(organization.isVerified).toBe(false);

    // 3. Admin approves
    const approveRes = await request(app)
      .patch(`/api/v1/organizations/${organization.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Verified with state department of health' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.isVerified).toBe(true);

    // Verify stored state in repository
    const stored = await organizationRepository.findById(organization.id);
    expect(stored?.isVerified).toBe(true);
  });

  it('should allow ADMIN to reject fraudulent organization with a recorded reason', async () => {
    const admin = await userRepository.createUser({
      email: 'admin2@gov.org',
      passwordHash: 'hash',
      fullName: 'Admin 2',
      role: Role.ADMIN,
    });

    const adminToken = generateAccessToken({
      userId: admin.id,
      role: Role.ADMIN,
      isVerifiedResponder: false,
      assignedRegionIds: [],
    });

    const { organization } = await organizationRepository.createOrganization({
      name: 'Fake Scam Charity',
      type: OrgType.NGO,
      registrationNo: 'FAKE-0000',
      contactEmail: 'scam@fake.org',
      contactPhone: '+13055550000',
      documentUrls: ['https://storage.relieflink.org/docs/fake.pdf'],
      ownerUserId: 'scammer-id',
    });

    const rejectRes = await request(app)
      .patch(`/api/v1/organizations/${organization.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Invalid registration license number provided; verified invalid with state registrar.' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.isVerified).toBe(false);
    expect(rejectRes.body.data.rejectionReason).toContain('Invalid registration license');
  });
});
