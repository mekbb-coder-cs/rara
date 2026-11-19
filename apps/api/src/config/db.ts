import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (e) => {
  logger.error({ err: e }, 'Prisma error');
});

export async function connectDatabase(): Promise<boolean> {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully (Prisma/PostgreSQL)');
    return true;
  } catch (error) {
    logger.warn({ err: error }, 'Could not connect to PostgreSQL database directly. Ensure Docker/Postgres is running.');
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
