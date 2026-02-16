/**
 * Executive Report routes -- report wizard pipeline endpoints.
 *
 * POST /api/report/upload                  -- Upload DOCX, auto-sanitize HTML, return entity mappings
 * POST /api/report/update-entity-mappings  -- Update entity mappings, re-sanitize HTML
 * POST /api/report/approve-sanitization    -- Lock sanitization, trigger Pass 1 extraction
 * POST /api/report/update-metadata         -- Edit metadata fields before generation
 * POST /api/report/generate                -- Full generation pipeline (SSE streaming)
 * POST /api/report/chat                    -- Chat corrections (SSE streaming)
 * GET  /api/report/session/:sessionId      -- Get full report wizard state (HTML fields)
 * GET  /api/report/session                 -- Get user's active report session
 * DELETE /api/report/session/:sessionId    -- Delete report session
 * GET  /api/report/preview/:sessionId      -- Get PDF status/URL
 * POST /api/report/download-pdf            -- Download de-sanitized PDF via Gotenberg
 * GET  /api/report/download/:sessionId     -- Download PDF file (legacy)
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
  type EntityMapping,
} from '@/services/reportWizardState.js';
import {
  uploadReport,
  sanitizeReport,
  extractFindings,
  generateReport,
  processReportChat,
  getReportDownloadPath,
} from '@/services/reportService.js';
import { getPdfJobStatus, convertHtmlToPdf } from '@/services/pdfQueue.js';
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

const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const approveSanitizationBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
});

const entityMappingSchema = z.object({
  originalValue: z.string().min(1).max(500),
  placeholder: z.string().min(1).max(200),
  entityType: z.string().min(1).max(100),
  isManual: z.boolean(),
});

const updateEntityMappingsBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  mappings: z.array(entityMappingSchema).max(1000),
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

const downloadPdfBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
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
 * Upload a DOCX technical report, auto-sanitize to HTML, and create a report session.
 * Multipart form: file (DOCX)
 * Returns { sessionId, detectedLanguage, sanitizedHtml, entityMappings, currentStep }
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
        sanitizedHtml: result.sanitizedHtml,
        entityMappings: result.entityMappings,
        currentStep: 'sanitize-review',
      });
    } catch (error) {
      handleReportError(res, error, 'Report upload');
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/report/update-entity-mappings
// ---------------------------------------------------------------------------

/**
 * Update entity mappings and re-sanitize HTML with the updated mappings.
 * Body: { sessionId, mappings: EntityMapping[] }
 * Returns { sanitizedHtml, entityMappings }
 */
