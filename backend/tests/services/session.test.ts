import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createTrustedDevice,
  isTrustedDevice,
  cleanupExpiredDevices,
} from '@/services/session.js';
import { prisma } from '@/db/prisma.js';

describe('Session Service', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user
    const user = await prisma.user.create({
      data: {
        username: `session_test_${Date.now()}`,
        passwordHash: 'dummy',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test user and related trusted devices
    if (testUserId) {
      await prisma.trustedDevice.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
  });

  beforeEach(async () => {
    // Clean up trusted devices before each test
    await prisma.trustedDevice.deleteMany({ where: { userId: testUserId } });
  });

  describe('createTrustedDevice', () => {
    it('should create a trusted device record and return device token', async () => {
      const deviceIdentifier = 'user-agent-string-123';
      const deviceToken = await createTrustedDevice(testUserId, deviceIdentifier);

      expect(deviceToken).toBeTypeOf('string');
      expect(deviceToken.length).toBeGreaterThan(0);

      // Verify device was created in database
      const devices = await prisma.trustedDevice.findMany({
        where: { userId: testUserId },
      });
      expect(devices.length).toBe(1);
      expect(devices[0].userId).toBe(testUserId);
    });

    it('should create device with 30-day expiry', async () => {
      const deviceIdentifier = 'user-agent-string-123';
      const beforeCreate = Date.now();
      await createTrustedDevice(testUserId, deviceIdentifier);

      const device = await prisma.trustedDevice.findFirst({
        where: { userId: testUserId },
      });

      expect(device).not.toBeNull();
      if (device) {
        const expiryTime = device.expiresAt.getTime();
        const expectedExpiry = beforeCreate + 30 * 24 * 60 * 60 * 1000; // 30 days
        // Allow 1 second variance
        expect(expiryTime).toBeGreaterThan(expectedExpiry - 1000);
        expect(expiryTime).toBeLessThan(expectedExpiry + 1000);
      }
    });

    it('should generate unique tokens for same user/device combination', async () => {
      const deviceIdentifier = 'user-agent-string-123';
      const token1 = await createTrustedDevice(testUserId, deviceIdentifier);
      const token2 = await createTrustedDevice(testUserId, deviceIdentifier);

      expect(token1).not.toBe(token2);
    });
  });

  describe('isTrustedDevice', () => {
    it('should return true for valid trusted device', async () => {
      const deviceIdentifier = 'user-agent-string-123';
      const deviceToken = await createTrustedDevice(testUserId, deviceIdentifier);

      const isTrusted = await isTrustedDevice(testUserId, deviceToken);
      expect(isTrusted).toBe(true);
    });

    it('should return false for invalid token', async () => {
      const isTrusted = await isTrustedDevice(testUserId, 'invalid-token');
      expect(isTrusted).toBe(false);
    });

    it('should return false for expired device', async () => {
      const deviceIdentifier = 'user-agent-string-123';
      const deviceToken = await createTrustedDevice(testUserId, deviceIdentifier);

      // Manually expire the device
      await prisma.trustedDevice.updateMany({
        where: { userId: testUserId },
        data: { expiresAt: new Date(Date.now() - 60000) }, // 1 minute ago
      });

      const isTrusted = await isTrustedDevice(testUserId, deviceToken);
      expect(isTrusted).toBe(false);
    });

    it('should return false for wrong user ID', async () => {
      const deviceIdentifier = 'user-agent-string-123';
      const deviceToken = await createTrustedDevice(testUserId, deviceIdentifier);

      const isTrusted = await isTrustedDevice('wrong-user-id', deviceToken);
      expect(isTrusted).toBe(false);
    });
  });

  describe('cleanupExpiredDevices', () => {
    it('should delete expired trusted devices', async () => {
      // Create one expired and one valid device
      const deviceIdentifier1 = 'user-agent-1';
      const deviceIdentifier2 = 'user-agent-2';

      await createTrustedDevice(testUserId, deviceIdentifier1);
      await createTrustedDevice(testUserId, deviceIdentifier2);

      // Expire first device
      const devices = await prisma.trustedDevice.findMany({
        where: { userId: testUserId },
      });
      await prisma.trustedDevice.update({
        where: { id: devices[0].id },
        data: { expiresAt: new Date(Date.now() - 60000) }, // 1 minute ago
      });

      const deletedCount = await cleanupExpiredDevices();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify only non-expired device remains
      const remainingDevices = await prisma.trustedDevice.findMany({
        where: { userId: testUserId },
      });
      expect(remainingDevices.length).toBe(1);
    });

    it('should return 0 when no expired devices exist', async () => {
      // Create valid device
      await createTrustedDevice(testUserId, 'user-agent-123');

      const deletedCount = await cleanupExpiredDevices();
      expect(deletedCount).toBe(0);

      // Verify device still exists
      const devices = await prisma.trustedDevice.findMany({
        where: { userId: testUserId },
      });
      expect(devices.length).toBe(1);
    });
  });
});
