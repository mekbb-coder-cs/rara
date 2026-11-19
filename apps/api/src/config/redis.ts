import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

class InMemoryCache {
  private store = new Map<string, { value: string; expiry: number | null }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    let expiry: number | null = null;
    if (mode === 'EX' && duration) {
      expiry = Date.now() + duration * 1000;
    } else if (mode === 'PX' && duration) {
      expiry = Date.now() + duration;
    }
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }
}

let redisClient: Redis | null = null;
const inMemoryCache = new InMemoryCache();

export function getRedisClient(): {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode?: string, duration?: number) => Promise<string>;
  del: (key: string) => Promise<number>;
  ping: () => Promise<string>;
  isFallback: boolean;
} {
  if (env.NODE_ENV === 'test') {
    return {
      get: (k) => inMemoryCache.get(k),
      set: (k, v, m, d) => inMemoryCache.set(k, v, m, d),
      del: (k) => inMemoryCache.del(k),
      ping: () => inMemoryCache.ping(),
      isFallback: true,
    };
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 100, 2000);
        },
      });

      redisClient.on('error', (err) => {
        logger.warn({ err: err.message }, 'Redis connection error, falling back to in-memory store');
      });
    } catch {
      logger.warn('Failed to initialize Redis client, using in-memory store');
    }
  }

  return {
    get: async (k) => {
      try {
        if (redisClient?.status === 'ready') return await redisClient.get(k);
      } catch {}
      return inMemoryCache.get(k);
    },
    set: async (k, v, m, d) => {
      try {
        if (redisClient?.status === 'ready') {
          if (m && d) {
            return await (redisClient as any).set(k, v, m, d);
          }
          return await redisClient.set(k, v);
        }
      } catch {}
      return inMemoryCache.set(k, v, m, d);
    },
    del: async (k) => {
      try {
        if (redisClient?.status === 'ready') return await redisClient.del(k);
      } catch {}
      return inMemoryCache.del(k);
    },
    ping: async () => {
      try {
        if (redisClient?.status === 'ready') return await redisClient.ping();
      } catch {}
      return inMemoryCache.ping();
    },
    isFallback: redisClient?.status !== 'ready',
  };
}
