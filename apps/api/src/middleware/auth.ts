import { Request, Response, NextFunction } from 'express';
import { Role } from '@relieflink/shared';
import { verifyAccessToken } from '../utils/crypto.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { userRepository } from '../repositories/user.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';

// Extend Express Request to carry user authentication context
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: Role;
        email?: string;
        isVerifiedResponder: boolean;
        assignedRegionIds: string[];
        assignedRegions?: string[];
        organizationId?: string;
        isOrgApproved?: boolean;
      };
    }
  }
}

/**
 * Validates the JWT Bearer access token from Authorization header
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token missing or invalid format');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // Refresh dynamic user and region data from repository
    const user = await userRepository.findById(payload.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('User account not found or deactivated');
    }

    const assignedRegionIds = await userRepository.getUserRegionIds(user.id);
    const userOrg = await organizationRepository.getUserOrganization(user.id);

    req.user = {
      userId: user.id,
      role: user.role,
      email: user.email || undefined,
      isVerifiedResponder: user.isVerifiedResponder,
      assignedRegionIds,
      assignedRegions: assignedRegionIds,
      organizationId: userOrg?.organization.id,
      isOrgApproved: userOrg?.organization.isVerified || false,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Enforces Role-Based Access Control (RBAC)
 */
export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Access denied. Requires one of the following roles: [${roles.join(', ')}]. Current role: ${req.user.role}`
      );
    }

    next();
  };
}

/**
 * Enforces that AID_PROVIDER or RESPONDER must belong to an approved/verified organization
 */
export function requireApprovedOrganization(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  // Admins & Coordinators bypass organization approval check
  if (req.user.role === Role.ADMIN || req.user.role === Role.COORDINATOR) {
    return next();
  }

  if (req.user.role === Role.AID_PROVIDER || req.user.role === Role.RESPONDER) {
    if (!req.user.organizationId) {
      throw new ForbiddenError('You must be affiliated with a registered organization to perform this action');
    }
    if (!req.user.isOrgApproved) {
      throw new ForbiddenError('Your organization is pending admin verification. Action not permitted until approved.');
    }
  }

  next();
}

/**
 * Region-scoped access check:
 * - ADMIN: Has global access across all regions
 * - COORDINATOR / RESPONDER: Must have the requested regionId in their assignedRegionIds
 */
export function requireRegionAccess(paramName = 'regionId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Admins always have global jurisdiction
    if (req.user.role === Role.ADMIN) {
      return next();
    }

    const targetRegionId =
      req.params[paramName] || (req.query[paramName] as string) || (req.body && req.body[paramName]);

    if (!targetRegionId) {
      throw new ForbiddenError(`Region identifier (${paramName}) is required for this operation`);
    }

    const hasAccess = req.user.assignedRegionIds.includes(targetRegionId);
    if (!hasAccess) {
      throw new ForbiddenError(`You do not have operational authorization for region ID: ${targetRegionId}`);
    }

    next();
  };
}
