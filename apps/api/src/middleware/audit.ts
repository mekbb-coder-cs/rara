import { Request, Response, NextFunction } from 'express';
import { AuditAction } from '@relieflink/shared';
import { auditRepository } from '../repositories/audit.repository.js';
import { logger } from '../config/logger.js';

export function auditLog(action: AuditAction, entityName: string, getEntityId?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Intercept response finish to verify status code was successful before logging
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        try {
          const rawId = req.params?.id;
          const entityId = getEntityId
            ? getEntityId(req)
            : typeof rawId === 'string'
              ? rawId
              : Array.isArray(rawId)
                ? rawId[0]
                : 'N/A';
          await auditRepository.createLog({
            userId: req.user?.userId,
            userRole: req.user?.role,
            action,
            entityName,
            entityId,
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: Array.isArray(req.headers['user-agent'])
              ? req.headers['user-agent'][0]
              : req.headers['user-agent'],
            metadata: {
              method: req.method,
              path: req.originalUrl || req.url,
              params: req.params,
            },
          });
        } catch (err) {
          logger.error({ err }, 'Failed to record audit log');
        }
      }
    });

    next();
  };
}
