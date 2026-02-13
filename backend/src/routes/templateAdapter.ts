/**
 * Template Adapter routes -- wizard pipeline endpoints.
 *
 * POST /api/adapter/upload   -- Upload DOCX + create wizard session
 * POST /api/adapter/analyze  -- LLM Pass 1 analysis (existing)
 * POST /api/adapter/apply    -- LLM Pass 2 + instruction application
 *
 * All endpoints require authentication and validate session ownership.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth } from '@/middleware/auth.js';
import {
  analyzeTemplate,
  uploadTemplate,
  applyInstructions,
} from '@/services/templateAdapter.js';
import { getWizardSession, updateWizardSession } from '@/services/wizardState.js';
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

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const analyzeFieldsSchema = z.object({
  type: z.enum(['web', 'internal', 'mobile']),
  language: z.enum(['en', 'pt-pt']),
});

const sessionIdSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------

function handleAdapterError(res: Response, error: unknown, context: string): void {
  console.error(`[templateAdapter route] ${context} error:`, error);
  const message = error instanceof Error ? error.message : `${context} failed`;

  if (message.includes('Sanitizer') && message.includes('failed')) {
    res.status(502).json({ error: 'Sanitization service error', details: message });
    return;
  }
  if (message.includes('LLM')) {
    res.status(502).json({ error: 'LLM service error', details: message });
    return;
  }
  if (message.includes('validation failed')) {
    res.status(422).json({ error: 'Validation failed', details: message });
    return;
  }
  if (message.includes('not found')) {
    res.status(404).json({ error: 'Not found', details: message });
    return;
  }

  res.status(500).json({
    error: `${context} failed`,
    details: message,
  });
}

// ---------------------------------------------------------------------------
// POST /api/adapter/upload
// ---------------------------------------------------------------------------

/**
 * Upload a DOCX file and create a new wizard session.
 * Multipart form: file (DOCX) + type + language
 * Returns { sessionId, currentStep: "upload" }
 */
router.post(
  '/upload',
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
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Send a .docx file as "file" field.' });
      }

      const fields = analyzeFieldsSchema.safeParse(req.body);
      if (!fields.success) {
        return res.status(400).json({
          error: 'Invalid request fields',
          details: fields.error.issues,
        });
      }

      const { type: templateType, language } = fields.data;
      const userId = req.session.userId!;

      const state = await uploadTemplate(req.file, templateType, language, userId);

      // Audit log
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      await logAuditEvent({
        userId,
        action: 'adapter.upload',
        details: {
          sessionId: state.sessionId,
          templateType,
          language,
          originalName: req.file.originalname,
          fileSize: req.file.size,
        },
        ipAddress,
      });

      res.json({
        sessionId: state.sessionId,
        currentStep: state.currentStep,
      });
    } catch (error) {
      handleAdapterError(res, error, 'Template upload');
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/adapter/analyze (existing, updated for wizard state)
// ---------------------------------------------------------------------------

/**
 * Analyze a template using LLM Pass 1.
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
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Send a .docx file as "file" field.' });
      }

      const fields = analyzeFieldsSchema.safeParse(req.body);
      if (!fields.success) {
        return res.status(400).json({
          error: 'Invalid request fields',
          details: fields.error.issues,
        });
      }

      const { type: templateType, language } = fields.data;
      const templateBase64 = req.file.buffer.toString('base64');

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
      handleAdapterError(res, error, 'Template analysis');
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/adapter/apply
// ---------------------------------------------------------------------------

/**
 * Apply instructions to the template (LLM Pass 2 + apply pipeline).
 * Body: { sessionId }
 * Requires currentStep to be "analysis".
 * Returns { currentStep, appliedCount, skippedCount, warnings }
 */
router.post('/apply', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = sessionIdSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: body.error.issues,
      });
    }

    const userId = req.session.userId!;
    const { sessionId } = body.data;

    // Load wizard state and validate ownership
    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    // Validate step
    if (state.currentStep !== 'analysis') {
      return res.status(400).json({
        error: `Cannot apply from step "${state.currentStep}". Must be in "analysis" step.`,
      });
    }

    // Apply instructions
    const updated = await applyInstructions(state);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.apply',
      details: {
        sessionId,
        appliedCount: updated.adaptation.appliedCount,
        skippedCount: updated.adaptation.skippedCount,
        referenceTemplateHash: updated.analysis.referenceTemplateHash,
      },
      ipAddress,
    });

    res.json({
      currentStep: updated.currentStep,
      appliedCount: updated.adaptation.appliedCount,
      skippedCount: updated.adaptation.skippedCount,
      warnings: (updated.adaptation.instructions as Record<string, unknown>)?.warnings ?? [],
    });
  } catch (error) {
    handleAdapterError(res, error, 'Instruction application');
  }
});

export default router;
