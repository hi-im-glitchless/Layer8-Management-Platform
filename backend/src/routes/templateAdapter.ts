/**
 * Template Adapter routes -- wizard pipeline endpoints.
 *
 * POST /api/adapter/upload    -- Upload DOCX + create wizard session
 * POST /api/adapter/analyze   -- LLM Pass 1 analysis
 * POST /api/adapter/auto-map  -- Combined Pass 1 + Pass 2 (auto-map on upload)
 * POST /api/adapter/preview   -- Render adapted template + queue PDF
 * GET  /api/adapter/preview/:sessionId -- Poll preview status
 * POST /api/adapter/annotated-preview -- Generate annotated preview with shading
 * GET  /api/adapter/annotated-preview/:sessionId -- Get cached annotation data
 * POST /api/adapter/reapply   -- Deterministic re-apply mapping plan (no LLM)
 * POST /api/adapter/placeholder-preview -- Generate placeholder-styled preview
 * GET  /api/adapter/document-structure/:sessionId -- Document paragraph list
 * POST /api/adapter/update-mapping -- Merge inline edits into mapping plan
 * GET  /api/adapter/download/:sessionId -- Download adapted DOCX
 * POST /api/adapter/correction-update -- Table-based KB corrections
 * GET  /api/adapter/kb-stats/:templateType -- KB statistics
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
import { config } from '@/config.js';
import { requireAuth } from '@/middleware/auth.js';
import {
  analyzeTemplate,
  uploadTemplate,
  autoMapTemplate,
  regenerateWithLLM,
  generatePreview,
  generateAnnotatedPreview,
  generatePlaceholderPreview,
  persistMappingsToKB,
  processCorrectionUpdate,
  getDownloadPath,
  processChatFeedback,
  type MappingEntry,
  type MappingPlan,
  type CorrectionEntry,
} from '@/services/templateAdapter.js';
import {
  getWizardSession,
  getActiveWizardSession,
  updateWizardSession,
  deleteWizardSession,
} from '@/services/wizardState.js';
import { getPdfJobStatus } from '@/services/pdfQueue.js';
import { logAuditEvent } from '@/services/audit.js';
import { getKBStats } from '@/services/templateMapping.js';

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

const annotatedPreviewSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  greenOnly: z.boolean().optional().default(false),
});

const templateTypeParamSchema = z.object({
  templateType: z.enum(['web', 'internal', 'mobile']),
});

const correctionUpdateSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  corrections: z.array(z.object({
    sectionIndex: z.number(),
    oldGwField: z.string(),
    newGwField: z.string(),
    newMarkerType: z.string(),
    sectionText: z.string(),
  })),
});

const mappingEntrySchema = z.object({
  sectionIndex: z.number().int().min(0),
  sectionText: z.string(),
  gwField: z.string(),
  placeholderTemplate: z.string(),
  confidence: z.number().min(0).max(1),
  markerType: z.string(),
  rationale: z.string(),
});

const updateMappingSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  updates: z.object({
    /** When present, replaces the entire mapping plan entries (skips diff logic) */
    fullPlan: z.array(mappingEntrySchema).optional(),
    editedEntries: z.array(z.object({
      sectionIndex: z.number().int().min(0),
      gwField: z.string().min(1),
      markerType: z.string().min(1),
    })).optional(),
    addedEntries: z.array(z.object({
      paragraphIndex: z.number().int().min(0),
      gwField: z.string().min(1),
      markerType: z.string().min(1),
      sectionText: z.string().optional(),
    })).optional(),
    deletedSectionIndices: z.array(z.number().int().min(0)).optional(),
  }),
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
// POST /api/adapter/analyze-session
// ---------------------------------------------------------------------------

/**
 * Analyze a template using LLM Pass 1 from an existing wizard session.
 * Used when the page is refreshed and the File object is lost — the template
 * base64 is read from the session stored in Redis.
 */
