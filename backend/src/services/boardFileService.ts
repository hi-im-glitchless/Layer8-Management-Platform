/**
 * boardFileService — pure board-file helpers (quota arithmetic, MIME allowlist).
 *
 * SCHEDULE-ISOLATION INVARIANT: this module MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. The board feature has
 * a non-negotiable no-write boundary against the schedule domain
 * (see 23-CONTEXT.md "Data Safety — Schedule Protection"). Only `BoardFile`
 * is touched here, read-only via `aggregate({ _sum: { sizeBytes } })`.
 */
import { prisma } from '@/db/prisma.js';

/** Per-card storage cap from CONTEXT.md ("Per-card quota: 500 MB hard cap"). */
export const MAX_CARD_BYTES = 500 * 1024 * 1024;

/** Per-file size cap (mirrored from multer `limits.fileSize`). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Whitelist of MIME types accepted for board uploads. Drawn from
 * 23-CONTEXT.md "MIME whitelist". Extension-only checks are insufficient —
 * we trust the MIME sniffed by multer/busboy.
 *
 * Note on `application/octet-stream`: required for `.ovpn` and `.conf`
 * VPN configs which have no formal MIME. The accompanying audit log
 * records the original filename so post-hoc abuse is detectable.
 */
export const ALLOWED_MIME_TYPES = new Set<string>([
  // PDFs / text / data
  'application/pdf',
  'text/plain',
  'text/csv',
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  // VPN configs (.ovpn, .conf typically have no formal MIME)
  'application/octet-stream',
  // Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
]);

/**
 * Total size in bytes of all non-quarantined files attached to a card.
 * Used by the upload pre-write quota guard to enforce `MAX_CARD_BYTES`.
 */
export async function getCardStorageUsed(cardId: string): Promise<number> {
  const result = await prisma.boardFile.aggregate({
    where: { cardId, isQuarantined: false },
    _sum: { sizeBytes: true },
  });
  return result._sum.sizeBytes ?? 0;
}
