import { Router } from 'express';
import authRoutes from './auth.routes.js';
import organizationRoutes from './organization.routes.js';
import anonymousRoutes from './anonymous.routes.js';
import healthRoutes from './health.routes.js';
import regionRoutes from './region.routes.js';
import reportRoutes from './report.routes.js';
import matchingRoutes from './matching.routes.js';

const router: Router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/organizations', organizationRoutes);
router.use('/anonymous', anonymousRoutes);
router.use('/regions', regionRoutes);
router.use('/reports', reportRoutes);
router.use('/aid', matchingRoutes);

export default router;
