import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public routes with brute force rate limiting
router.post('/register', authRateLimiter, (req, res, next) => authController.register(req, res, next));
router.post('/login', authRateLimiter, (req, res, next) => authController.login(req, res, next));
router.post('/refresh', (req, res, next) => authController.refreshToken(req, res, next));
router.post('/verify-email', (req, res, next) => authController.verifyEmail(req, res, next));
router.post('/forgot-password', authRateLimiter, (req, res, next) => authController.forgotPassword(req, res, next));
router.post('/reset-password', authRateLimiter, (req, res, next) => authController.resetPassword(req, res, next));
router.post('/logout', (req, res, next) => authController.logout(req, res, next));

// Authenticated routes
router.get('/me', authenticate, (req, res, next) => authController.getMe(req, res, next));
router.post('/logout-all', authenticate, (req, res, next) => authController.logoutAll(req, res, next));

export default router;
