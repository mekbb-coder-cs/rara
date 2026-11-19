import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { Role } from '@relieflink/shared';
import {
  requireRoles,
  requireRegionAccess,
  requireApprovedOrganization,
} from '../../src/middleware/auth.js';
import { ForbiddenError, UnauthorizedError } from '../../src/utils/errors.js';

describe('RBAC & Permission Unit Tests', () => {
  const mockResponse = {} as Response;
  const mockNext = vi.fn() as unknown as NextFunction;

  it('should allow user with required role to pass', () => {
    const req = {
      user: {
        userId: 'admin-1',
        role: Role.ADMIN,
        assignedRegionIds: [],
        isVerifiedResponder: false,
      },
    } as unknown as Request;

    const middleware = requireRoles(Role.ADMIN, Role.COORDINATOR);
    expect(() => middleware(req, mockResponse, mockNext)).not.toThrow();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should throw ForbiddenError when user has insufficient role', () => {
    const req = {
      user: {
        userId: 'citizen-1',
        role: Role.REPORTER,
        assignedRegionIds: [],
        isVerifiedResponder: false,
      },
    } as unknown as Request;

    const middleware = requireRoles(Role.ADMIN, Role.RESPONDER);
    expect(() => middleware(req, mockResponse, mockNext)).toThrow(ForbiddenError);
  });

  it('should throw UnauthorizedError when user is missing in context', () => {
    const req = {} as unknown as Request;
    const middleware = requireRoles(Role.ADMIN);
    expect(() => middleware(req, mockResponse, mockNext)).toThrow(UnauthorizedError);
  });

  it('should allow ADMIN global access to any region without explicit assignment', () => {
    const req = {
      user: {
        userId: 'admin-1',
        role: Role.ADMIN,
        assignedRegionIds: [], // Empty assigned regions
        isVerifiedResponder: false,
      },
      params: { regionId: 'region-miami-1' },
    } as unknown as Request;

    const middleware = requireRegionAccess('regionId');
    expect(() => middleware(req, mockResponse, mockNext)).not.toThrow();
  });

  it('should allow RESPONDER access to their assigned region', () => {
    const req = {
      user: {
        userId: 'responder-1',
        role: Role.RESPONDER,
        assignedRegionIds: ['region-miami-1', 'region-orlando-2'],
        isVerifiedResponder: true,
      },
      params: { regionId: 'region-miami-1' },
    } as unknown as Request;

    const middleware = requireRegionAccess('regionId');
    expect(() => middleware(req, mockResponse, mockNext)).not.toThrow();
  });

  it('should deny RESPONDER access to unassigned region', () => {
    const req = {
      user: {
        userId: 'responder-1',
        role: Role.RESPONDER,
        assignedRegionIds: ['region-miami-1'],
        isVerifiedResponder: true,
      },
      params: { regionId: 'region-tampa-3' }, // Not in assigned regions!
    } as unknown as Request;

    const middleware = requireRegionAccess('regionId');
    expect(() => middleware(req, mockResponse, mockNext)).toThrow(ForbiddenError);
  });

  it('should reject unapproved organization from posting aid offers or acting as responder', () => {
    const req = {
      user: {
        userId: 'volunteer-1',
        role: Role.AID_PROVIDER,
        organizationId: 'org-unverified-1',
        isOrgApproved: false, // Pending verification
        assignedRegionIds: [],
        isVerifiedResponder: false,
      },
    } as unknown as Request;

    expect(() => requireApprovedOrganization(req, mockResponse, mockNext)).toThrow(ForbiddenError);
  });

  it('should allow approved organization member to proceed', () => {
    const req = {
      user: {
        userId: 'volunteer-1',
        role: Role.AID_PROVIDER,
        organizationId: 'org-verified-1',
        isOrgApproved: true, // Approved by admin
        assignedRegionIds: [],
        isVerifiedResponder: false,
      },
    } as unknown as Request;

    expect(() => requireApprovedOrganization(req, mockResponse, mockNext)).not.toThrow();
  });
});
