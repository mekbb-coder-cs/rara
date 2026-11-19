import { Router, Request, Response, NextFunction } from 'express';
import { reportController } from '../controllers/report.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Role } from '@relieflink/shared';
import rateLimit from 'express-rate-limit';

const router: Router = Router();

// Dedicated rate limiter for crisis report submissions (anti-spam / DoS prevention)
const reportSubmissionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many incident reports submitted from this network. Please wait before submitting another report.',
      timestamp: new Date().toISOString(),
    },
  },
});

// Optional authentication middleware: Populates req.user if token is present, but doesn't block guests
async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      await authenticate(req, res, next);
      return;
    } catch {
      // Continue as guest
    }
  }
  next();
}

// 1. Submit incident report (public/anonymous or authenticated)
router.post('/', reportSubmissionRateLimiter, optionalAuth, (req, res, next) =>
  reportController.createReport(req, res, next)
);

// 2. Offline sync batch
router.post('/offline-sync', optionalAuth, (req, res, next) =>
  reportController.syncOffline(req, res, next)
);

// 3. Public map feed (safe, privacy-filtered)
router.get('/public-feed', (req, res, next) =>
  reportController.getPublicFeed(req, res, next)
);

// 4. Track case status by unguessable tracking code
router.get('/track/:trackingCode', (req, res, next) =>
  reportController.trackReport(req, res, next)
);

// 5. Responder Triage Queue (Scoped to region, sortable, with filters & PriorityScore)
router.get(
  '/triage',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.getTriageQueue(req, res, next)
);

// 6. Bulk Triage Actions
router.post(
  '/bulk-action',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.bulkAction(req, res, next)
);

// 7. Get single report details (PII redacted for public; full details for responders)
router.get('/:id', optionalAuth, (req, res, next) =>
  reportController.getById(req, res, next)
);

// 8. Post timeline update to incident
router.post('/:id/updates', optionalAuth, (req, res, next) =>
  reportController.addUpdate(req, res, next)
);

// 9. Flag incident as spam, duplicate, or false report
router.post('/:id/flag', optionalAuth, (req, res, next) =>
  reportController.flagAbuse(req, res, next)
);

// 10. Responder Verification with mandatory reason and method
router.post(
  '/:id/verify',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.verifyReport(req, res, next)
);

// 11. State transition control
router.patch(
  '/:id/status',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.updateStatus(req, res, next)
);

// 12. Active Triage Lock (optimistic concurrency guard)
router.post(
  '/:id/lock',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.lockReport(req, res, next)
);

// 13. Release Active Triage Lock
router.post(
  '/:id/unlock',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.unlockReport(req, res, next)
);

// 14. Assign Responder to Case
router.post(
  '/:id/assign',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.assignResponder(req, res, next)
);

// 15. Manual Priority Override
router.post(
  '/:id/priority-override',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.overridePriority(req, res, next)
);

// 16. Reveal Sensitive Contact Details (Audit Log Mandatory!)
router.post(
  '/:id/reveal-sensitive',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.revealSensitive(req, res, next)
);

// 17. Request More Information from Reporter
router.post(
  '/:id/request-info',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => reportController.requestMoreInfo(req, res, next)
);

export default router;
