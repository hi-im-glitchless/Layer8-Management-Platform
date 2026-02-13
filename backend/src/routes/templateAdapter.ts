/**
 * Template Adapter routes -- POST /api/adapter/analyze
 *
 * Accepts a DOCX file upload with type + language, orchestrates LLM Pass 1
 * analysis, and returns a validated mapping plan.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'fs';
import { requireAuth } from '@/middleware/auth.js';
import { analyzeTemplate } from '@/services/templateAdapter.js';
import { logAuditEvent } from '@/services/audit.js';

const router = Router();

/** Max upload size: 50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Multer: store in memory for base64 conversion
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext === 'docx') {
      cb(null, true);
    } else {
      cb(new Error('Only .docx files are accepted.'));
    }
  },
});

// Zod schema for multipart form fields
const analyzeFieldsSchema = z.object({
  type: z.enum(['web', 'internal', 'mobile']),
  language: z.enum(['en', 'pt-pt']),
});

/**
 * POST /api/adapter/analyze
 *
 * Multipart form: file (DOCX) + type + language
 * Returns mapping plan JSON from LLM analysis.
 */
router.post(
  '/analyze',
  requireAuth,
  (req: Request, res: Response, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      // Validate file
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Send a .docx file as "file" field.' });
      }

      // Validate form fields
      const fields = analyzeFieldsSchema.safeParse(req.body);
      if (!fields.success) {
        return res.status(400).json({
          error: 'Invalid request fields',
          details: fields.error.issues,
        });
      }

      const { type: templateType, language } = fields.data;

      // Convert file buffer to base64
      const templateBase64 = req.file.buffer.toString('base64');

      // Orchestrate analysis
      const result = await analyzeTemplate(templateBase64, templateType, language);

      // Audit log
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      await logAuditEvent({
        userId: req.session.userId ?? null,
        action: 'adapter.analyze',
        details: {
          templateType,
          language,
          originalName: req.file.originalname,
          fileSize: req.file.size,
          referenceTemplateHash: result.referenceTemplateHash,
          mappingEntries: result.mappingPlan.entries.length,
          warnings: result.mappingPlan.warnings,
        },
        ipAddress,
      });

      res.json({
        mappingPlan: result.mappingPlan,
        referenceTemplateHash: result.referenceTemplateHash,
      });
    } catch (error) {
      console.error('[templateAdapter route] Analysis error:', error);
      const message = error instanceof Error ? error.message : 'Template analysis failed';

      if (message.includes('Sanitizer') && message.includes('failed')) {
        return res.status(502).json({ error: 'Sanitization service error', details: message });
      }
      if (message.includes('LLM')) {
        return res.status(502).json({ error: 'LLM service error', details: message });
      }
      if (message.includes('validation failed')) {
        return res.status(422).json({ error: 'Mapping validation failed', details: message });
      }

      res.status(500).json({
        error: 'Template analysis failed',
        details: message,
      });
    }
  },
);

export default router;
