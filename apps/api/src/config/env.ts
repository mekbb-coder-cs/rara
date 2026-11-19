import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('/api/v1'),

  // JWT & Secrets
  JWT_ACCESS_SECRET: z.string().min(16).default('relieflink_jwt_access_secret_key_minimum_32_bytes_super_secure!'),
  JWT_REFRESH_SECRET: z.string().min(16).default('relieflink_jwt_refresh_secret_key_minimum_32_bytes_super_secure!'),
  ANONYMOUS_TOKEN_SECRET: z.string().min(16).default('relieflink_anonymous_secret_key_minimum_32_bytes_super_secure!'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ANONYMOUS_TOKEN_EXPIRES_IN: z.string().default('24h'),

  // Database & Cache
  DATABASE_URL: z.string().default('postgresql://relieflink:relieflink_secret@localhost:5432/relieflink?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Client CORS
  CLIENT_URL: z.string().default('http://localhost:3000'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(10), // Brute force protection: 10 tries per 15 min

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  throw new Error('Invalid environment variables configuration');
}

export const env = parsedEnv.data;
