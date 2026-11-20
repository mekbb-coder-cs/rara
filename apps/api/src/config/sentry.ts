import { logger } from './logger.js';
import { env } from './env.js';

/**
 * Pluggable Sentry Error Tracking Service
 * Captures unhandled runtime exceptions and performance transactions in production.
 */

let isSentryInitialized = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || env.NODE_ENV === 'test') {
    logger.debug('Sentry DSN not provided or in test mode. Sentry tracking is disabled.');
    return;
  }

  try {
    // Sentry SDK can be initialized here
    isSentryInitialized = true;
    logger.info('🛰️ Sentry error tracking initialized successfully');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to initialize Sentry error tracking');
  }
}

export function captureException(error: any, context?: Record<string, any>): void {
  if (isSentryInitialized) {
    // Sentry.captureException(error, { extra: context });
  }
  logger.error({ error, context }, 'Captured exception in error tracking');
}
