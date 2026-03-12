import Redis from 'ioredis';
import { config } from '@/config';
import { createSingleton } from '../core/singleton';

function createRedisClient() {
  return new Redis({
    host: config.REDIS_URL,
    port: config.REDIS_PORT,
    db: config.REDIS_DB,
  });
}

// let redisClient: Redis | null = null;

// function createRedisClient() {
//   if (!redisClient) {
//     redisClient = new Redis({
//       host: config.REDIS_URL,
//       port: config.REDIS_PORT,
//       db: config.REDIS_DB,
//     });
//   }
//   return redisClient;
// }

const redisClient = createSingleton<Redis>(
  'redis',
  createRedisClient,
  { destroy: async client => void await client.quit() },
);

export const redis = redisClient;
