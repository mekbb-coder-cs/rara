import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl || req.url;

  // 1. Zod Validation Error
  if (err instanceof ZodError || err.name === 'ZodError') {
    const formattedIssues = (err as ZodError).issues?.map((i) => ({
      field: i.path?.join('.') || 'root',
      message: i.message,
      code: i.code,
    })) || [{ field: 'root', message: err.message, code: 'invalid' }];

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: formattedIssues,
        path,
        timestamp,
      },
    });
    return;
  }

  // 2. Custom Application Operational Error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        path,
        timestamp,
      },
    });
    return;
  }

  // 3. Syntax / JSON Parsing Error
  if ('type' in err && (err as any).type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: {
        code: 'MALFORMED_JSON',
        message: 'Malformed JSON payload in request body',
        path,
        timestamp,
      },
    });
    return;
  }

  // 4. Unexpected / Internal Server Error
  logger.error(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      method: req.method,
      path,
      ip: req.ip,
    },
    'Unhandled server error occurred'
  );

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.NODE_ENV === 'production' ? 'An unexpected internal error occurred' : err.message,
      path,
      timestamp,
    },
  });
}
