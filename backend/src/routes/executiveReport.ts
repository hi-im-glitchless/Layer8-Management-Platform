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
import fs from 'fs';
import { requireAuth } from '@/middleware/auth.js';
import {
  getReportSession,
  getActiveReportSession,
  updateReportSession,
  deleteReportSession,
} from '@/services/reportWizardState.js';
import {
  uploadReport,
  sanitizeReport,
  updateDenyList,
  extractFindings,
  generateReport,
  processReportChat,
  getReportDownloadPath,
} from '@/services/reportService.js';
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

      const result = await uploadReport(req.file.buffer, req.file.originalname, userId);

      // Audit log
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      await logAuditEvent({
        userId,
        action: 'report.upload',
        details: {
          sessionId: result.sessionId,
          detectedLanguage: result.detectedLanguage,
          originalName: req.file.originalname,
          fileSize: req.file.size,
        },
        ipAddress,
      });

      res.json({
        sessionId: result.sessionId,
        detectedLanguage: result.detectedLanguage,
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

    const result = await sanitizeReport(userId, sessionId);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'report.sanitize',
      details: {
        sessionId,
        paragraphCount: result.sanitizedParagraphs.length,
        mappingCount: Object.keys(result.sanitizationMappings.forward).length,
      },
      ipAddress,
    });

    res.json(result);
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

    const result = await updateDenyList(userId, sessionId, terms, action);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'report.update_deny_list',
      details: { sessionId, terms, denyListAction: action },
      ipAddress,
    });

    res.json(result);
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

    const result = await extractFindings(userId, sessionId);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'report.approve_sanitization',
      details: {
        sessionId,
        warningCount: result.warnings.length,
      },
      ipAddress,
    });

    res.json(result);
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

    const updated = await updateReportSession(userId, sessionId, {
      metadata: metadata as Partial<typeof state.metadata>,
    } as Partial<typeof state>);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'report.update_metadata',
      details: { sessionId, updatedFields: Object.keys(metadata) },
      ipAddress,
    });

    res.json({ metadata: updated.metadata });
  } catch (error) {
    handleReportError(res, error, 'Metadata update');
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/generate
// ---------------------------------------------------------------------------

/** Generation pipeline stage names. */
type GenerationStage =
  | 'extracting'
  | 'computing'
  | 'generating_charts'
  | 'narrative'
  | 'building_report'
  | 'converting_pdf';

/**
 * Trigger the full generation pipeline via SSE streaming.
 * Body: { sessionId }
 * Stages: extracting -> computing -> generating_charts -> narrative -> building_report -> converting_pdf
 * Events: stage (progress), delta (LLM text), done (usage), error
 */
router.post('/generate', requireAuth, async (req: Request, res: Response) => {
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

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let clientDisconnected = false;

  req.on('close', () => {
    clientDisconnected = true;
  });

  // SSE event emitters
  const sendStageEvent = (stage: GenerationStage, progress?: number) => {
    if (clientDisconnected) return;
    res.write(`event: stage\ndata: ${JSON.stringify({ stage, progress: progress ?? 0 })}\n\n`);
  };

  const sendDelta = (text: string) => {
    if (clientDisconnected) return;
    res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
  };

  const sendDone = (usage?: Record<string, unknown>) => {
    if (clientDisconnected) return;
    res.write(`event: done\ndata: ${JSON.stringify({ usage: usage ?? {} })}\n\n`);
  };

  const sendError = (message: string, retryable: boolean) => {
    if (clientDisconnected) return;
    res.write(`event: error\ndata: ${JSON.stringify({ message, retryable })}\n\n`);
  };

  try {
    // Stage 1: Extracting (Pass 1 -- LLM extraction)
    sendStageEvent('extracting', 0);

    // TODO: In 06-C, this will call extractFindings() with streaming
    // For now, send progress events to verify SSE infrastructure
    sendStageEvent('extracting', 50);
    sendStageEvent('extracting', 100);

    // Stage 2: Computing (metrics, risk score, compliance)
    sendStageEvent('computing', 0);
    sendStageEvent('computing', 100);

    // Stage 3: Generating charts (matplotlib -> PNG)
    sendStageEvent('generating_charts', 0);
    sendStageEvent('generating_charts', 100);

    // Stage 4: Narrative (Pass 2 -- LLM generation with streaming deltas)
    sendStageEvent('narrative', 0);

    // TODO: In 06-C, stream LLM tokens via sendDelta()
    sendDelta('[Narrative generation will stream tokens here in 06-C]');
    sendStageEvent('narrative', 100);

    // Stage 5: Building report (python-docx DOCX construction)
    sendStageEvent('building_report', 0);
    sendStageEvent('building_report', 100);

    // Stage 6: Converting to PDF (Gotenberg)
    sendStageEvent('converting_pdf', 0);

    // Call the service stub (will be real in 06-C)
    const result = await generateReport(userId, sessionId);

    sendStageEvent('converting_pdf', 100);

    // Send completion event
    sendDone({
      reportDocxPath: result.reportDocxPath,
      pdfJobId: result.pdfJobId,
    });

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      await logAuditEvent({
        userId,
        action: 'report.generate',
        details: {
          sessionId,
          detectedLanguage: state.detectedLanguage,
        },
        ipAddress,
      });
    } catch (auditErr) {
      console.error('[executiveReport route] Failed to log generate audit:', auditErr);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Report generation failed';

    if (!clientDisconnected) {
      sendError(errorMessage, true);
    }
  } finally {
    if (!clientDisconnected) {
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/chat
// ---------------------------------------------------------------------------

/**
 * Chat corrections for iterative report refinement via SSE streaming.
 * Body: { sessionId, message }
 * Events: delta (LLM text), section_update (JSON with updated section key + text),
 *         done (usage stats), error (message + retryable flag)
 */
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
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

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let clientDisconnected = false;

  req.on('close', () => {
    clientDisconnected = true;
  });

  // SSE event emitters for chat
  const sendChatDelta = (text: string) => {
    if (clientDisconnected) return;
    res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
  };

  const sendSectionUpdate = (sectionKey: string, text: string) => {
    if (clientDisconnected) return;
    res.write(`event: section_update\ndata: ${JSON.stringify({ sectionKey, text })}\n\n`);
  };

  const sendChatDone = (usage?: Record<string, unknown>) => {
    if (clientDisconnected) return;
    res.write(`event: done\ndata: ${JSON.stringify({ usage: usage ?? {} })}\n\n`);
  };

  const sendChatError = (errorMessage: string, retryable: boolean) => {
    if (clientDisconnected) return;
    res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage, retryable })}\n\n`);
  };

  try {
    // TODO: In 06-C, processReportChat will use these emitters to stream
    // LLM responses and section updates. For now, send placeholder events.
    sendChatDelta('[Chat response will stream tokens here in 06-C]');

    // Call the service stub
    await processReportChat(userId, sessionId, message, res);

    // Send completion
    sendChatDone({
      iterationCount: state.chatIterationCount + 1,
    });

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      await logAuditEvent({
        userId,
        action: 'report.chat',
        details: {
          sessionId,
          messageLength: message.length,
          iterationCount: state.chatIterationCount + 1,
        },
        ipAddress,
      });
    } catch (auditErr) {
      console.error('[executiveReport route] Failed to log chat audit:', auditErr);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Report chat failed';

    if (!clientDisconnected) {
      sendChatError(errorMessage, true);
    }
  } finally {
    if (!clientDisconnected) {
      res.end();
    }
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
 * Also cleans up uploaded files from disk.
 */
router.delete('/session/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    // Clean up uploaded file before deleting session
    const state = await getReportSession(userId, sessionId);
    if (state?.uploadedFile.storagePath) {
      try {
        if (fs.existsSync(state.uploadedFile.storagePath)) {
          fs.unlinkSync(state.uploadedFile.storagePath);
        }
      } catch (cleanupErr) {
        console.warn('[executiveReport route] Failed to clean up uploaded file:', cleanupErr);
      }
    }

    // Clean up generated report DOCX
    if (state?.reportDocxPath) {
      try {
        if (fs.existsSync(state.reportDocxPath)) {
          fs.unlinkSync(state.reportDocxPath);
        }
      } catch (cleanupErr) {
        console.warn('[executiveReport route] Failed to clean up report DOCX:', cleanupErr);
      }
    }

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

    const jobStatus = await getPdfJobStatus(state.reportPdfJobId);

    const response: Record<string, unknown> = {
      status: jobStatus.status,
      progress: jobStatus.progress ?? 0,
    };

    if (jobStatus.status === 'completed' && jobStatus.pdfPath) {
      response.pdfUrl = `/uploads/documents/${jobStatus.pdfPath}`;
    }

    if (jobStatus.status === 'failed') {
      response.error = jobStatus.error;
    }

    res.json(response);
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

    const filePath = await getReportDownloadPath(userId, sessionId);
    const filename = state.metadata.clientName
      ? `executive_report_${state.metadata.clientName.replace(/[^a-zA-Z0-9-_]/g, '_')}.docx`
      : `executive_report_${sessionId}.docx`;

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'report.download',
      details: {
        sessionId,
        filename,
        detectedLanguage: state.detectedLanguage,
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

    // Update wizard state step to download
    updateReportSession(userId, sessionId, {
      currentStep: 'download',
    }).catch((err) => {
      console.error('[executiveReport route] Failed to update step to download:', err);
    });
  } catch (error) {
    handleReportError(res, error, 'Report download');
  }
});

export default router;
