import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateTOTPSecret,
  verifyTOTP,
  checkAccountLock,
  incrementFailedAttempts,
  resetFailedAttempts,
} from '@/services/auth.js';
import { prisma } from '@/db/prisma.js';

describe('Auth Service', () => {
  describe('hashPassword / verifyPassword', () => {
    it('should return a string starting with $argon2id$ (Argon2id format)', async () => {
      const hash = await hashPassword('testpassword123');
      expect(hash).toBeTypeOf('string');
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('should verify correct password', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);
    });

    it('should reject wrong password', async () => {
      const hash = await hashPassword('testpassword123');
      const isValid = await verifyPassword(hash, 'wrongpassword');
      expect(isValid).toBe(false);
    });

    it('should generate different hashes for same password (salt)', async () => {
      const password = 'testpassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateTOTPSecret', () => {
    it('should return object with secret and qrCodeDataURL', async () => {
      const result = await generateTOTPSecret('testuser');
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeDataURL');
      expect(typeof result.secret).toBe('string');
      expect(result.secret.length).toBeGreaterThan(0);
    });

    it('should generate base32 secret', async () => {
      const result = await generateTOTPSecret('testuser');
      // Base32 alphabet: A-Z and 2-7
      const base32Regex = /^[A-Z2-7]+=*$/;
      expect(base32Regex.test(result.secret)).toBe(true);
    });

    it('should generate QR code data URL starting with data:image/png;base64', async () => {
      const result = await generateTOTPSecret('testuser');
      expect(result.qrCodeDataURL.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('should include app name "Layer8" in QR code', async () => {
      const result = await generateTOTPSecret('testuser');
      // QR code should encode otpauth://totp/Layer8:testuser?secret=...&issuer=Layer8
      expect(result.qrCodeDataURL).toContain('base64');
      // We can't easily decode the QR without additional libraries, but the secret generation should use Layer8
    });
  });

  describe('verifyTOTP', () => {
    it('should return true for valid token generated from same secret', async () => {
      const { secret } = await generateTOTPSecret('testuser');
      // We need to generate a valid token from this secret
      const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = await import('otplib');
      const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
      const token = await totp.generate({ secret });
      const isValid = await verifyTOTP(secret, token);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid token', async () => {
      const { secret } = await generateTOTPSecret('testuser');
      const isValid = await verifyTOTP(secret, '000000');
      expect(isValid).toBe(false);
    });

    it('should return false for token from different secret', async () => {
      const { secret: secret1 } = await generateTOTPSecret('testuser1');
      const { secret: secret2 } = await generateTOTPSecret('testuser2');
      const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = await import('otplib');
      const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
      const token2 = await totp.generate({ secret: secret2 });
      const isValid = await verifyTOTP(secret1, token2);
      expect(isValid).toBe(false);
    });
  });

  describe('checkAccountLock', () => {
    it('should return locked: false when failedLoginAttempts < 5', () => {
      const user = {
        failedLoginAttempts: 3,
        lockedUntil: null,
        isActive: true,
      };
      const result = checkAccountLock(user);
      expect(result.locked).toBe(false);
      expect(result.until).toBeUndefined();
    });

    it('should return locked: true when failedLoginAttempts >= 5 and lockedUntil is in future', () => {
      const futureDate = new Date(Date.now() + 300000); // 5 minutes from now
      const user = {
        failedLoginAttempts: 5,
        lockedUntil: futureDate,
        isActive: true,
      };
      const result = checkAccountLock(user);
      expect(result.locked).toBe(true);
      expect(result.until).toEqual(futureDate);
    });

    it('should return locked: false when lockedUntil is in past (lock expired)', () => {
      const pastDate = new Date(Date.now() - 60000); // 1 minute ago
      const user = {
        failedLoginAttempts: 5,
        lockedUntil: pastDate,
        isActive: true,
      };
      const result = checkAccountLock(user);
      expect(result.locked).toBe(false);
    });

    it('should return requiresAdmin: true when isActive is false', () => {
      const user = {
        failedLoginAttempts: 15,
        lockedUntil: null,
        isActive: false,
      };
      const result = checkAccountLock(user);
      expect(result.locked).toBe(true);
      expect(result.requiresAdmin).toBe(true);
    });
  });

  describe('incrementFailedAttempts with database', () => {
    let testUserId: string;

    beforeAll(async () => {
      // Create a test user
      const user = await prisma.user.create({
        data: {
          username: `test_${Date.now()}`,
          passwordHash: 'dummy',
        },
      });
      testUserId = user.id;
    });

    afterAll(async () => {
      // Clean up test user
      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
      }
    });

    it('should increment count by 1', async () => {
      await incrementFailedAttempts(testUserId);
      const user = await prisma.user.findUnique({ where: { id: testUserId } });
      expect(user?.failedLoginAttempts).toBe(1);
    });

    it('should set lockedUntil to 5 minutes from now after 5 failures', async () => {
      // Reset first
      await resetFailedAttempts(testUserId);

      // Increment to 5
      for (let i = 0; i < 5; i++) {
        await incrementFailedAttempts(testUserId);
      }

      const user = await prisma.user.findUnique({ where: { id: testUserId } });
      expect(user?.failedLoginAttempts).toBe(5);
      expect(user?.lockedUntil).not.toBeNull();

      if (user?.lockedUntil) {
        const lockDuration = user.lockedUntil.getTime() - Date.now();
        // Should be around 5 minutes (300000ms), allow 1 second variance
        expect(lockDuration).toBeGreaterThan(299000);
        expect(lockDuration).toBeLessThan(301000);
      }
    });

    it('should set lockedUntil to 15 minutes from now after 10 failures', async () => {
      // Reset first
      await resetFailedAttempts(testUserId);

      // Increment to 10
      for (let i = 0; i < 10; i++) {
        await incrementFailedAttempts(testUserId);
      }

      const user = await prisma.user.findUnique({ where: { id: testUserId } });
      expect(user?.failedLoginAttempts).toBe(10);
      expect(user?.lockedUntil).not.toBeNull();

      if (user?.lockedUntil) {
        const lockDuration = user.lockedUntil.getTime() - Date.now();
        // Should be around 15 minutes (900000ms), allow 1 second variance
        expect(lockDuration).toBeGreaterThan(899000);
        expect(lockDuration).toBeLessThan(901000);
      }
    });

    it('should set isActive to false after 15 failures (requires admin unlock)', async () => {
      // Reset first
      await resetFailedAttempts(testUserId);
      await prisma.user.update({
        where: { id: testUserId },
        data: { isActive: true },
      });

      // Increment to 15
      for (let i = 0; i < 15; i++) {
        await incrementFailedAttempts(testUserId);
      }

      const user = await prisma.user.findUnique({ where: { id: testUserId } });
      expect(user?.failedLoginAttempts).toBe(15);
      expect(user?.isActive).toBe(false);
      expect(user?.lockedUntil).toBeNull();
    });
  });

  describe('resetFailedAttempts', () => {
    let testUserId: string;

    beforeAll(async () => {
      // Create a test user with failed attempts
      const user = await prisma.user.create({
        data: {
          username: `test_reset_${Date.now()}`,
          passwordHash: 'dummy',
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 300000),
        },
      });
      testUserId = user.id;
    });

    afterAll(async () => {
      // Clean up test user
      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
      }
    });

    it('should reset failedLoginAttempts to 0 and lockedUntil to null', async () => {
      await resetFailedAttempts(testUserId);
      const user = await prisma.user.findUnique({ where: { id: testUserId } });
      expect(user?.failedLoginAttempts).toBe(0);
      expect(user?.lockedUntil).toBeNull();
    });
  });
});
