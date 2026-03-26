import { Request } from 'express';
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

/** Helper: build a RedisStore if Redis is connected, else undefined (memory fallback) */
function makeStore(prefix: string) {
  return redisClient.isReady
    ? new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix,
      })
    : undefined;
}

/** Helper: key generator that uses userId when authenticated, IP when not */
function userOrIpKey(req: Request): string {
  if (req.session?.userId) {
    return `user:${req.session.userId}`;
  }
  // Normalize IPv6-mapped IPv4 (::ffff:127.0.0.1 → 127.0.0.1)
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return ip.replace(/^::ffff:/, '');
}

// Disable the IPv6 key generator validation (we handle IPv6 normalization manually above)
const validate = { keyGeneratorIpFallback: false } as const;

const skipInTest = () => process.env.NODE_ENV === 'test';

/**
 * Auth rate limiter — 5 req/min per IP
 * For login, register, password change, MFA endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many requests. Please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
  store: makeStore('rl:auth:'),
  skip: skipInTest,
});

// Keep the old name as an alias so existing imports still work
export const loginRateLimiter = authRateLimiter;

/**
 * Mutation rate limiter — 120 req/min per authenticated user (or per IP)
 * For POST/PUT/DELETE on data endpoints
 * Raised from 30 to support bulk paste/delete operations on the schedule grid
 */
export const mutationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  keyGenerator: userOrIpKey,
  validate,
  message: 'Too many requests. Please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
  store: makeStore('rl:mutation:'),
  skip: skipInTest,
});

/**
 * Read rate limiter — 200 req/min per authenticated user (or per IP)
 * For GET on data endpoints
 */
export const readRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  keyGenerator: userOrIpKey,
  validate,
  message: 'Too many requests. Please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
  store: makeStore('rl:read:'),
  skip: skipInTest,
});

/**
 * General rate limiter for all API endpoints
 * 600 requests per 15 minutes per IP (40/min — comfortable for SPA usage)
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 600,
  message: 'Too many requests. Please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
  store: makeStore('rl:general:'),
  skip: skipInTest,
});
