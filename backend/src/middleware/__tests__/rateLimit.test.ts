/**
 * resolveAuthRateLimitMax — auth limiter dev-vs-prod max resolution (Phase 06-01).
 *
 * The MFA enrollment 429 (Phase 6) came from authRateLimiter being a flat 5/min
 * with no development relaxation, unlike generalRateLimiter. The fix routes
 * authRateLimiter.max through resolveAuthRateLimitMax, which relaxes to a high
 * ceiling only in development and keeps the strict production value otherwise.
 *
 * This is a pure-function assertion of the resolver: passing env explicitly so
 * it is deterministic and env-independent (no NODE_ENV mutation, no module
 * re-import, no live limiter / request driving).
 */
import { describe, it, expect } from 'vitest';

import { resolveAuthRateLimitMax } from '../rateLimit.js';

describe('resolveAuthRateLimitMax', () => {
  it('relaxes to a high ceiling (1000) in development so onboarding never 429s', () => {
    expect(resolveAuthRateLimitMax('development')).toBe(1000);
  });

  it('keeps the strict production value (5/min) — auth hardening preserved', () => {
    expect(resolveAuthRateLimitMax('production')).toBe(5);
  });

  it('resolves non-development envs (test) to the strict value (5)', () => {
    expect(resolveAuthRateLimitMax('test')).toBe(5);
  });
});
