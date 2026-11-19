import { Request, Response, NextFunction } from 'express';
import { RequestAnonymousTokenSchema, VerifyAnonymousTokenSchema } from '@relieflink/shared';
import { anonymousService } from '../services/anonymous.service.js';

export class AnonymousController {
  async issueTrackingToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = RequestAnonymousTokenSchema.parse(req.body);
      const result = anonymousService.issueTrackingToken(validated);

      res.status(200).json({
        success: true,
        message: 'Anonymous tracking token issued successfully',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyTrackingToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token =
        (req.headers['x-tracking-token'] as string) ||
        (req.query.token as string) ||
        req.body?.token;

      const validated = VerifyAnonymousTokenSchema.parse({ token });
      const payload = anonymousService.verifyTrackingToken(validated.token);

      res.status(200).json({
        success: true,
        message: 'Valid tracking token',
        data: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const anonymousController = new AnonymousController();
