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
  docxPath: string;
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
 * Sends DOCX files to Gotenberg for LibreOffice-based conversion.
 * Concurrency = 1 because LibreOffice is not thread-safe.
 */
export const pdfConversionWorker = new Worker<PdfConversionJobData>(
  'pdf-conversion',
  async (job: Job<PdfConversionJobData>) => {
    const { docxPath, originalName } = job.data;

    // Validate the DOCX file exists
    if (!fs.existsSync(docxPath)) {
      throw new Error(`DOCX file not found: ${docxPath}`);
    }

    await job.updateProgress(10);

    // Build multipart form data for Gotenberg
    const fileBuffer = fs.readFileSync(docxPath);
    const formData = new FormData();
    formData.append('files', new Blob([fileBuffer]), originalName);

    await job.updateProgress(20);

    // POST to Gotenberg LibreOffice conversion endpoint
    const gotenbergUrl = `${config.GOTENBERG_URL}/forms/libreoffice/convert`;
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
 * Add a DOCX file to the PDF conversion queue.
 * @param docxPath Absolute path to the uploaded DOCX file
 * @param originalName Original filename (used in Gotenberg request)
 * @returns The BullMQ job ID
 */
export async function addPdfConversionJob(
  docxPath: string,
  originalName: string,
): Promise<string> {
  if (!docxPath || !fs.existsSync(docxPath)) {
    throw new Error(`Invalid DOCX path: ${docxPath}`);
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
