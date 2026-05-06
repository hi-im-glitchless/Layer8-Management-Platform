/**
 * clamService — thin wrapper around the ClamAV daemon (clamd) via the `clamscan` package.
 *
 * SCHEDULE-ISOLATION INVARIANT: this service MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. It operates on the
 * filesystem only — Prisma is intentionally NOT imported here.
 *
 * FAIL-CLOSED SEMANTICS: when the ClamAV daemon cannot be contacted,
 * `scanFile` throws Error('CLAMAV_UNREACHABLE') so callers can map to
 * HTTP 503. Per CONTEXT.md: virus scanning is mandatory; we never silently
 * accept an unscanned upload.
 */
import NodeClam from 'clamscan';
import { config } from '../config.js';

let scanner: NodeClam | null = null;

async function getScanner(): Promise<NodeClam> {
  if (scanner) return scanner;
  const clam = new NodeClam();
  scanner = await clam.init({
    clamdscan: {
      host: config.CLAMAV_HOST,
      port: config.CLAMAV_PORT,
      timeout: 15000,
      bypassTest: false,
    },
  });
  return scanner;
}

export interface ScanResult {
  clean: boolean;
  virus?: string;
}

/**
 * Scans `filePath` against the ClamAV daemon. Throws Error('CLAMAV_UNREACHABLE')
 * when the daemon cannot be reached so callers can map to HTTP 503 (fail-closed).
 *
 * MUST NOT write to any database table. Read-only by design.
 */
export async function scanFile(filePath: string): Promise<ScanResult> {
  try {
    const clam = await getScanner();
    const { isInfected, viruses } = await clam.isInfected(filePath);
    return { clean: !isInfected, virus: viruses?.[0] };
  } catch {
    // Reset scanner so the next request retries init (handles transient failures).
    scanner = null;
    throw new Error('CLAMAV_UNREACHABLE');
  }
}

/** Lightweight reachability probe used by the healthcheck route (optional). */
export async function isScannerReachable(): Promise<boolean> {
  try {
    await getScanner();
    return true;
  } catch {
    return false;
  }
}
