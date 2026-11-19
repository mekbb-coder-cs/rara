import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

const router = Router();

router.get('/live', (req, res) => healthController.live(req, res));
router.get('/ready', (req, res) => healthController.ready(req, res));

export default router;
