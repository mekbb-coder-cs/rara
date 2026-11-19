import { Router } from 'express';
import { Role, AuditAction } from '@relieflink/shared';
import { organizationController } from '../controllers/organization.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = Router();

// Public: view approved organizations
router.get('/', (req, res, next) => organizationController.list(req, res, next));
router.get('/:id', (req, res, next) => organizationController.getById(req, res, next));

// Authenticated: Register organization (NGOs, volunteer groups, agencies)
router.post(
  '/',
  authenticate,
  auditLog(AuditAction.CREATE_REPORT, 'Organization', (req) => req.body?.name || 'NEW_ORG'),
  (req, res, next) => organizationController.register(req, res, next)
);

// Admin only: view pending organizations awaiting verification
router.get(
  '/admin/pending',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => organizationController.getPending(req, res, next)
);

// Admin only: Approve organization
router.patch(
  '/:id/approve',
  authenticate,
  requireRoles(Role.ADMIN),
  auditLog(AuditAction.APPROVE_ORGANIZATION, 'Organization'),
  (req, res, next) => organizationController.approve(req, res, next)
);

// Admin only: Reject organization
router.patch(
  '/:id/reject',
  authenticate,
  requireRoles(Role.ADMIN),
  auditLog(AuditAction.REJECT_ORGANIZATION, 'Organization'),
  (req, res, next) => organizationController.reject(req, res, next)
);

// Add member to organization
router.post(
  '/:id/members',
  authenticate,
  (req, res, next) => organizationController.addMember(req, res, next)
);

export default router;
