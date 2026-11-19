import express, { Express, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { securityHeaders, strictCors } from './middleware/security.js';
import { standardRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';
import { swaggerSpec } from './docs/swagger.js';

export function createApp(): Express {
  const app = express();

  // 1. Security Headers & CORS
  app.use(securityHeaders);
  app.use(strictCors);

  // 2. Request Parsing & Cookies
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // 3. Rate Limiting
  app.use(standardRateLimiter);

  // 4. Swagger / OpenAPI Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // 5. Emergency Service Banner & Root Notice (Safety Requirement)
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'ReliefLink API',
      version: '1.0.0',
      notice:
        'For life-threatening emergencies, call your local emergency number immediately. ReliefLink does not replace official emergency services.',
      docs: '/api-docs',
    });
  });

  // 6. Direct Health Endpoints
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'UP', uptime: process.uptime() });
  });

  // 7. Mount Versioned API Routes
  app.use(env.API_PREFIX, apiRoutes);

  // 8. 404 Route Not Found Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // 9. Centralized Error Handler
  app.use(errorHandler);

  return app;
}
