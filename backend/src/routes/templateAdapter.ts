/**
 * Template Adapter routes -- wizard pipeline endpoints.
 *
 * POST /api/adapter/upload    -- Upload DOCX + create wizard session
 * POST /api/adapter/analyze   -- LLM Pass 1 analysis
 * POST /api/adapter/apply     -- LLM Pass 2 + instruction application
 * POST /api/adapter/preview   -- Render adapted template + queue PDF
 * GET  /api/adapter/preview/:sessionId -- Poll preview status
 * GET  /api/adapter/download/:sessionId -- Download adapted DOCX
 * POST /api/adapter/chat      -- Iterative feedback via SSE streaming
 * GET  /api/adapter/session/:sessionId -- Get full wizard state
 * GET  /api/adapter/session    -- Get user's active session
 *
 * All endpoints require authentication and validate session ownership.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/middleware/auth.js';
import {
  analyzeTemplate,
  uploadTemplate,
  applyInstructions,
  generatePreview,
  getDownloadPath,
  processChatFeedback,
} from '@/services/templateAdapter.js';
import {
  getWizardSession,
  getActiveWizardSession,
} from '@/services/wizardState.js';
import { getPdfJobStatus } from '@/services/pdfQueue.js';
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

const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const chatBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  message: z.string().min(1, 'message is required').max(10000),
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
// POST /api/adapter/analyze
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

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    if (state.currentStep !== 'analysis') {
      return res.status(400).json({
        error: `Cannot apply from step "${state.currentStep}". Must be in "analysis" step.`,
      });
    }

    const updated = await applyInstructions(state);

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

// ---------------------------------------------------------------------------
// POST /api/adapter/preview
// ---------------------------------------------------------------------------

/**
 * Generate a preview of the adapted template rendered with GW dummy data.
 * Body: { sessionId }
 * Requires currentStep to be "adaptation".
 * Returns 202 with { pdfJobId, docxUrl }
 */
router.post('/preview', requireAuth, async (req: Request, res: Response) => {
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

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    if (state.currentStep !== 'adaptation') {
      return res.status(400).json({
        error: `Cannot preview from step "${state.currentStep}". Must be in "adaptation" step.`,
      });
    }

    const updated = await generatePreview(state);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.preview',
      details: {
        sessionId,
        pdfJobId: updated.preview.pdfJobId,
        referenceTemplateHash: updated.analysis.referenceTemplateHash,
      },
      ipAddress,
    });

    res.status(202).json({
      pdfJobId: updated.preview.pdfJobId,
      docxUrl: updated.preview.docxUrl,
    });
  } catch (error) {
    handleAdapterError(res, error, 'Preview generation');
  }
});

// ---------------------------------------------------------------------------
// GET /api/adapter/preview/:sessionId
// ---------------------------------------------------------------------------

/**
 * Poll preview status (PDF conversion progress).
 * Returns current status with pdfUrl when completed.
 */
router.get('/preview/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    if (!state.preview.pdfJobId) {
      return res.status(400).json({ error: 'No preview job found. Run preview first.' });
    }

    const jobStatus = await getPdfJobStatus(state.preview.pdfJobId);

    const response: Record<string, unknown> = {
      status: jobStatus.status,
      progress: jobStatus.progress ?? 0,
      docxUrl: state.preview.docxUrl,
    };

    if (jobStatus.status === 'completed' && jobStatus.pdfPath) {
      response.pdfUrl = `/uploads/documents/${jobStatus.pdfPath}`;
    }

    if (jobStatus.status === 'failed') {
      response.error = jobStatus.error;
    }

    res.json(response);
  } catch (error) {
    handleAdapterError(res, error, 'Preview status');
  }
});

// ---------------------------------------------------------------------------
// GET /api/adapter/download/:sessionId
// ---------------------------------------------------------------------------

/**
 * Download the adapted DOCX file (with Jinja2 placeholders, NOT the rendered preview).
 * This is what the user uploads to Ghostwriter.
 */
router.get('/download/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    const filePath = getDownloadPath(state);
    const filename = state.templateFile.originalName
      ? `adapted_${state.templateFile.originalName}`
      : `adapted_template_${sessionId}.docx`;

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.download',
      details: {
        sessionId,
        filename,
        referenceTemplateHash: state.analysis.referenceTemplateHash,
      },
      ipAddress,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    handleAdapterError(res, error, 'Download');
  }
});

// ---------------------------------------------------------------------------
// POST /api/adapter/chat
// ---------------------------------------------------------------------------

/**
 * Iterative chat feedback for mapping plan refinement.
 * Body: { sessionId, message }
 * Streams response via SSE (same pattern as /api/llm/generate).
 * Events: delta (text chunk), mapping_update (modified plan), done (usage), error
 */
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  const body = chatBodySchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({
      error: 'Invalid request',
      details: body.error.issues,
    });
  }

  const userId = req.session.userId!;
  const { sessionId, message } = body.data;

  const state = await getWizardSession(userId, sessionId);
  if (!state) {
    return res.status(404).json({ error: 'Wizard session not found' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
  });

  try {
    const stream = processChatFeedback(state, message, abortController.signal);

    for await (const chunk of stream) {
      if (clientDisconnected) break;

      if (chunk.text && !chunk.done) {
        res.write(`event: delta\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }

      // Check for mapping update
      if ('mappingUpdate' in chunk && chunk.mappingUpdate) {
        res.write(
          `event: mapping_update\ndata: ${JSON.stringify({ mappingPlan: chunk.mappingUpdate })}\n\n`,
        );
      }

      if (chunk.done) {
        res.write(`event: done\ndata: ${JSON.stringify({ usage: chunk.usage })}\n\n`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Chat feedback failed';

    if (!clientDisconnected) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage, retryable: true })}\n\n`);
    }
  } finally {
    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      await logAuditEvent({
        userId,
        action: 'adapter.chat',
        details: {
          sessionId,
          messageLength: message.length,
          iterationCount: state.chat.iterationCount + 1,
          referenceTemplateHash: state.analysis.referenceTemplateHash,
        },
        ipAddress,
      });
    } catch (auditErr) {
      console.error('[templateAdapter route] Failed to log chat audit:', auditErr);
    }

    if (!clientDisconnected) {
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/adapter/session/:sessionId
// ---------------------------------------------------------------------------

/**
 * Get full wizard state for page reload / navigation restoration.
 * Returns the complete WizardState (excluding base64 template for payload size).
 */
router.get('/session/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    // Exclude large fields from the response to keep payload manageable
    const safeState = {
      ...state,
      templateFile: {
        ...state.templateFile,
        base64: state.templateFile.base64 ? '[present]' : '',
      },
    };

    res.json(safeState);
  } catch (error) {
    handleAdapterError(res, error, 'Session retrieval');
  }
});

// ---------------------------------------------------------------------------
// GET /api/adapter/session
// ---------------------------------------------------------------------------

/**
 * Get the user's active wizard session (most recent).
 * Used for sidebar badge or auto-resume on page load.
 * Returns { session } or { session: null } if no active session.
 */
router.get('/session', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const state = await getActiveWizardSession(userId);

    if (!state) {
      return res.json({ session: null });
    }

    // Return summary without large fields
    res.json({
      session: {
        sessionId: state.sessionId,
        currentStep: state.currentStep,
        templateFile: {
          originalName: state.templateFile.originalName,
          uploadedAt: state.templateFile.uploadedAt,
        },
        config: state.config,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
    });
  } catch (error) {
    handleAdapterError(res, error, 'Active session lookup');
  }
});

export default router;