router.post('/update-entity-mappings', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = updateEntityMappingsBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId, mappings } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    // Store the updated mappings in the session
    await updateReportSession(userId, sessionId, {
      entityMappings: mappings as EntityMapping[],
    });

    // Re-sanitize HTML with the current counter map
    const result = await sanitizeReport(userId, sessionId);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'report.update_entity_mappings',
      details: {
        sessionId,
        mappingCount: mappings.length,
      },
      ipAddress,
    });

    res.json({
      sanitizedHtml: result.sanitizedHtml,
      entityMappings: result.entityMappings,
    });
  } catch (error) {
    handleReportError(res, error, 'Entity mappings update');
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

/**
 * Trigger the full generation pipeline via SSE streaming.
 * Body: { sessionId }
 * Stages: computing -> generating_charts -> narrative -> building_report -> converting_pdf
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
  const sendStageEvent = (stage: string, progress?: number) => {
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
    // Delegate full pipeline to generateReport() -- it emits stage events
    // and LLM deltas via the SSE callbacks. Stages in order:
    // computing -> generating_charts -> narrative -> building_report -> converting_pdf
    const result = await generateReport(userId, sessionId, sendStageEvent, sendDelta);

    // Send completion event
    sendDone({
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
    // Call processReportChat with SSE emitters
    const result = await processReportChat(
      userId,
      sessionId,
      message,
      sendChatDelta,
      sendSectionUpdate,
    );

    // Send completion
    sendChatDone({
      iterationCount: state.chatIterationCount + 1,
      sectionKey: result.sectionKey,
      pdfJobId: result.pdfJobId,
    });

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      await logAuditEvent({
        userId,
        action: 'report.correct',
        details: {
          sessionId,
          messageLength: message.length,
          sectionKey: result.sectionKey,
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
 * Returns the complete ReportWizardState including HTML fields.
 * Excludes base64 file content to keep payload manageable.
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

    // Exclude base64 file content from response (large payload)
    const safeState = {
      ...state,
      uploadedFile: {
        ...state.uploadedFile,
        base64: state.uploadedFile.base64 ? '[present]' : '',
      },
      // HTML fields are included for frontend rendering:
      // uploadedHtml, sanitizedHtml, entityMappings, generatedHtml, chartConfigs
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

    // Clean up PDF file
    if (state?.reportPdfUrl) {
      try {
        const pdfFilePath = state.reportPdfUrl.startsWith('/')
          ? `${process.cwd()}${state.reportPdfUrl}`
          : state.reportPdfUrl;
        if (fs.existsSync(pdfFilePath)) {
          fs.unlinkSync(pdfFilePath);
        }
      } catch (cleanupErr) {
        console.warn('[executiveReport route] Failed to clean up PDF file:', cleanupErr);
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
        status: state.reportPdfUrl ? 'completed' : 'no_job',
        progress: state.reportPdfUrl ? 100 : 0,
        pdfUrl: state.reportPdfUrl,
      });
    }

    const jobStatus = await getPdfJobStatus(state.reportPdfJobId);

    const response: Record<string, unknown> = {
      status: jobStatus.status,
      progress: jobStatus.progress ?? 0,
    };

    if (jobStatus.status === 'completed' && jobStatus.pdfPath) {
      const pdfUrl = `/uploads/documents/${jobStatus.pdfPath}`;
      response.pdfUrl = pdfUrl;

      // Persist PDF URL in session so subsequent loads don't need to re-poll
      if (!state.reportPdfUrl) {
        updateReportSession(userId, sessionId, {
          reportPdfUrl: pdfUrl,
        }).catch((err) => {
          console.error('[executiveReport route] Failed to persist pdfUrl:', err);
        });
      }
    }

    if (jobStatus.status === 'failed') {
      response.error = jobStatus.error;
    }

    // If PDF URL was already stored, return it even without re-checking the job
    if (state.reportPdfUrl && !response.pdfUrl) {
      response.pdfUrl = state.reportPdfUrl;
      response.status = 'completed';
      response.progress = 100;
    }

    res.json(response);
  } catch (error) {
    handleReportError(res, error, 'Preview status');
  }
});

// ---------------------------------------------------------------------------
// POST /api/report/download-pdf
// ---------------------------------------------------------------------------

/**
 * Download the de-sanitized executive report as PDF.
 * Applies de-sanitization server-side using session entity mappings,
 * then converts HTML to PDF via Gotenberg Chromium endpoint.
 * Body: { sessionId }
 * Returns: PDF binary with Content-Type: application/pdf
 */
router.post('/download-pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = downloadPdfBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const { sessionId } = body.data;

    const state = await getReportSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Report session not found' });
    }

    if (!state.generatedHtml) {
      return res.status(400).json({ error: 'No generated HTML available. Run generation first.' });
    }

    // Apply de-sanitization: replace placeholders with original values
    let desanitizedHtml = state.generatedHtml;
    if (state.entityMappings && state.entityMappings.length > 0) {
      for (const mapping of state.entityMappings) {
        if (mapping.placeholder && mapping.originalValue) {
          desanitizedHtml = desanitizedHtml.split(mapping.placeholder).join(mapping.originalValue);
        }
      }
    }

    // Convert de-sanitized HTML to PDF via Gotenberg Chromium
    const pdfBuffer = await convertHtmlToPdf(desanitizedHtml, '3s');

    // Build filename
    const filename = state.metadata.clientName
      ? `executive_report_${state.metadata.clientName.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
      : `executive_report_${sessionId}.pdf`;

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      await logAuditEvent({
        userId,
        action: 'report.download_pdf',
        details: {
          sessionId,
          filename,
          pdfSize: pdfBuffer.length,
          detectedLanguage: state.detectedLanguage,
        },
        ipAddress,
      });
    } catch (auditErr) {
      console.error('[executiveReport route] Failed to log download-pdf audit:', auditErr);
    }

    // Update wizard state step to download
    updateReportSession(userId, sessionId, {
      currentStep: 'download',
    }).catch((err) => {
      console.error('[executiveReport route] Failed to update step to download:', err);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.send(pdfBuffer);
  } catch (error) {
    handleReportError(res, error, 'PDF download');
  }
});

// ---------------------------------------------------------------------------
// GET /api/report/download/:sessionId
// ---------------------------------------------------------------------------

/**
 * Download the generated executive report as PDF (legacy).
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
      ? `executive_report_${state.metadata.clientName.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
      : `executive_report_${sessionId}.pdf`;

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

    res.setHeader('Content-Type', 'application/pdf');
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
