import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { fetchReportData } from './ghostwriter.js';
import { mapReportToTemplateContext } from './ghostwriterMapper.js';
import { addPdfConversionJob } from './pdfQueue.js';

/** Directory where converted PDFs and uploaded DOCX files are stored */
const DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'documents');

/**
 * Check Gotenberg service health.
 * @returns Object with availability status and optional version info
 */
export async function checkGotenbergHealth(): Promise<{
  available: boolean;
  version?: string;
}> {
  try {
    const response = await fetch(`${config.GOTENBERG_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        available: true,
        version: data.version || undefined,
      };
    }

    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Delete files in uploads/documents/ older than maxAgeMs.
 * @param maxAgeMs Maximum file age in milliseconds
 * @returns Number of files deleted
 */
export async function cleanupExpiredDocuments(maxAgeMs: number): Promise<number> {
  let deletedCount = 0;

  try {
    if (!fs.existsSync(DOCUMENTS_DIR)) {
      return 0;
    }

    const now = Date.now();
    const files = fs.readdirSync(DOCUMENTS_DIR);

    for (const file of files) {
      const filePath = path.join(DOCUMENTS_DIR, file);

      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch {
        // Skip files that can't be accessed
      }
    }
  } catch (error) {
    console.error('[documents] Error cleaning up expired documents:', error);
  }

  return deletedCount;
}

/**
 * Render a DOCX template with Ghostwriter report data.
 *
 * Fetches the GW report, maps it to template context, reads the template
 * file from disk, and POSTs to the sanitization-service /render-template
 * endpoint for Jinja2 rendering.
 *
 * @param templatePath Absolute path to the DOCX template file
 * @param reportId Ghostwriter report ID
 * @returns Buffer of the rendered DOCX
 */
export async function renderTemplateWithGWData(
  templatePath: string,
  reportId: number,
): Promise<Buffer> {
  // Validate template exists
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  // Fetch GW report data and map to template context
  const report = await fetchReportData(reportId);
  const templateContext = mapReportToTemplateContext(report);

  // Read template and encode as base64
  const templateBytes = fs.readFileSync(templatePath);
  const templateBase64 = templateBytes.toString('base64');

  // Call sanitization-service render endpoint
  const renderUrl = `${config.SANITIZER_URL}/render-template`;
  const response = await fetch(renderUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: templateBase64,
      context: templateContext,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Template rendering failed (${response.status}): ${errorBody}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Render a template and queue PDF preview generation.
 *
 * Orchestrates the full pipeline: GW data fetch -> Jinja2 render -> save DOCX
 * -> queue PDF conversion via Gotenberg.
 *
 * @param templatePath Absolute path to the DOCX template file
 * @param reportId Ghostwriter report ID
 * @returns Object with rendered DOCX path and PDF conversion job ID
 */
export async function renderTemplatePreview(
  templatePath: string,
  reportId: number,
): Promise<{ docxPath: string; jobId: string }> {
  // Render the template with GW data
  const renderedBuffer = await renderTemplateWithGWData(templatePath, reportId);

  // Save rendered DOCX to uploads directory
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const renderedFilename = `${randomUUID()}_rendered.docx`;
  const docxPath = path.join(DOCUMENTS_DIR, renderedFilename);
  fs.writeFileSync(docxPath, renderedBuffer);

  // Queue PDF conversion
  const jobId = await addPdfConversionJob(docxPath, renderedFilename);

  return { docxPath, jobId };
}