router.post('/analyze-session', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = sessionIdParamSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    }

    const userId = req.session.userId!;
    const state = await getWizardSession(userId, body.data.sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!state.templateFile.base64) {
      return res.status(400).json({ error: 'No template uploaded in this session' });
    }

    const result = await analyzeTemplate(
      state.templateFile.base64,
      state.config.templateType,
      state.config.language,
    );

    // Update session with analysis results
    await updateWizardSession(userId, body.data.sessionId, {
      currentStep: 'verify',
      analysis: {
        mappingPlan: result.mappingPlan as unknown as Record<string, unknown>,
        referenceTemplateHash: result.referenceTemplateHash,
        llmPrompt: null,
      },
    });

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.analyze',
      details: {
        templateType: state.config.templateType,
        language: state.config.language,
        originalName: state.templateFile.originalName,
        referenceTemplateHash: result.referenceTemplateHash,
        mappingEntries: result.mappingPlan.entries.length,
        warnings: result.mappingPlan.warnings,
        fromSession: true,
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
});

// ---------------------------------------------------------------------------
// POST /api/adapter/auto-map
// ---------------------------------------------------------------------------

/**
 * Auto-map a template by chaining LLM Pass 1 (analysis) + Pass 2 (insertion).
 * Body: { sessionId }
 * Requires a template to be uploaded in the session.
 * Returns { currentStep: 'verify', appliedCount, skippedCount, warnings, mappingPlan }
 *
 * This endpoint may take 60-180s (two LLM passes). The frontend uses
 * an existing polling fallback pattern from StepAnalysis.
 */
router.post('/auto-map', requireAuth, async (req: Request, res: Response) => {
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

    if (!state.templateFile.base64) {
      return res.status(400).json({
        error: 'No template uploaded in this session. Upload a DOCX first.',
      });
    }

    const updated = await autoMapTemplate(state);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.auto_map',
      details: {
        sessionId,
        appliedCount: updated.adaptation.appliedCount,
        skippedCount: updated.adaptation.skippedCount,
        referenceTemplateHash: updated.analysis.referenceTemplateHash,
      },
      ipAddress,
    });

    const mappingPlan = updated.analysis.mappingPlan as unknown as MappingPlan;

    res.json({
      currentStep: updated.currentStep,
      appliedCount: updated.adaptation.appliedCount,
      skippedCount: updated.adaptation.skippedCount,
      warnings: mappingPlan?.warnings ?? [],
      mappingPlan,
      kbLockedCount: updated.analysis.kbLockedCount ?? 0,
      llmAnalyzedCount: updated.analysis.llmAnalyzedCount ?? 0,
    });
  } catch (error) {
    handleAdapterError(res, error, 'Auto-map');
  }
});

// ---------------------------------------------------------------------------
// POST /api/adapter/preview
// ---------------------------------------------------------------------------

/**
 * Generate a preview of the adapted template rendered with GW dummy data.
 * Body: { sessionId }
 * Requires currentStep to be "verify".
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

    if (state.currentStep !== 'verify') {
      return res.status(400).json({
        error: `Cannot preview from step "${state.currentStep}". Must be in "verify" step.`,
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
// POST /api/adapter/annotated-preview
// ---------------------------------------------------------------------------

/**
 * Generate an annotated preview with paragraph shading for mapped/gap sections.
 * Body: { sessionId }
 * Requires session to have a mapping plan (analysis step).
 * Returns 202 with { pdfJobId, tooltipData, unmappedParagraphs, gapSummary }
 */
router.post('/annotated-preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = annotatedPreviewSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: body.error.issues,
      });
    }

    const userId = req.session.userId!;
    const { sessionId, greenOnly } = body.data;

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    if (state.currentStep !== 'verify') {
      return res.status(400).json({
        error: `Cannot generate annotated preview from step "${state.currentStep}". Must be in "verify" step.`,
      });
    }

    const updated = await generateAnnotatedPreview(state, { greenOnly });

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.annotated_preview',
      details: {
        sessionId,
        pdfJobId: updated.annotatedPreview.pdfJobId,
        tooltipCount: updated.annotatedPreview.tooltipData.length,
        unmappedCount: updated.annotatedPreview.unmappedParagraphs.length,
        gapSummary: updated.annotatedPreview.gapSummary,
      },
      ipAddress,
    });

    res.status(202).json({
      pdfJobId: updated.annotatedPreview.pdfJobId,
      tooltipData: updated.annotatedPreview.tooltipData,
      unmappedParagraphs: updated.annotatedPreview.unmappedParagraphs,
      gapSummary: updated.annotatedPreview.gapSummary,
    });
  } catch (error) {
    handleAdapterError(res, error, 'Annotated preview generation');
  }
});

