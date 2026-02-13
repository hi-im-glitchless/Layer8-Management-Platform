import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

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
