import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '@/db/prisma.js';
import { requireAuth } from '@/middleware/auth.js';
import { auditMiddleware } from '@/middleware/audit.js';

const router = Router();

// Multer configuration for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const userId = req.session.userId;
    cb(null, `${userId}${ext}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

// Validation schemas
const updateProfileSchema = z.object({
  displayName: z.string().max(50).trim().optional(),
});

/**
 * PUT /api/profile
 * Update user profile (currently only displayName)
 */
router.put('/', requireAuth, auditMiddleware('profile.update'), async (req: Request, res: Response) => {
  try {
    const { displayName } = updateProfileSchema.parse(req.body);

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: req.session.userId },
      data: { displayName: displayName || null },
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

    return res.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues });
    }
    console.error('Profile update error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/avatar
 * Upload user avatar
 */
router.post(
  '/avatar',
  requireAuth,
  (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 2MB.' });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  auditMiddleware('profile.avatar.upload'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const userId = req.session.userId!;
      const newExt = path.extname(req.file.filename);

      // Delete old avatar if extension changed
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      });

      if (user?.avatarUrl) {
        const oldFilename = path.basename(user.avatarUrl.split('?')[0]);
        const oldExt = path.extname(oldFilename);

        if (oldExt !== newExt) {
          const oldPath = path.join(process.cwd(), 'uploads', 'avatars', oldFilename);
          try {
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          } catch (error) {
            console.warn('Failed to delete old avatar:', error);
          }
        }
      }

      // Update avatarUrl with cache-busting timestamp
      const avatarUrl = `/uploads/avatars/${req.file.filename}?t=${Date.now()}`;
      await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
      });

      return res.json({ avatarUrl });
    } catch (error) {
      console.error('Avatar upload error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/profile/avatar
 * Delete user avatar
 */
router.delete('/avatar', requireAuth, auditMiddleware('profile.avatar.delete'), async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    // Get current avatar
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (user?.avatarUrl) {
      const filename = path.basename(user.avatarUrl.split('?')[0]);
      const filePath = path.join(process.cwd(), 'uploads', 'avatars', filename);

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn('Failed to delete avatar file:', error);
      }
    }

    // Update database
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Avatar delete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