// ---------------------------------------------------------------------------
// GET /api/adapter/annotated-preview/:sessionId
// ---------------------------------------------------------------------------

/**
 * Get cached annotated preview data from wizard state (for page reload).
 * Includes current PDF status if pdfJobId exists, plus tooltip and gap data.
 */
router.get('/annotated-preview/:sessionId', requireAuth, async (req: Request, res: Response) => {
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

    const { annotatedPreview } = state;

    const response: Record<string, unknown> = {
      pdfJobId: annotatedPreview.pdfJobId,
      placeholders: annotatedPreview.placeholders ?? [],
      placeholderCount: annotatedPreview.placeholderCount ?? 0,
      tooltipData: annotatedPreview.tooltipData,
      unmappedParagraphs: annotatedPreview.unmappedParagraphs,
      gapSummary: annotatedPreview.gapSummary,
    };

    // Include PDF status if a job exists
    if (annotatedPreview.pdfJobId) {
      const jobStatus = await getPdfJobStatus(annotatedPreview.pdfJobId);
      response.pdfStatus = jobStatus.status;
      response.pdfProgress = jobStatus.progress ?? 0;

      if (jobStatus.status === 'completed' && jobStatus.pdfPath) {
        response.pdfUrl = `/uploads/documents/${jobStatus.pdfPath}`;
      }

      if (jobStatus.status === 'failed') {
        response.pdfError = jobStatus.error;
      }
    }

    res.json(response);
  } catch (error) {
    handleAdapterError(res, error, 'Annotated preview status');
  }
});

// ---------------------------------------------------------------------------
// POST /api/adapter/reapply
// ---------------------------------------------------------------------------

/**
 * Regenerate placeholders using the LLM placement pipeline.
 * Sends DOCX + mapping plan through build-placement-prompt -> LLM -> validate -> apply.
 * Body: { sessionId }
 * Returns 200 with { appliedCount, skippedCount, placementWarnings }
 */
router.post('/reapply', requireAuth, async (req: Request, res: Response) => {
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

    if (!state.analysis.mappingPlan) {
      return res.status(400).json({
        error: 'No mapping plan in session. Run analysis first.',
      });
    }

    const updated = await regenerateWithLLM(state);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.reapply',
      details: {
        sessionId,
        appliedCount: updated.adaptation.appliedCount,
        skippedCount: updated.adaptation.skippedCount,
        placementWarningsCount: updated.adaptation.placementWarnings.length,
      },
      ipAddress,
    });

    res.json({
      appliedCount: updated.adaptation.appliedCount,
      skippedCount: updated.adaptation.skippedCount,
      placementWarnings: updated.adaptation.placementWarnings ?? [],
    });
  } catch (error) {
    handleAdapterError(res, error, 'LLM placement regeneration');
  }
});

// ---------------------------------------------------------------------------
// POST /api/adapter/placeholder-preview
// ---------------------------------------------------------------------------

/**
 * Generate a placeholder-styled preview of the adapted DOCX.
 * Body: { sessionId }
 * Requires session to have adaptation.appliedDocxPath (auto-map completed).
 * Returns 202 with { pdfJobId, placeholders, placeholderCount }
 */
router.post('/placeholder-preview', requireAuth, async (req: Request, res: Response) => {
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

    if (!state.adaptation.appliedDocxPath) {
      return res.status(400).json({
        error: 'No adapted DOCX in session. Run auto-map first.',
      });
    }

    const result = await generatePlaceholderPreview(state);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.placeholder_preview',
      details: {
        sessionId,
        pdfJobId: result.pdfJobId,
        placeholderCount: result.placeholderCount,
      },
      ipAddress,
    });

    res.status(202).json({
      pdfJobId: result.pdfJobId,
      placeholders: result.placeholders,
      placeholderCount: result.placeholderCount,
    });
  } catch (error) {
    handleAdapterError(res, error, 'Placeholder preview generation');
  }
});

// ---------------------------------------------------------------------------
// GET /api/adapter/document-structure/:sessionId
// ---------------------------------------------------------------------------

/**
 * Return the full paragraph list for the session's DOCX template.
 * Proxies to Python POST /adapter/document-structure, caching the result
 * in wizard state so subsequent requests skip the re-parse.
 */
