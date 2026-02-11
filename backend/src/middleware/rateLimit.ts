import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

// Create Redis client for rate limiting
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to Redis (don't await - let it connect in background)
redisClient.connect().catch((err) => {
  console.error('Failed to connect to Redis for rate limiting:', err);
  console.warn('Rate limiting will use memory store as fallback');
});

/**
 * Rate limiter for login endpoint
 * 5 attempts per 5 minutes per IP
 */
export const loginRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Only use Redis store if connected, otherwise fall back to memory
  store: redisClient.isReady
    ? new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: 'rl:login:',
      })
    : undefined,
  skip: (req) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  },
});

/**
 * General rate limiter for all API endpoints
 * 100 requests per 15 minutes per IP
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient.isReady
    ? new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: 'rl:general:',
      })
    : undefined,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  },
});
