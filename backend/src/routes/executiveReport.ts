/**
 * Executive Report routes -- report wizard pipeline endpoints.
 *
 * POST /api/report/upload               -- Upload DOCX + create report session
 * POST /api/report/sanitize             -- Trigger paragraph-by-paragraph sanitization
 * POST /api/report/update-deny-list     -- Add/remove deny list terms, re-sanitize
 * POST /api/report/approve-sanitization -- Lock sanitization, trigger Pass 1 extraction
 * POST /api/report/update-metadata      -- Edit metadata fields before generation
 * POST /api/report/generate             -- Full generation pipeline (SSE streaming)
 * POST /api/report/chat                 -- Chat corrections (SSE streaming)
 * GET  /api/report/session/:sessionId   -- Get full report wizard state
 * GET  /api/report/session              -- Get user's active report session
 * DELETE /api/report/session/:sessionId -- Delete report session
 * GET  /api/report/preview/:sessionId   -- Get PDF status/URL
 * GET  /api/report/download/:sessionId  -- Download DOCX file
 *
 * All endpoints require authentication and validate session ownership.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth } from '@/middleware/auth.js';
import {
  getReportSession,
  getActiveReportSession,
  deleteReportSession,
} from '@/services/reportWizardState.js';
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

const sessionIdSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const sanitizeBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const denyListBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  terms: z.array(z.string().min(1).max(200)).min(1).max(100),
  action: z.enum(['add', 'remove']),
});

const approveSanitizationBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const updateMetadataBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  metadata: z.object({
    clientName: z.string().max(500).optional(),
    projectCode: z.string().max(200).optional(),
    startDate: z.string().max(50).optional(),
    endDate: z.string().max(50).optional(),
    scopeSummary: z.string().max(5000).optional(),
  }),
});

const generateBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const chatBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  message: z.string().min(1, 'message is required').max(10000),
});

// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------

function handleReportError(res: Response, error: unknown, context: string): void {
  console.error(`[executiveReport route] ${context} error:`, error);
  const message = error instanceof Error ? error.message : `${context} failed`;

  if (message.includes('Sanitizer') && message.includes('failed')) {
    res.status(502).json({ error: 'Sanitization service error', details: message });
    return;
  }
  if (message.includes('LLM')) {
    res.status(502).json({ error: 'LLM service error', details: message });
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
// POST /api/report/upload
// ---------------------------------------------------------------------------

/**
 * Upload a DOCX technical report and create a new report wizard session.
 * Multipart form: file (DOCX)
 * Returns { sessionId, detectedLanguage, currentStep: "upload" }
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

      const userId = req.session.userId!;

      // TODO: Wire to reportService.uploadReport() in Task 4
      res.json({
        sessionId: 'stub-session-id',
        detectedLanguage: 'en',
        currentStep: 'upload',
      });
    } catch (error) {
      handleReportError(res, error, 'Report upload');
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/report/sanitize
// ---------------------------------------------------------------------------

/**
 * Trigger paragraph-by-paragraph sanitization for the uploaded report.
 * Body: { sessionId }
 * Returns { sanitizedParagraphs, sanitizationMappings }
 */