router.get('/document-structure/:sessionId', requireAuth, async (req: Request, res: Response) => {
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

    if (!state.templateFile.base64) {
      return res.status(400).json({ error: 'No template uploaded in this session' });
    }

    // Return cached result if available
    const stateAny = state as unknown as Record<string, unknown>;
    if (stateAny.documentStructure) {
      res.json(stateAny.documentStructure);
      return;
    }

    // Proxy to Python service
    const sanitizerUrl = config.SANITIZER_URL;
    const pythonRes = await fetch(`${sanitizerUrl}/adapter/document-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_base64: state.templateFile.base64 }),
    });

    if (!pythonRes.ok) {
      const detail = await pythonRes.text();
      throw new Error(`Sanitizer document-structure failed (${pythonRes.status}): ${detail}`);
    }

    const data = await pythonRes.json();

    // Validate response shape
    const documentStructureSchema = z.object({
      paragraphs: z.array(z.object({
        paragraph_index: z.number(),
        text: z.string(),
        heading_level: z.number().nullable(),
        is_empty: z.boolean(),
        style_name: z.string().nullable(),
      })),
      header_footer_paragraphs: z.array(z.object({
        text: z.string(),
        location: z.string(),
        section_index: z.number(),
        paragraph_index: z.number(),
        style_name: z.string().nullable(),
      })).optional().default([]),
      total_count: z.number(),
      empty_count: z.number(),
    });

    const validated = documentStructureSchema.parse(data);

    // Transform snake_case to camelCase for frontend
    const camelCased = {
      paragraphs: validated.paragraphs.map((p) => ({
        paragraphIndex: p.paragraph_index,
        text: p.text,
        headingLevel: p.heading_level,
        isEmpty: p.is_empty,
        styleName: p.style_name,
      })),
      headerFooterParagraphs: validated.header_footer_paragraphs.map((p) => ({
        text: p.text,
        location: p.location,
        sectionIndex: p.section_index,
        paragraphIndex: p.paragraph_index,
        styleName: p.style_name,
      })),
      totalCount: validated.total_count,
      emptyCount: validated.empty_count,
    };

    // Cache in wizard state to avoid re-parsing
    await updateWizardSession(userId, sessionId, {
      documentStructure: camelCased,
    } as Partial<typeof state>);

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.document_structure',
      details: {
        sessionId,
        totalCount: camelCased.totalCount,
        emptyCount: camelCased.emptyCount,
      },
      ipAddress,
    });

    res.json(camelCased);
  } catch (error) {
    handleAdapterError(res, error, 'Document structure');
  }
});

// ---------------------------------------------------------------------------
// POST /api/adapter/update-mapping
// ---------------------------------------------------------------------------

/**
 * Merge inline edits and added sections into the wizard state mapping plan.
 * Body: { sessionId, updates: { editedEntries?, addedEntries? } }
 * Returns the updated mapping plan.
 */
router.post('/update-mapping', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = updateMappingSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: body.error.issues,
      });
    }

    const userId = req.session.userId!;
    const { sessionId, updates } = body.data;

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    const mappingPlan = state.analysis.mappingPlan as unknown as MappingPlan;
    if (!mappingPlan || !mappingPlan.entries) {
      return res.status(400).json({
        error: 'No mapping plan in session. Run analysis first.',
      });
    }

    // Full plan replacement mode -- skip all diff logic
    if (updates.fullPlan) {
      const prevCount = mappingPlan.entries.length;
      mappingPlan.entries = updates.fullPlan as MappingEntry[];
      // Full plan import — clear rejected entries since user is starting fresh
      state.analysis.rejectedSectionTexts = {} as unknown as Record<string, unknown>;
      console.log(
        `[update-mapping] Full plan replacement: ${prevCount} → ${mappingPlan.entries.length} entries`,
      );
    } else {
    // Apply deletions -- remove entries by sectionIndex
    if (updates.deletedSectionIndices && updates.deletedSectionIndices.length > 0) {
      const deleteSet = new Set(updates.deletedSectionIndices);
      // Track deleted entries as rejected (user explicitly said "don't map this")
      const rawTexts = state.analysis.rawSectionTexts as Record<number, string> | undefined ?? {};
      const existingRejected = state.analysis.rejectedSectionTexts as Record<number, string> | undefined ?? {};
      const newRejected = { ...existingRejected };
      for (const entry of mappingPlan.entries) {
        if (deleteSet.has(entry.sectionIndex)) {
          // Use raw document text if available, fall back to mapping entry text
          newRejected[entry.sectionIndex] = rawTexts[entry.sectionIndex] ?? entry.sectionText;
        }
      }
      mappingPlan.entries = mappingPlan.entries.filter(
        (e) => !deleteSet.has(e.sectionIndex),
      );
      // Store rejected texts in wizard state (will be persisted as __skip__ on download)
      state.analysis.rejectedSectionTexts = newRejected as unknown as Record<string, unknown>;
      console.log(
        `[update-mapping] Deleted ${updates.deletedSectionIndices.length} entries: ${[...deleteSet].join(', ')}`,
      );
    }

    // Apply edited entries -- find by sectionIndex and update gwField + markerType
    if (updates.editedEntries) {
      for (const edit of updates.editedEntries) {
        const entry = mappingPlan.entries.find((e) => e.sectionIndex === edit.sectionIndex);
        if (entry) {
          entry.gwField = edit.gwField;
          entry.markerType = edit.markerType;
          entry.confidence = 1.0; // user-confirmed
        }
      }
    }

    // Apply added entries -- create new MappingEntry with confidence 1.0
    if (updates.addedEntries) {
      // Get document structure for text-based paragraph index resolution.
      // The frontend sends PDF text layer indices which don't correspond to DOCX
      // paragraph indices, so we resolve the correct index by text matching.
      let docStructure = (state as unknown as Record<string, unknown>).documentStructure as
        {
          paragraphs: Array<{ paragraphIndex: number; text: string }>;
          headerFooterParagraphs?: Array<{ text: string; location: string }>;
        } | undefined;

      // If not cached (or missing header/footer data), fetch from Python service
      if ((!docStructure || !docStructure.headerFooterParagraphs) && state.templateFile.base64) {
        try {
          const sanitizerUrl = config.SANITIZER_URL;
          const structRes = await fetch(`${sanitizerUrl}/adapter/document-structure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_base64: state.templateFile.base64 }),
          });
          if (structRes.ok) {
            const structData = await structRes.json() as {
              paragraphs: Array<{ paragraph_index: number; text: string }>;
              header_footer_paragraphs?: Array<{ text: string; location: string }>;
            };
            docStructure = {
              paragraphs: structData.paragraphs.map((p) => ({
                paragraphIndex: p.paragraph_index,
                text: p.text,
              })),
              headerFooterParagraphs: structData.header_footer_paragraphs?.map((p) => ({
                text: p.text,
                location: p.location,
              })),
            };
            // Cache for future use
            await updateWizardSession(userId, sessionId, {
              documentStructure: docStructure,
            } as Partial<typeof state>);
          }
        } catch (err) {
          console.warn('[update-mapping] Failed to fetch document structure for index resolution:', err);
        }
      }

      for (const added of updates.addedEntries) {
        // Use provided sectionText first, then try document structure, then unmapped paragraphs
        let sectionText = added.sectionText ?? '';
        // Resolve the correct DOCX paragraph index by text matching
        let resolvedIndex = added.paragraphIndex;

        if (sectionText && docStructure?.paragraphs) {
          // Search for the paragraph that contains the selected text
          const needle = sectionText.trim().toLowerCase();
          const match = docStructure.paragraphs.find(
            (p) => p.text.toLowerCase().includes(needle),
          );
          if (match) {
            resolvedIndex = match.paragraphIndex;
            console.log(
              `[update-mapping] Resolved paragraph index: PDF=${added.paragraphIndex} → DOCX=${resolvedIndex} (text: "${sectionText.slice(0, 50)}")`,
            );
          } else {
            // Try partial match (selected text might be a substring)
            const partialMatch = docStructure.paragraphs.find(
              (p) => needle.includes(p.text.trim().toLowerCase()) && p.text.trim().length > 3,
            );
            if (partialMatch) {
              resolvedIndex = partialMatch.paragraphIndex;
              console.log(
                `[update-mapping] Resolved paragraph index (partial): PDF=${added.paragraphIndex} → DOCX=${resolvedIndex}`,
              );
            } else {
              // Search header/footer paragraphs as last resort
              const hfMatch = docStructure.headerFooterParagraphs?.find(
                (p) => p.text.toLowerCase().includes(needle),
              );
              if (hfMatch) {
                // Text is in a header/footer -- keep the provided index.
                // The instruction applier will locate it via text search.
                console.log(
                  `[update-mapping] Text "${sectionText.slice(0, 50)}" found in ${hfMatch.location}, applier will locate by content`,
                );
              } else {
                console.warn(
                  `[update-mapping] Could not resolve DOCX paragraph for text "${sectionText.slice(0, 50)}", using PDF index ${added.paragraphIndex}`,
                );
              }
            }
          }
        }

        if (!sectionText) {
          // Try document structure cache (DOCX paragraph text by index)
          const docPara = docStructure?.paragraphs?.find(
            (p) => p.paragraphIndex === resolvedIndex,
          );
          if (docPara) {
            sectionText = docPara.text;
          }
        }

        if (!sectionText) {
          // Fall back to unmapped paragraphs from annotated preview
          const unmapped = state.annotatedPreview?.unmappedParagraphs?.find(
            (u) => u.paragraphIndex === resolvedIndex,
          );
          if (unmapped) {
            sectionText = unmapped.text;
          }
        }

        // Generate correct Jinja2 template syntax based on marker type
        let placeholderTemplate: string;
        switch (added.markerType) {
          case 'paragraph_rt':
            placeholderTemplate = `{{p ${added.gwField} }}`;
            break;
          case 'run_rt':
            placeholderTemplate = `{{r ${added.gwField} }}`;
            break;
          case 'table_row_loop':
            placeholderTemplate = `{%tr for item in ${added.gwField} %}`;
            break;
          case 'control_flow':
            placeholderTemplate = `{% if ${added.gwField} %}`;
            break;
          default: // 'text'
            placeholderTemplate = `{{ ${added.gwField} }}`;
        }

        const newEntry: MappingEntry = {
          sectionIndex: resolvedIndex,
          sectionText,
          gwField: added.gwField,
          placeholderTemplate,
          confidence: 1.0,
          markerType: added.markerType,
          rationale: 'User-added mapping',
        };
        mappingPlan.entries.push(newEntry);
      }
    }
    // If user added entries for previously rejected sections, un-reject them
    if (updates.addedEntries) {
      const rejected = state.analysis.rejectedSectionTexts as Record<number, string> | undefined;
      if (rejected) {
        for (const added of updates.addedEntries) {
          // Check if the resolved section index was previously rejected
          const addedIdx = added.paragraphIndex;
          if (addedIdx in rejected) {
            delete rejected[addedIdx];
          }
        }
      }
    }
    } // end else (diff-based updates)

    // Persist updated mapping plan to wizard state
    const updated = await updateWizardSession(userId, sessionId, {
      analysis: {
        ...state.analysis,
        mappingPlan: mappingPlan as unknown as Record<string, unknown>,
      },
    });

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.update_mapping',
      details: {
        sessionId,
        editedCount: updates.editedEntries?.length ?? 0,
        addedCount: updates.addedEntries?.length ?? 0,
        deletedCount: updates.deletedSectionIndices?.length ?? 0,
        totalEntries: mappingPlan.entries.length,
      },
      ipAddress,
    });

    res.json({
      mappingPlan: (updated.analysis.mappingPlan as unknown as MappingPlan),
    });
  } catch (error) {
    handleAdapterError(res, error, 'Mapping update');
  }
});

