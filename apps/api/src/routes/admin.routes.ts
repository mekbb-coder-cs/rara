import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Role } from '@relieflink/shared';

const router: Router = Router();

// ==========================================
// SYSTEM CONFIGURATION (ADMIN ONLY)
// ==========================================

router.get(
  '/admin/config',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.getSystemConfig(req, res, next)
);

router.put(
  '/admin/config/priority-weights',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.updatePriorityWeights(req, res, next)
);

router.put(
  '/admin/config/duplicate-clustering',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.updateDuplicateClustering(req, res, next)
);

router.put(
  '/admin/config/escalation-thresholds',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.updateEscalationThresholds(req, res, next)
);

router.put(
  '/admin/config/feature-flags',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.updateFeatureFlags(req, res, next)
);

router.put(
  '/admin/config/data-retention',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.updateDataRetention(req, res, next)
);

// ==========================================
// USER MANAGEMENT (ADMIN ONLY)
// ==========================================

router.get(
  '/admin/users',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.listUsers(req, res, next)
);

router.patch(
  '/admin/users/:id',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.updateUser(req, res, next)
);

// ==========================================
// AUDIT LOGS (ADMIN ONLY)
// ==========================================

router.get(
  '/admin/audit-logs',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.getAuditLogs(req, res, next)
);

router.get(
  '/admin/audit-logs/export',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.exportAuditLogs(req, res, next)
);

// ==========================================
// PRIVACY & COMPLIANCE (ADMIN ONLY)
// ==========================================

router.post(
  '/compliance/retention/run',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.triggerRetentionJob(req, res, next)
);

router.get(
  '/compliance/users/:id/export',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.exportUserData(req, res, next)
);

router.delete(
  '/compliance/users/:id',
  authenticate,
  requireRoles(Role.ADMIN),
  (req, res, next) => adminController.deleteUserData(req, res, next)
);

// ==========================================
// OPERATIONS & ANALYTICS
// ==========================================

router.get(
  '/analytics/operations',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => adminController.getOperationsMetrics(req, res, next)
);

router.get(
  '/analytics/after-action-report',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => adminController.getAfterActionReport(req, res, next)
);

router.get('/analytics/transparency', (req, res, next) =>
  adminController.getPublicTransparency(req, res, next)
);

export default router;
