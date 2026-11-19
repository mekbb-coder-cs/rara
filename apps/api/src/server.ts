import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { initSocketServer } from './socket/index.js';

async function bootstrap() {
  const app = createApp();

  // Attempt database connection
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 ReliefLink API running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    logger.info(`📚 Swagger OpenAPI documentation available at http://localhost:${env.PORT}/api-docs`);
    logger.info(`🛡️ Emergency Disclaimer: ReliefLink does not replace official emergency services.`);
  });

  // Initialize Socket.IO real-time server
  initSocketServer(server);
  logger.info('⚡ Socket.IO real-time dispatch server initialized');

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down ReliefLink API...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Database disconnected. Process exited.');
      process.exit(0);
    });

    // Force shutdown after 10 seconds if hanging
    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start ReliefLink API');
  process.exit(1);
});
