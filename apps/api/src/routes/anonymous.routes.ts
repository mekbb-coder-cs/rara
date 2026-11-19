import { Router } from 'express';
import { anonymousController } from '../controllers/anonymous.controller.js';

const router = Router();

// Issue anonymous tracking token for a newly submitted report
router.post('/tracking-token', (req, res, next) => anonymousController.issueTrackingToken(req, res, next));

// Verify tracking token validity
router.get('/verify-token', (req, res, next) => anonymousController.verifyTrackingToken(req, res, next));

export default router;
