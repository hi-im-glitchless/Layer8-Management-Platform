import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { requireAuth } from '@/middleware/auth.js';
import { addPdfConversionJob, getPdfJobStatus } from '@/services/pdfQueue.js';
import { renderTemplatePreview } from '@/services/documents.js';
import { logAuditEvent } from '@/services/audit.js';

const router = Router();

/** Directory where documents (DOCX uploads and converted PDFs) are stored */
const DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'documents');

/** Allowed MIME types for DOCX files */
const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Allowed MIME types for PDF files */
const PDF_MIME_TYPES = ['application/pdf'];

/** Max upload size: 50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Multer configuration for document uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
    cb(null, DOCUMENTS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.docx', '.pdf'];
  const allowedMimeTypes = [...DOCX_MIME_TYPES, ...PDF_MIME_TYPES];

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only .docx and .pdf files are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

// Zod schemas for validation
const jobIdParamSchema = z.object({
  jobId: z.string().min(1),
});

const filenameParamSchema = z.object({
  filename: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_rendered)?\.(pdf|docx)$/,
    'Invalid filename format',
  ),
});

const previewRequestSchema = z.object({
  templatePath: z.string().min(1, 'templatePath is required'),
  reportId: z.number().int().positive('reportId must be a positive integer'),
});

/**
 * POST /api/documents/convert-pdf
 * Upload a DOCX file and queue it for PDF conversion via Gotenberg.
 * Returns a job ID for tracking conversion progress.
 */
router.post(
  '/convert-pdf',
  requireAuth,
  (req, res, next) => {
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
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.docx') {
        // Clean up the uploaded file
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        return res.status(400).json({ error: 'Only .docx files can be converted to PDF.' });
      }

      const docxPath = req.file.path;
      const originalName = req.file.originalname;

      // Queue the conversion job
      const jobId = await addPdfConversionJob(docxPath, originalName);

      // Audit log the upload and conversion request
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      await logAuditEvent({
        userId: req.session.userId ?? null,
        action: 'document.convert-pdf.queued',
        details: {
          jobId,
          originalName,
          savedAs: path.basename(docxPath),
          fileSize: req.file.size,
        },
        ipAddress,
      });

      res.status(202).json({
        jobId,
        status: 'queued',
      });
    } catch (error) {
      console.error('[documents routes] Convert-pdf error:', error);
      res.status(500).json({
        error: 'Failed to queue PDF conversion',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
);

/**
 * GET /api/documents/convert-pdf/:jobId
 * Check the status of a PDF conversion job.
 */
router.get('/convert-pdf/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = jobIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const { jobId } = params.data;
    const jobStatus = await getPdfJobStatus(jobId);

    if (jobStatus.status === 'not_found') {
      return res.status(404).json({ error: 'Job not found' });
    }

    const response: Record<string, unknown> = {
      status: jobStatus.status,
      progress: jobStatus.progress ?? 0,
    };

    if (jobStatus.status === 'completed' && jobStatus.pdfPath) {
      response.pdfUrl = `/api/documents/download/${jobStatus.pdfPath}`;
    }

    if (jobStatus.status === 'failed') {
      response.error = jobStatus.error;
    }

    res.json(response);
  } catch (error) {
    console.error('[documents routes] Job status error:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/documents/download/:filename
 * Download a document (PDF or DOCX) from the uploads directory.
 * Validates filename format (UUID pattern) to prevent path traversal.
 */
router.get('/download/:filename', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = filenameParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid filename format' });
    }

    const { filename } = params.data;
    const filePath = path.join(DOCUMENTS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('[documents routes] Download error:', error);
    res.status(500).json({
      error: 'Failed to download file',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/documents/preview
 * Render a DOCX template with Ghostwriter report data and queue PDF conversion.
 * Returns the rendered DOCX download URL and a PDF conversion job ID.
 */
router.post('/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const validation = previewRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.issues,
      });
    }

    const { templatePath, reportId } = validation.data;

    // Validate template file exists
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template file not found' });
    }

    const { docxPath, jobId } = await renderTemplatePreview(templatePath, reportId);
    const docxFilename = path.basename(docxPath);

    // Audit log the preview request
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId: req.session.userId ?? null,
      action: 'document.preview.queued',
      details: {
        templatePath,
        reportId,
        renderedDocx: docxFilename,
        pdfJobId: jobId,
      },
      ipAddress,
    });

    res.status(202).json({
      docxUrl: `/api/documents/download/${docxFilename}`,
      pdfJobId: jobId,
    });
  } catch (error) {
    console.error('[documents routes] Preview error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (msg.includes('not configured')) {
      return res.status(503).json({ error: 'Ghostwriter not configured' });
    }
    if (msg.includes('not found in Ghostwriter')) {
      return res.status(404).json({ error: msg });
    }
    if (msg.includes('authentication failed')) {
      return res.status(401).json({ error: 'Ghostwriter authentication failed' });
    }

    res.status(500).json({
      error: 'Failed to generate template preview',
      details: msg,
    });
  }
});

export default router;
