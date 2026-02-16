import { Queue, Worker, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

/**
 * Parse Redis URL into IORedis-compatible connection options.
 * BullMQ requires IORedis-style { host, port, password, db } not a URL string.
 */
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1) || '0', 10) : 0,
  };
}

const redisConnection = parseRedisUrl(config.REDIS_URL);

/** Directory where converted PDFs and uploaded DOCX files are stored */
const DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'documents');

/** Job data shape for PDF conversion */
export interface PdfConversionJobData {
  docxPath: string; // path to DOCX or HTML file
  originalName: string;
}

/** Status response for a PDF conversion job */
export interface PdfJobStatus {
  status: 'queued' | 'active' | 'completed' | 'failed' | 'not_found';
  progress?: number;
  pdfPath?: string;
  error?: string;
}

/** BullMQ Queue for PDF conversion jobs */
export const pdfConversionQueue = new Queue<PdfConversionJobData>('pdf-conversion', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

/**
 * Worker that processes PDF conversion jobs.
 * Sends HTML files to Gotenberg Chromium endpoint, or DOCX files to LibreOffice.
 * Concurrency = 1 to avoid overwhelming Gotenberg.
 */
export const pdfConversionWorker = new Worker<PdfConversionJobData>(
  'pdf-conversion',
  async (job: Job<PdfConversionJobData>) => {
    const { docxPath, originalName } = job.data;

    // Validate the source file exists
    if (!fs.existsSync(docxPath)) {
      throw new Error(`Source file not found: ${docxPath}`);
    }

    await job.updateProgress(10);

    const isHtml = originalName.endsWith('.html') || docxPath.endsWith('.html');

    // Build multipart form data for Gotenberg
    const fileBuffer = fs.readFileSync(docxPath);
    const formData = new FormData();

    let gotenbergUrl: string;

    if (isHtml) {
      // HTML -> PDF via Gotenberg Chromium endpoint
      // Gotenberg expects the HTML file to be named "index.html"
      formData.append('files', new Blob([fileBuffer], { type: 'text/html' }), 'index.html');
      // Wait for Chart.js to render before capturing PDF
      formData.append('waitDelay', '2s');
      gotenbergUrl = `${config.GOTENBERG_URL}/forms/chromium/convert/html`;
    } else {
      // DOCX -> PDF via Gotenberg LibreOffice endpoint
      formData.append('files', new Blob([fileBuffer]), originalName);
      gotenbergUrl = `${config.GOTENBERG_URL}/forms/libreoffice/convert`;
    }

    await job.updateProgress(20);

    const response = await fetch(gotenbergUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gotenberg conversion failed (${response.status}): ${errorText}`);
    }

    await job.updateProgress(80);

    // Save the returned PDF
    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    const pdfFilename = `${randomUUID()}.pdf`;
    const pdfPath = path.join(DOCUMENTS_DIR, pdfFilename);

    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
    fs.writeFileSync(pdfPath, pdfBuffer);

    await job.updateProgress(100);

    return { pdfPath, pdfFilename };
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

// Log worker events
pdfConversionWorker.on('completed', (job) => {
  console.log(`[pdfQueue] Job ${job.id} completed: ${job.returnvalue?.pdfFilename}`);
});

pdfConversionWorker.on('failed', (job, err) => {
  console.error(`[pdfQueue] Job ${job?.id} failed:`, err.message);
});

/**
 * Add a file to the PDF conversion queue (HTML or DOCX).
 * @param docxPath Absolute path to the source file (HTML or DOCX)
 * @param originalName Original filename (used to detect format and in Gotenberg request)
 * @returns The BullMQ job ID
 */
export async function addPdfConversionJob(
  docxPath: string,
  originalName: string,
): Promise<string> {
  if (!docxPath || !fs.existsSync(docxPath)) {
    throw new Error(`Invalid source file path: ${docxPath}`);
  }

  const job = await pdfConversionQueue.add('convert', {
    docxPath,
    originalName,
  });

  return job.id!;
}

/**
 * Get the status of a PDF conversion job.
 * @param jobId BullMQ job ID
 * @returns Job status with progress and result data
 */
export async function getPdfJobStatus(jobId: string): Promise<PdfJobStatus> {
  const job = await pdfConversionQueue.getJob(jobId);

  if (!job) {
    return { status: 'not_found' };
  }

  const state = await job.getState();

  switch (state) {
    case 'completed':
      return {
        status: 'completed',
        progress: 100,
        pdfPath: job.returnvalue?.pdfFilename,
      };
    case 'failed':
      return {
        status: 'failed',
        progress: job.progress as number,
        error: job.failedReason || 'Unknown error',
      };
    case 'active':
      return {
        status: 'active',
        progress: job.progress as number,
      };
    default:
      return {
        status: 'queued',
        progress: 0,
      };
  }
}
