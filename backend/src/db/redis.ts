import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { config } from '../config.js';

export const redisClient = createClient({
  url: config.REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis connected successfully');
});

export async function connectRedis() {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    throw err;
  }
}

export function createRedisStore() {
  return new RedisStore({
    client: redisClient,
    prefix: 'layer8:sess:',
  });
}
