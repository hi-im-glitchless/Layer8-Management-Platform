import crypto from 'node:crypto';
import { prisma } from '@/db/prisma.js';
import { redisClient } from '@/db/redis.js';

/**
 * Create a trusted device for a user (30-day "remember me" functionality)
 * @param userId - User ID
 * @param deviceIdentifier - Device identifier (e.g., user-agent string)
 * @returns Device token to be stored in cookie
 */
export async function createTrustedDevice(
  userId: string,
  deviceIdentifier: string
): Promise<string> {
  // Generate random token
  const deviceToken = crypto.randomBytes(32).toString('hex');

  // Hash the device identifier + token for storage
  const deviceHash = crypto
    .createHash('sha256')
    .update(`${deviceIdentifier}:${deviceToken}`)
    .digest('hex');

  // Create device with 30-day expiry
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.trustedDevice.create({
    data: {
      userId,
      deviceHash,
      expiresAt,
    },
  });

  return deviceToken;
}

/**
 * Check if a device is trusted for a user
 * @param userId - User ID
 * @param deviceToken - Device token from cookie
 * @param deviceIdentifier - Device identifier (e.g., user-agent string) from request
 * @returns True if device is trusted and not expired
 */
export async function isTrustedDevice(
  userId: string,
  deviceToken: string,
  deviceIdentifier: string
): Promise<boolean> {
  try {
    // Reconstruct the hash from deviceIdentifier + token
    const deviceHash = crypto
      .createHash('sha256')
      .update(`${deviceIdentifier}:${deviceToken}`)
      .digest('hex');

    // Check if device exists and is not expired
    const device = await prisma.trustedDevice.findFirst({
      where: {
        userId,
        deviceHash,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    return device !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Clean up expired trusted devices
 * @returns Number of devices deleted
 */
export async function cleanupExpiredDevices(): Promise<number> {
  const result = await prisma.trustedDevice.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Active session information
 */
export interface ActiveSession {
  sessionId: string;
  userId: string;
  username: string;
  ipAddress: string | null;
  lastActivity: Date;
  createdAt: Date;
}

/**
 * Get all active sessions from Redis
 * @returns Array of active sessions with user info
 */
export async function getActiveSessions(): Promise<ActiveSession[]> {
  try {
    // Get all session keys from Redis
    const keys = await redisClient.keys('layer8:sess:*');

    const sessions: ActiveSession[] = [];

    for (const key of keys) {
      const sessionData = await redisClient.get(key);
      if (!sessionData) continue;

      try {
        const parsed = JSON.parse(sessionData);

        // Extract session ID from Redis key (remove prefix)
        const sessionId = key.replace('layer8:sess:', '');

        // Only include sessions with userId (logged in sessions)
        if (parsed.userId) {
          // Get username from database
          const user = await prisma.user.findUnique({
            where: { id: parsed.userId },
            select: { username: true },
          });

          sessions.push({
            sessionId,
            userId: parsed.userId,
            username: user?.username || 'Unknown',
            ipAddress: parsed.ipAddress || null,
            lastActivity: parsed.lastActivity ? new Date(parsed.lastActivity) : new Date(),
            createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
          });
        }
      } catch (parseError) {
        // Skip sessions that can't be parsed
        continue;
      }
    }

    return sessions;
  } catch (error) {
    console.error('[session service] Error getting active sessions:', error);
    return [];
  }
}

/**
 * Terminate a specific session
 * @param sessionId - Session ID to terminate
 * @returns True if session was terminated
 */
export async function terminateSession(sessionId: string): Promise<boolean> {
  try {
    const key = `layer8:sess:${sessionId}`;
    const result = await redisClient.del(key);
    return result > 0;
  } catch (error) {
    console.error('[session service] Error terminating session:', error);
    return false;
  }
}

/**
 * Invalidate all active sessions for a user (force re-login)
 * Used when admin changes a user's role
 * @param userId - User ID whose sessions should be destroyed
 * @returns Number of sessions destroyed
 */
export async function invalidateUserSessions(userId: string): Promise<number> {
  try {
    const keys = await redisClient.keys('layer8:sess:*');
    let destroyed = 0;

    for (const key of keys) {
      const sessionData = await redisClient.get(key);
      if (!sessionData) continue;

      try {
        const parsed = JSON.parse(sessionData);
        if (parsed.userId === userId) {
          await redisClient.del(key);
          destroyed++;
        }
      } catch {
        continue;
      }
    }

    return destroyed;
  } catch (error) {
    console.error('[session service] Error invalidating user sessions:', error);
    return 0;
  }
}

/**
 * Clean up expired sessions from Redis
 * Note: Redis sessions expire automatically, but this provides manual cleanup
 * @returns Number of sessions cleaned up
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const keys = await redisClient.keys('layer8:sess:*');
    let cleaned = 0;

    for (const key of keys) {
      const ttl = await redisClient.ttl(key);
      // If TTL is -1 (no expiry) or -2 (doesn't exist), or expired
      if (ttl <= 0) {
        await redisClient.del(key);
        cleaned++;
      }
    }

    return cleaned;
  } catch (error) {
    console.error('[session service] Error cleaning up sessions:', error);
    return 0;
  }
}

// --- Concurrent session tracking ---

const MAX_CONCURRENT_SESSIONS = 3;

function userSessionsKey(userId: string): string {
  return `user:sessions:${userId}`;
}

/**
 * Track a new session for a user. If the user exceeds the concurrent session
 * limit, the oldest sessions are destroyed.
 */
export async function trackSession(
  userId: string,
  sessionId: string,
  createdAt: number
): Promise<void> {
  try {
    if (!redisClient.isReady) return;

    const key = userSessionsKey(userId);

    // Add session to sorted set (score = creation timestamp)
    await redisClient.zAdd(key, { score: createdAt, value: sessionId });

    // Set expiry on the sorted set (24h + buffer to auto-cleanup)
    await redisClient.expire(key, 25 * 60 * 60);

    // Check how many sessions exist
    const count = await redisClient.zCard(key);

    if (count > MAX_CONCURRENT_SESSIONS) {
      // Get the oldest sessions that exceed the limit
      const excess = count - MAX_CONCURRENT_SESSIONS;
      const oldestSessions = await redisClient.zRange(key, 0, excess - 1);

      for (const oldSessionId of oldestSessions) {
        // Destroy the session in the Redis session store
        await redisClient.del(`layer8:sess:${oldSessionId}`);
        // Remove from the tracking set
        await redisClient.zRem(key, oldSessionId);
      }

      console.log(
        `[session service] Evicted ${oldestSessions.length} oldest session(s) for user ${userId}`
      );
    }
  } catch (error) {
    console.error('[session service] Error tracking session:', error);
  }
}

/**
 * Remove a session from user tracking (called on logout).
 */
export async function untrackSession(
  userId: string,
  sessionId: string
): Promise<void> {
  try {
    if (!redisClient.isReady) return;
    await redisClient.zRem(userSessionsKey(userId), sessionId);
  } catch (error) {
    console.error('[session service] Error untracking session:', error);
  }
}
