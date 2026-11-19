import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';
import { regionRepository, InMemoryRegionRepository } from '../../src/repositories/region.repository.js';
import { Role } from '@relieflink/shared';
import { generateAccessToken } from '../../src/utils/crypto.js';

describe('Region-Scoped Permissions Integration Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
      userRepository.userRegions.clear();
    }
    if (regionRepository instanceof InMemoryRegionRepository) {
      regionRepository.regions.clear();
    }
  });

  it('should enforce region boundaries: responder can access assigned region but not others', async () => {
    // 1. Create two distinct regions
    const regionMiami = await regionRepository.createRegion({
      code: 'US-FL-MIA',
      name: 'Miami-Dade District',
      country: 'USA',
      state: 'FL',
      centerLat: 25.7617,
      centerLng: -80.1918,
    });

    const regionOrlando = await regionRepository.createRegion({
      code: 'US-FL-ORL',
      name: 'Orlando Metro District',
      country: 'USA',
      state: 'FL',
      centerLat: 28.5383,
      centerLng: -81.3792,
    });

    // 2. Create responder assigned ONLY to Miami
    const responder = await userRepository.createUser({
      email: 'miami.responder@ems.fl.gov',
      passwordHash: 'hash',
      fullName: 'Miami EMS Officer',
      role: Role.RESPONDER,
    });
    await userRepository.assignUserToRegion(responder.id, regionMiami.id);

    const token = generateAccessToken({
      userId: responder.id,
      role: Role.RESPONDER,
      isVerifiedResponder: true,
      assignedRegionIds: [regionMiami.id],
    });

    // 3. Responder accesses assigned Miami region -> 200 OK
    const miamiRes = await request(app)
      .get(`/api/v1/regions/${regionMiami.id}/cases`)
      .set('Authorization', `Bearer ${token}`);

    expect(miamiRes.status).toBe(200);
    expect(miamiRes.body.success).toBe(true);
    expect(miamiRes.body.data.regionId).toBe(regionMiami.id);

    // 4. Responder attempts to access Orlando region -> 403 Forbidden
    const orlandoRes = await request(app)
      .get(`/api/v1/regions/${regionOrlando.id}/cases`)
      .set('Authorization', `Bearer ${token}`);

    expect(orlandoRes.status).toBe(403);
    expect(orlandoRes.body.error.code).toBe('FORBIDDEN');
    expect(orlandoRes.body.error.message).toContain('do not have operational authorization');
  });

  it('should grant ADMIN global access to all regions without requiring assignment', async () => {
    const regionTampa = await regionRepository.createRegion({
      code: 'US-FL-TPA',
      name: 'Tampa Bay District',
      country: 'USA',
      state: 'FL',
      centerLat: 27.9506,
      centerLng: -82.4572,
    });

    const admin = await userRepository.createUser({
      email: 'global.admin@relieflink.org',
      passwordHash: 'hash',
      fullName: 'Global System Admin',
      role: Role.ADMIN,
    });

    const adminToken = generateAccessToken({
      userId: admin.id,
      role: Role.ADMIN,
      isVerifiedResponder: false,
      assignedRegionIds: [], // No explicit assignment needed for Admin!
    });

    const res = await request(app)
      .get(`/api/v1/regions/${regionTampa.id}/cases`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.regionId).toBe(regionTampa.id);
  });
});