router.post('/sanitize', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = sanitizeBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // TODO: Wire to reportService.sanitizeReport() in Task 4
    res.json({
      sanitizedParagraphs: [],
      sanitizationMappings: { forward: {}, reverse: {} },
    });
  } catch (error) {
    handleReportError(res, error, 'Report sanitization');
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/update-deny-list
// ---------------------------------------------------------------------------

/**
 * Add or remove deny list terms and re-sanitize affected paragraphs.
 * Body: { sessionId, terms: string[], action: 'add' | 'remove' }
 * Returns { updatedParagraphs }
 */
router.post('/update-deny-list', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = denyListBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId, terms, action } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // TODO: Wire to reportService.updateDenyList() in Task 4
    res.json({
      updatedParagraphs: [],
    });
  } catch (error) {
    handleReportError(res, error, 'Deny list update');
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/approve-sanitization
// ---------------------------------------------------------------------------

/**
 * Lock sanitization and trigger Pass 1 (LLM extraction).
 * Body: { sessionId }
 * Returns { findings, metadata, warnings }
 */
router.post('/approve-sanitization', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = approveSanitizationBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // TODO: Wire to reportService.extractFindings() in Task 4
    res.json({
      findings: null,
      metadata: state.metadata,
      warnings: [],
    });
  } catch (error) {
    handleReportError(res, error, 'Sanitization approval');
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/update-metadata
// ---------------------------------------------------------------------------

/**
 * Update metadata fields before generation.
 * Body: { sessionId, metadata: { clientName?, projectCode?, startDate?, endDate?, scopeSummary? } }
 * Returns updated metadata.
 */
router.post('/update-metadata', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = updateMetadataBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId, metadata } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // TODO: Wire to reportWizardState.updateReportSession() in Task 4
    res.json({
      metadata: { ...state.metadata, ...metadata },
    });
  } catch (error) {
    handleReportError(res, error, 'Metadata update');
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/generate
// ---------------------------------------------------------------------------

/**
 * Trigger the full generation pipeline via SSE streaming.
 * Body: { sessionId }
 * Stages: extracting -> computing -> generating_charts -> narrative -> building_report -> converting_pdf
 * Events: stage (progress), delta (LLM text), done (usage), error
 */
router.post('/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = generateBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // TODO: Implement SSE streaming in Task 5
    res.json({ status: 'stub', message: 'Generation not yet implemented' });
  } catch (error) {
    handleReportError(res, error, 'Report generation');
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/chat
// ---------------------------------------------------------------------------

/**
 * Chat corrections for iterative report refinement via SSE streaming.
 * Body: { sessionId, message }
 * Events: delta (LLM text), section_update (JSON), done, error
 */
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = chatBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId, message } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // TODO: Implement SSE streaming in Task 5
    res.json({ status: 'stub', message: 'Chat not yet implemented' });
  } catch (error) {
    handleReportError(res, error, 'Report chat');
  }
});

// ---------------------------------------------------------------------------
// GET /api/report/session/:sessionId
// ---------------------------------------------------------------------------

/**
 * Get full report wizard state for page reload / navigation restoration.
 * Returns the complete ReportWizardState (excluding base64 for payload size).
 */
router.get('/session/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // Exclude large fields from the response to keep payload manageable
    const safeState = {
      ...state,
      uploadedFile: {
        ...state.uploadedFile,
        base64: state.uploadedFile.base64 ? '[present]' : '',
      },
    };

    res.json(safeState);
  } catch (error) {
    handleReportError(res, error, 'Session retrieval');
  }
});

// ---------------------------------------------------------------------------
// GET /api/report/session
// ---------------------------------------------------------------------------

/**
 * Get the user's active report session (most recent).
 * Used for sidebar badge or auto-resume on page load.
 * Returns { session } or { session: null } if no active session.
 */
router.get('/session', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const state = await getActiveReportSession(userId);

    if (!state) {
      return res.json({ session: null });
    }

    // Return summary without large fields
    res.json({
      session: {
        sessionId: state.sessionId,
        currentStep: state.currentStep,
        uploadedFile: {
          originalName: state.uploadedFile.originalName,
          uploadedAt: state.uploadedFile.uploadedAt,
        },
        detectedLanguage: state.detectedLanguage,
        metadata: state.metadata,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
    });
  } catch (error) {
    handleReportError(res, error, 'Active session lookup');
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/report/session/:sessionId
// ---------------------------------------------------------------------------

/**
 * Delete a report session. Allows the user to reset and start over.
 */
router.delete('/session/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    // TODO: Also clean up uploaded files in Task 4
    await deleteReportSession(userId, sessionId);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'report.session_reset',
      details: { sessionId },
      ipAddress,
    });

    res.json({ success: true });
  } catch (error) {
    handleReportError(res, error, 'Session deletion');
  }
});

// ---------------------------------------------------------------------------
// GET /api/report/preview/:sessionId
// ---------------------------------------------------------------------------

/**
 * Poll PDF preview status for a report.
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

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    if (!state.reportPdfJobId) {
      return res.json({
        status: 'no_job',
        pdfUrl: state.reportPdfUrl,
      });
    }

    // TODO: Wire to pdfQueue.getPdfJobStatus() in Task 4
    res.json({
      status: 'stub',
      pdfUrl: state.reportPdfUrl,
    });
  } catch (error) {
    handleReportError(res, error, 'Preview status');
  }
});

// ---------------------------------------------------------------------------
// GET /api/report/download/:sessionId
// ---------------------------------------------------------------------------

/**
 * Download the generated executive report DOCX file.
 */
router.get('/download/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // TODO: Wire to reportService.getReportDownloadPath() in Task 4
    res.status(404).json({ error: 'No report DOCX available yet. Run generation first.' });
  } catch (error) {
    handleReportError(res, error, 'Report download');
  }
});

export default router;
