import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/db/prisma.js';
import {
  hashPassword,
  verifyPassword,
  generateTOTPSecret,
  verifyTOTP,
  checkAccountLock,
  incrementFailedAttempts,
  resetFailedAttempts,
  checkPasswordBreach,
} from '@/services/auth.js';
import {
  createTrustedDevice,
  isTrustedDevice,
} from '@/services/session.js';
import { requireAuth, requirePendingTOTP } from '@/middleware/auth.js';
import { authRateLimiter } from '@/middleware/rateLimit.js';
import { auditMiddleware } from '@/middleware/audit.js';
import { createClient } from 'redis';

const router = Router();

// Create Redis client for TOTP replay prevention
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('Redis Client Error (auth routes):', err));
redisClient.connect().catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

// Zod schemas for request validation
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const totpCodeSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
  rememberDevice: z.boolean().optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*\-_+=]/, 'Password must contain at least one special character'),
});

/**
 * POST /api/auth/login
 * Initial login with username and password
 */
router.post('/login', authRateLimiter, auditMiddleware('auth.login'), async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
    });

    // Generic error message to prevent user enumeration
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check account lock status
    const lockStatus = checkAccountLock(user);
    if (lockStatus.locked) {
      if (lockStatus.until) {
        const retryAfterSeconds = Math.ceil((lockStatus.until.getTime() - Date.now()) / 1000);
        res.set('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      }
      return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    // Verify password
    const isValidPassword = await verifyPassword(user.passwordHash, password);
    if (!isValidPassword) {
      // Increment failed attempts
      await incrementFailedAttempts(user.id);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Password is correct - reset failed attempts
    await resetFailedAttempts(user.id);

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Set session data
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.createdAt = Date.now();
    req.session.lastActivity = Date.now();
    req.session.ipAddress = req.ip || req.socket.remoteAddress || null;

    // Check if user must reset password
    if (user.mustResetPassword) {
      req.session.mustResetPassword = true;
      req.session.totpVerified = false; // Not fully authenticated yet
      return res.json({
        requiresPasswordChange: true,
        message: 'Password change required',
      });
    }

    // Check if TOTP is enabled
    if (user.totpEnabled) {
      // Check if device is trusted
      const deviceToken = req.cookies.layer8_trusted_device;
      const deviceIdentifier = req.headers['user-agent'] || 'unknown';

      if (deviceToken) {
        const trusted = await isTrustedDevice(user.id, deviceToken, deviceIdentifier);
        if (trusted) {
          // Trusted device - skip TOTP
          req.session.totpVerified = true;
          return res.json({
            success: true,
            message: 'Login successful',
          });
        }
      }

      // TOTP required
      req.session.awaitingTOTP = true;
      req.session.totpVerified = false;
      return res.json({
        requiresTOTP: true,
        message: 'TOTP verification required',
      });
    }

    // TOTP not enabled - first login or TOTP not set up
    req.session.totpVerified = false;
    return res.json({
      requiresTOTPSetup: true,
      message: 'TOTP setup required',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues });
    }
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login/totp
 * Verify TOTP code after password login
 */
router.post('/login/totp', authRateLimiter, requirePendingTOTP, auditMiddleware('auth.totp.verify'), async (req: Request, res: Response) => {
  try {
    const { code, rememberDevice } = totpCodeSchema.parse(req.body);

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user || !user.totpSecret || !user.totpEnabled) {
      return res.status(400).json({ error: 'TOTP not configured' });
    }

    // Check replay prevention (if Redis is available)
    if (redisClient.isReady) {
      const replayKey = `totp:used:${user.id}:${code}`;
      const wasUsed = await redisClient.get(replayKey);
      if (wasUsed) {
        return res.status(401).json({ error: 'Invalid code' });
      }
    }

    // Verify TOTP code
    const isValid = await verifyTOTP(user.totpSecret, code);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid code' });
    }

    // Mark code as used (90 second TTL)
    if (redisClient.isReady) {
      await redisClient.setEx(`totp:used:${user.id}:${code}`, 90, '1');
    }

    // TOTP verified - complete login
    req.session.totpVerified = true;
    req.session.awaitingTOTP = false;

    // Handle "remember this device"
    if (rememberDevice) {
      const deviceIdentifier = req.headers['user-agent'] || 'unknown';
      const deviceToken = await createTrustedDevice(user.id, deviceIdentifier);

      // Set cookie with 30-day expiry
      res.cookie('layer8_trusted_device', deviceToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    return res.json({
      success: true,
      message: 'Login successful',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues });
    }
    console.error('TOTP login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/totp/setup
 * Generate TOTP secret and QR code for user setup
 * User must be authenticated but TOTP not yet verified
 */
router.post('/totp/setup', authRateLimiter, auditMiddleware('auth.totp.setup'), async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated (userId exists, but totpVerified not required for setup)
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Allow re-setup only for fully authenticated users (totpVerified=true)
    if (user.totpEnabled && !req.session.totpVerified) {
      return res.status(400).json({ error: 'TOTP already enabled' });
    }

    // Generate TOTP secret
    const { secret, qrCodeDataURL } = await generateTOTPSecret(user.username);

    // Store secret in session (pending verification)
    req.session.pendingTOTPSecret = secret;

    return res.json({
      qrCodeDataURL,
      message: 'Scan QR code with your authenticator app',
    });

  } catch (error) {
    console.error('TOTP setup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/totp/verify-setup
 * Verify TOTP code during setup to enable TOTP
 */
router.post('/totp/verify-setup', authRateLimiter, auditMiddleware('auth.totp.complete'), async (req: Request, res: Response) => {
  try {
    // Check authentication
    if (!req.session.userId || !req.session.pendingTOTPSecret) {
      return res.status(401).json({ error: 'Not authenticated or TOTP setup not initiated' });
    }

    const { code } = totpCodeSchema.parse(req.body);

    // Verify code against pending secret
    const isValid = await verifyTOTP(req.session.pendingTOTPSecret, code);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid code' });
    }

    // Save secret to user record
    await prisma.user.update({
      where: { id: req.session.userId },
      data: {
        totpSecret: req.session.pendingTOTPSecret,
        totpEnabled: true,
      },
    });

    // Clear pending secret and mark as verified
    req.session.pendingTOTPSecret = undefined;
    req.session.totpVerified = true;

    return res.json({
      success: true,
      message: 'TOTP enabled successfully',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues });
    }
    console.error('TOTP verify setup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/password/change
 * Change user password
 */
router.post('/password/change', authRateLimiter, auditMiddleware('auth.password.change'), async (req: Request, res: Response) => {
  try {
    // Check authentication
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If not mustResetPassword, require current password
    if (!user.mustResetPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required' });
      }

      const isValidPassword = await verifyPassword(user.passwordHash, currentPassword);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid current password' });
      }
    }

    // Check password against haveibeenpwned (non-blocking)
    const breachResult = await checkPasswordBreach(newPassword);

    // Hash new password and update
    const newPasswordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustResetPassword: false,
      },
    });

    // Clear mustResetPassword flag in session
    req.session.mustResetPassword = false;

    return res.json({
      success: true,
      message: 'Password changed successfully',
      ...(breachResult.breached && {
        warning: `This password has appeared in ${breachResult.count.toLocaleString()} known data breaches. Consider choosing a different password.`,
      }),
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues });
    }
    console.error('Password change error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Destroy session and log out
 */
router.post('/logout', auditMiddleware('auth.logout'), (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }

    // Clear session cookie
    res.clearCookie('connect.sid');
    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  });
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        totpEnabled: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);

  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