// ---------------------------------------------------------------------------
// POST /api/adapter/correction-update
// ---------------------------------------------------------------------------

/**
 * Process table-based corrections and update the knowledge base immediately.
 * Body: { sessionId, corrections: [...] }
 * Decays old mappings and creates/boosts corrected mappings in the KB.
 * Returns { updated, decayed }
 */
router.post('/correction-update', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = correctionUpdateSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: body.error.issues,
      });
    }

    const userId = req.session.userId!;
    const { sessionId, corrections } = body.data;

    const state = await getWizardSession(userId, sessionId);
    if (!state) {
      return res.status(404).json({ error: 'Wizard session not found' });
    }

    const { templateType, language } = state.config;

    // Fire-and-forget: KB correction errors are logged but not thrown
    const result = await processCorrectionUpdate(
      templateType,
      language,
      corrections as CorrectionEntry[],
    );

    // Audit log
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.correction_update',
      details: {
        sessionId,
        correctionCount: corrections.length,
        updated: result.updated,
        corrected: result.corrected,
        templateType,
        language,
      },
      ipAddress,
    });

    res.json(result);
  } catch (error) {
    handleAdapterError(res, error, 'Correction update');
  }
});

// ---------------------------------------------------------------------------
// GET /api/adapter/kb-stats/:templateType
// ---------------------------------------------------------------------------

