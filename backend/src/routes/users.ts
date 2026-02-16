import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { hashPassword } from '../services/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';

const router = Router();

// All routes require admin
router.use(requireAdmin);

/**
 * GET /api/users
 * List all users (excluding sensitive fields)
 */
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        isAdmin: true,
        isActive: true,
        totpEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ users });
  } catch (error) {
    console.error('[users routes] Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * POST /api/users
 * Create a new user
 */
router.post('/', auditMiddleware('admin.user.create'), async (req, res) => {
  try {
    const createUserSchema = z.object({
      username: z
        .string()
        .min(3, 'Username must be at least 3 characters')
        .max(50, 'Username must be at most 50 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric with underscores only'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
      isAdmin: z.boolean().optional().default(false),
    });

    const validated = createUserSchema.parse(req.body);

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username: validated.username },
    });

    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const passwordHash = await hashPassword(validated.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: validated.username,
        passwordHash,
        isAdmin: validated.isAdmin,
        mustResetPassword: true, // Force password change on first login
        totpEnabled: false, // Will be set up during onboarding
      },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        isActive: true,
        totpEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[users routes] Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PUT /api/users/:id
 * Update user details
 */
router.put('/:id', auditMiddleware('admin.user.update'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const session = req.session as any;

    const updateUserSchema = z.object({
      username: z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/)
        .optional(),
      isAdmin: z.boolean().optional(),
      isActive: z.boolean().optional(),
    });

    const validated = updateUserSchema.parse(req.body);

    // Prevent self-demotion from admin
    if (id === session.userId && validated.isAdmin === false) {
      return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
    }

    // Check if username is being changed and already exists
    if (validated.username) {
      const existing = await prisma.user.findFirst({
        where: {
          username: validated.username,
          NOT: { id },
        },
      });

      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: validated,
      select: {
        id: true,
        username: true,
        isAdmin: true,
        isActive: true,
        totpEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[users routes] Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Reset user password (admin action)
 */
router.post('/:id/reset-password', auditMiddleware('admin.user.password-reset'), async (req, res) => {
  try {
    const id = req.params.id as string;

    const resetPasswordSchema = z.object({
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const validated = resetPasswordSchema.parse(req.body);

    // Hash new password
    const passwordHash = await hashPassword(validated.password);

    // Update password and set must reset flag
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustResetPassword: true,
      },
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[users routes] Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * POST /api/users/:id/reset-totp
 * Reset user TOTP (forces re-enrollment)
 */
router.post('/:id/reset-totp', auditMiddleware('admin.user.totp-reset'), async (req, res) => {
  try {
    const id = req.params.id as string;

    // Reset TOTP and delete trusted devices
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          totpSecret: null,
          totpEnabled: false,
        },
      }),
      prisma.trustedDevice.deleteMany({
        where: { userId: id },
      }),
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('[users routes] Error resetting TOTP:', error);
    res.status(500).json({ error: 'Failed to reset TOTP' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete user (hard delete with cascading)
 */
router.delete('/:id', auditMiddleware('admin.user.delete'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const session = req.session as any;

    // Prevent self-deletion
    if (id === session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user (cascades to trusted devices, audit logs set userId to null)
    await prisma.user.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[users routes] Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
