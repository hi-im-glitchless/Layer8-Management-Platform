import crypto from 'node:crypto';
import { prisma } from '@/db/prisma.js';

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
