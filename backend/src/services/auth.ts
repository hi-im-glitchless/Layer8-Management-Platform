import { createHash } from 'crypto';
import argon2 from 'argon2';
import { TOTP, generateSecret, generateURI, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '@/db/prisma.js';

// Create TOTP instance with Noble crypto and Scure Base32 plugins
const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

/**
 * Hash a password using Argon2id
 * @param password - Plain text password
 * @returns Argon2id hash
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verify a password against an Argon2 hash
 * @param hash - Argon2 hash
 * @param password - Plain text password to verify
 * @returns True if password matches hash
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    return false;
  }
}

/**
 * Generate a new TOTP secret and QR code for user setup
 * @param username - Username for TOTP label
 * @returns Object with base32 secret and QR code data URL
 */
export async function generateTOTPSecret(username: string): Promise<{
  secret: string;
  qrCodeDataURL: string;
}> {
  const secret = generateSecret();
  const otpauth = generateURI({
    issuer: 'AI Template Regenerator',
    label: username,
    secret,
  });
  const qrCodeDataURL = await QRCode.toDataURL(otpauth);

  return {
    secret,
    qrCodeDataURL,
  };
}

/**
 * Verify a TOTP token against a secret
 * @param secret - Base32 TOTP secret
 * @param token - 6-digit TOTP token
 * @returns True if token is valid
 */
export async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  try {
    // Generate current valid token
    const validToken = await totp.generate({ secret });
    return validToken === token;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a user account is locked
 * @param user - User object with lockout fields
 * @returns Lock status with expiration details
 */
export function checkAccountLock(user: {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  isActive: boolean;
}): {
  locked: boolean;
  until?: Date;
  requiresAdmin?: boolean;
} {
  // Account disabled by admin (15+ failed attempts)
  if (!user.isActive) {
    return {
      locked: true,
      requiresAdmin: true,
    };
  }

  // Check if temporary lock is still active
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      locked: true,
      until: user.lockedUntil,
    };
  }

  // Not locked
  return {
    locked: false,
  };
}

/**
 * Increment failed login attempts and apply progressive lockout policy
 * - 5 failures: 5 minute lock
 * - 10 failures: 15 minute lock
 * - 15 failures: admin lock (account disabled)
 * @param userId - User ID
 */
export async function incrementFailedAttempts(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true },
  });

  if (!user) return;

  const newCount = user.failedLoginAttempts + 1;
  const updateData: {
    failedLoginAttempts: number;
    lockedUntil?: Date | null;
    isActive?: boolean;
  } = {
    failedLoginAttempts: newCount,
  };

  // Progressive lockout policy
  if (newCount >= 15) {
    // 15+ failures: admin lock
    updateData.isActive = false;
    updateData.lockedUntil = null;
  } else if (newCount >= 10) {
    // 10-14 failures: 15 minute lock
    updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  } else if (newCount >= 5) {
    // 5-9 failures: 5 minute lock
    updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });
}

/**
 * Reset failed login attempts and unlock account
 * @param userId - User ID
 */
export async function resetFailedAttempts(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}

/**
 * Check a password against the haveibeenpwned Passwords API using k-anonymity.
 * Non-blocking: returns { breached: false, count: 0 } on any failure.
 */
export async function checkPasswordBreach(password: string): Promise<{ breached: boolean; count: number }> {
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Layer8-PasswordCheck' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`haveibeenpwned API returned ${response.status}`);
      return { breached: false, count: 0 };
    }

    const text = await response.text();
    for (const line of text.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        return { breached: true, count: parseInt(countStr, 10) || 0 };
      }
    }

    return { breached: false, count: 0 };
  } catch (error) {
    console.warn('haveibeenpwned check failed (non-blocking):', error instanceof Error ? error.message : error);
    return { breached: false, count: 0 };
  }
}
