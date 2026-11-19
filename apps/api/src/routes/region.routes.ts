import { Router, Request, Response } from 'express';
import { Role } from '@relieflink/shared';
import { authenticate, requireRoles, requireRegionAccess } from '../middleware/auth.js';
import { regionRepository } from '../repositories/region.repository.js';
import { userRepository } from '../repositories/user.repository.js';

const router = Router();

// List all active regions
router.get('/', async (_req, res) => {
  const regions = await regionRepository.listActiveRegions();
  res.status(200).json({ success: true, data: regions });
});

// Create region (ADMIN only)
router.post('/', authenticate, requireRoles(Role.ADMIN), async (req: Request, res: Response) => {
  const region = await regionRepository.createRegion(req.body);
  res.status(201).json({ success: true, data: region });
});

// Assign responder to region (ADMIN or COORDINATOR)
router.post('/:regionId/assign-user', authenticate, requireRoles(Role.ADMIN, Role.COORDINATOR), async (req: Request, res: Response) => {
  const { userId } = req.body;
  const regionId = typeof req.params.regionId === 'string' ? req.params.regionId : req.params.regionId[0];
  await userRepository.assignUserToRegion(userId, regionId);
  res.status(200).json({ success: true, message: `User ${userId} assigned to region ${regionId}` });
});

// Region-scoped operational view:
// Requires caller to have access to :regionId (ADMIN has global, RESPONDER must be assigned)
router.get(
  '/:regionId/cases',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  requireRegionAccess('regionId'),
  (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: `Access granted to region ${req.params.regionId} operational queue`,
      data: {
        regionId: req.params.regionId,
        operator: req.user?.userId,
        role: req.user?.role,
      },
    });
  }
);

export default router;
