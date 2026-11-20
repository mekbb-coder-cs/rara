import { Router } from 'express';
import { coordinationController } from '../controllers/coordination.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Role } from '@relieflink/shared';

const router: Router = Router();

// ==========================================
// TASKS
// ==========================================

router.post(
  '/tasks',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.createTask(req, res, next)
);

router.get('/tasks', authenticate, (req, res, next) =>
  coordinationController.listTasks(req, res, next)
);

router.get('/tasks/:id', authenticate, (req, res, next) =>
  coordinationController.getTask(req, res, next)
);

router.patch('/tasks/:id/status', authenticate, (req, res, next) =>
  coordinationController.updateTaskStatus(req, res, next)
);

router.post('/tasks/:id/location', authenticate, (req, res, next) =>
  coordinationController.updateTaskLocation(req, res, next)
);

router.get(
  '/tracking/live',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.getLiveVolunteerTracking(req, res, next)
);

// ==========================================
// CASE CLOSURE & REOPENING
// ==========================================

router.post(
  '/cases/:reportId/close',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.closeCase(req, res, next)
);

router.post(
  '/cases/:reportId/reopen',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.reopenCase(req, res, next)
);

// ==========================================
// CASE TEAM CHAT
// ==========================================

router.get('/cases/:reportId/chat', authenticate, (req, res, next) =>
  coordinationController.getCaseChat(req, res, next)
);

router.post('/cases/:reportId/chat', authenticate, (req, res, next) =>
  coordinationController.sendCaseChatMessage(req, res, next)
);

// ==========================================
// BROADCAST ALERTS (Public Read, Protected Write)
// ==========================================

router.get('/broadcasts', (req, res, next) =>
  coordinationController.listBroadcastAlerts(req, res, next)
);

router.post(
  '/broadcasts',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.createBroadcastAlert(req, res, next)
);

router.patch(
  '/broadcasts/:id',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.updateBroadcastAlert(req, res, next)
);

// ==========================================
// ESCALATIONS
// ==========================================

router.get(
  '/escalations',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.listEscalations(req, res, next)
);

router.post(
  '/escalations/:id/acknowledge',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.acknowledgeEscalation(req, res, next)
);

router.post(
  '/escalations/scan',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => coordinationController.triggerEscalationScan(req, res, next)
);

// ==========================================
// NOTIFICATION PREFERENCES
// ==========================================

router.get(
  '/notifications/preferences',
  authenticate,
  (req, res, next) => coordinationController.getNotificationPreferences(req, res, next)
);

router.put(
  '/notifications/preferences',
  authenticate,
  (req, res, next) => coordinationController.updateNotificationPreferences(req, res, next)
);

export const coordinationRouter = router;
