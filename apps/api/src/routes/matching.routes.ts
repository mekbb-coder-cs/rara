import { Router } from 'express';
import { matchingController } from '../controllers/matching.controller.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Role } from '@relieflink/shared';

const router: Router = Router();

// ==========================================
// AID OFFERS
// ==========================================

router.post(
  '/offers',
  authenticate,
  requireRoles(Role.AID_PROVIDER, Role.ADMIN),
  (req, res, next) => matchingController.createOffer(req, res, next)
);

router.get('/offers', authenticate, (req, res, next) =>
  matchingController.listOffers(req, res, next)
);

router.get('/offers/:id', authenticate, (req, res, next) =>
  matchingController.getOffer(req, res, next)
);

router.patch(
  '/offers/:id',
  authenticate,
  requireRoles(Role.AID_PROVIDER, Role.ADMIN),
  (req, res, next) => matchingController.updateOffer(req, res, next)
);

// ==========================================
// AID NEEDS
// ==========================================

router.post(
  '/needs',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => matchingController.createNeed(req, res, next)
);

router.get('/needs', authenticate, (req, res, next) =>
  matchingController.listNeeds(req, res, next)
);

router.get('/needs/:id', authenticate, (req, res, next) =>
  matchingController.getNeed(req, res, next)
);

router.get(
  '/needs/:id/candidates',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => matchingController.findCandidateMatches(req, res, next)
);

router.post(
  '/needs/:id/escalate',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => matchingController.escalateNeed(req, res, next)
);

// ==========================================
// MATCHING & PROVIDER WORKFLOW
// ==========================================

router.post(
  '/matches/confirm',
  authenticate,
  requireRoles(Role.RESPONDER, Role.COORDINATOR, Role.ADMIN),
  (req, res, next) => matchingController.confirmMatch(req, res, next)
);

router.post(
  '/matches/:id/respond',
  authenticate,
  requireRoles(Role.AID_PROVIDER, Role.ADMIN),
  (req, res, next) => matchingController.providerRespond(req, res, next)
);

router.get(
  '/matches/provider-queue',
  authenticate,
  requireRoles(Role.AID_PROVIDER, Role.ADMIN),
  (req, res, next) => matchingController.listProviderMatches(req, res, next)
);

router.get(
  '/coordinator/unmatched',
  authenticate,
  requireRoles(Role.COORDINATOR, Role.ADMIN, Role.RESPONDER),
  (req, res, next) => matchingController.getCoordinatorOverview(req, res, next)
);

router.post(
  '/matches/process-timeouts',
  authenticate,
  requireRoles(Role.ADMIN, Role.COORDINATOR, Role.RESPONDER),
  (req, res, next) => matchingController.processTimeouts(req, res, next)
);

export default router;
