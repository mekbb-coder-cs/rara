import { Request, Response, NextFunction } from 'express';
import {
  RegisterSchema,
  LoginSchema,
  VerifyEmailSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from '@relieflink/shared';
import { authService } from '../services/auth.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE_NAME = 'rl_refresh_token';

function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/v1/auth',
  });
}

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/v1/auth',
  });
}

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = RegisterSchema.parse(req.body);
      const result = await authService.register(
        validated,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );

      res.status(201).json({
        success: true,
        message: 'Account registered successfully. Verification token generated.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = LoginSchema.parse(req.body);
      const result = await authService.login(
        validated,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );

      // Store rotating refresh token in secure httpOnly cookie
      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        message: 'Logged in successfully',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      if (!rawToken) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Refresh token is missing from cookie or request body',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const result = await authService.rotateRefreshToken(
        rawToken,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );

      // Set rotated refresh token in cookie
      setRefreshTokenCookie(res, result.newRefreshToken);

      res.status(200).json({
        success: true,
        message: 'Access token refreshed successfully',
        data: {
          accessToken: result.accessToken,
          expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      clearRefreshTokenCookie(res);
      next(err);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = VerifyEmailSchema.parse(req.body);
      const result = await authService.verifyEmail(validated);

      res.status(200).json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = ForgotPasswordSchema.parse(req.body);
      const result = await authService.requestPasswordReset(validated);

      res.status(200).json({
        success: true,
        message: result.message,
        data: env.NODE_ENV !== 'production' ? { resetToken: result.resetToken } : undefined,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = ResetPasswordSchema.parse(req.body);
      const result = await authService.resetPassword(validated);

      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      await authService.logout(rawToken);

      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.userId) {
        await authService.logoutAllDevices(req.user.userId);
      }

      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: 'All device sessions have been terminated',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated', timestamp: new Date().toISOString() },
        });
        return;
      }

      const user = await userRepository.findById(req.user.userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found', timestamp: new Date().toISOString() },
        });
        return;
      }

      const { passwordHash: _, ...safeUser } = user;
      res.status(200).json({
        success: true,
        data: {
          user: safeUser,
          context: req.user,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
