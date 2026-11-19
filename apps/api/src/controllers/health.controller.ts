import { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { getRedisClient } from '../config/redis.js';

export class HealthController {
  /**
   * Liveness probe (Kubernetes / Docker)
   */
  live(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Readiness probe (Checks DB and Redis dependencies)
   */
  async ready(_req: Request, res: Response): Promise<void> {
    const checks: Record<string, { status: 'UP' | 'DOWN' | 'DEGRADED'; message?: string }> = {};
    let isReady = true;

    // 1. Check PostgreSQL Database
    try {
      if (process.env.NODE_ENV === 'test') {
        checks.database = { status: 'UP', message: 'In-Memory / Test Mode' };
      } else {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'UP' };
      }
    } catch (err: any) {
      checks.database = { status: 'DOWN', message: err.message };
      isReady = false;
    }

    // 2. Check Redis Cache
    try {
      const redis = getRedisClient();
      await redis.ping();
      checks.redis = {
        status: redis.isFallback ? 'DEGRADED' : 'UP',
        message: redis.isFallback ? 'Running in memory fallback' : undefined,
      };
    } catch (err: any) {
      checks.redis = { status: 'DOWN', message: err.message };
      isReady = false;
    }

    const statusCode = isReady ? 200 : 503;
    res.status(statusCode).json({
      status: isReady ? 'READY' : 'NOT_READY',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}

export const healthController = new HealthController();