/**
 * Get knowledge base statistics for a given template type.
 * Returns zone distribution, blueprint count, style hint count,
 * average confidence, and top fields.
 */
router.get('/kb-stats/:templateType', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = templateTypeParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid template type', details: params.error.issues });
    }

    const stats = await getKBStats(params.data.templateType);
    res.json(stats);
  } catch (error) {
    handleAdapterError(res, error, 'KB stats');
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

    // Fire-and-forget: persist confirmed mappings to knowledge base
    // KB failure must NOT affect the download
    const mappingPlan = state.analysis.mappingPlan as unknown as MappingPlan;
    const mappingCount = mappingPlan?.entries?.length ?? 0;

    persistMappingsToKB(state).then(async () => {
      // Audit log for KB persistence
      try {
        await logAuditEvent({
          userId,
          action: 'adapter.kb_persist',
          details: {
            sessionId,
            mappingCount,
            templateType: state.config.templateType,
            language: state.config.language,
          },
          ipAddress,
        });
      } catch (auditErr) {
        console.error('[templateAdapter route] Failed to log KB persist audit:', auditErr);
      }
    }).catch((err) => {
      console.error('[templateAdapter route] KB persistence failed (non-blocking):', err);
    });

    // Update wizard state step to download
    updateWizardSession(userId, sessionId, {
      currentStep: 'download',
    }).catch((err) => {
      console.error('[templateAdapter route] Failed to update step to download:', err);
    });
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
 * Events: delta (text chunk), mapping_update (modified plan),
 *         selection_mapping (per-selection result), batch_complete, done (usage), error
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

      // Batch selection mapping events
      if ('selectionMapping' in chunk && chunk.selectionMapping) {
        res.write(
          `event: selection_mapping\ndata: ${JSON.stringify(chunk.selectionMapping)}\n\n`,
        );
      }

      if ('batchComplete' in chunk && chunk.batchComplete) {
        res.write(
          `event: batch_complete\ndata: ${JSON.stringify(chunk.batchComplete)}\n\n`,
        );
      }

      // Correction flow events
      if ('correctionResult' in chunk && chunk.correctionResult) {
        res.write(
          `event: correction_result\ndata: ${JSON.stringify({ mappingPlan: chunk.correctionResult })}\n\n`,
        );
      }

      if ('regenerationComplete' in chunk && chunk.regenerationComplete) {
        res.write(
          `event: regeneration_complete\ndata: ${JSON.stringify(chunk.regenerationComplete)}\n\n`,
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

    // Fire-and-forget: persist updated mappings to knowledge base after corrections
    try {
      const updatedState = await getWizardSession(userId, sessionId);
      if (updatedState) {
        persistMappingsToKB(updatedState).then(() => {
          console.log('[templateAdapter route] KB persisted after chat correction');
        }).catch((err) => {
          console.error('[templateAdapter route] KB persistence after chat failed (non-blocking):', err);
        });
      }
    } catch (kbErr) {
      console.error('[templateAdapter route] KB persistence lookup failed (non-blocking):', kbErr);
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

// ---------------------------------------------------------------------------
// DELETE /api/adapter/session/:sessionId
// ---------------------------------------------------------------------------

/**
 * Delete a wizard session. Allows the user to reset and start over.
 */
router.delete('/session/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = sessionIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const userId = req.session.userId!;
    const { sessionId } = params.data;

    await deleteWizardSession(userId, sessionId);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId,
      action: 'adapter.session_reset',
      details: { sessionId },
      ipAddress,
    });

    res.json({ success: true });
  } catch (error) {
    handleAdapterError(res, error, 'Session deletion');
  }
});

export default router;
