import { prisma } from '@/db/prisma.js';
import { DEFAULT_CHECKLIST } from './boardService.js';

/**
 * Phase 24-R03 — Project service.
 *
 * A Project is the canonical entity surfaced by the Planner. Many Assignments
 * may reference the same Project (multi-pentester or multi-week engagements).
 * The dedupe key — what makes "this Project" the same as another — is the
 * normalised triple `(name, clientId, sortedTagsJson)`, computed here.
 */

/** Canonical sort + JSON-stringify for the tags array. */
export function normaliseTags(tags: string[]): string {
  return JSON.stringify([...tags].sort());
}

/** Parse a tags column back to a real array. */
export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Check whether a half of an assignment is "Planner-eligible" — has all three
 * of (name, clientId, at least one tag). Eligible halves get a Project link
 * on upsert; ineligible halves keep their projectId NULL and stay invisible
 * to the new Planner.
 */
export function isPlannerEligible(opts: {
  name: string | null | undefined;
  clientId: string | null | undefined;
  tags: string[];
}): boolean {
  return !!(opts.name?.trim()) && !!opts.clientId && opts.tags.length > 0;
}

/**
 * Look up or create the Project for a given identity. Idempotent.
 *
 * Also auto-creates a BoardCard for the Project (the Planner expects every
 * Project to have exactly one card).
 */
export async function upsertByKey(opts: {
  name: string;
  clientId: string;
  tags: string[];
  color: string;
  status: string;
}) {
  const name = opts.name.trim();
  const tagsJson = normaliseTags(opts.tags);

  // Find by the dedupe triple — enforced at the app layer, not the DB,
  // because SQLite cannot index a sorted-JSON column deterministically.
  const existing = await prisma.project.findFirst({
    where: {
      name,
      clientId: opts.clientId,
      tags: tagsJson,
    },
  });
  if (existing) return existing;

  // Create (with its BoardCard) in one round-trip.
  return prisma.project.create({
    data: {
      name,
      clientId: opts.clientId,
      tags: tagsJson,
      color: opts.color,
      status: opts.status,
      boardCard: {
        create: {
          stage: 'upcoming',
          checklist: JSON.stringify(DEFAULT_CHECKLIST),
          notes: '',
        },
      },
    },
  });
}

/** Get one Project by id. */
export function getById(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: { client: true, boardCard: true },
  });
}

/**
 * Search projects for the AssignmentModal picker.
 * - q: case-insensitive substring of name (ignored if empty)
 * - clientId: optional filter (typical use: scope to the just-chosen client)
 * Caps at 50 results — the picker is autocomplete, not a full list.
 */
export async function searchProjects(opts: { q?: string; clientId?: string | null }) {
  const where: Record<string, unknown> = {};
  if (opts.q && opts.q.trim()) {
    // SQLite uses 'contains' for substring match. Prisma builds a LIKE %q% query.
    where.name = { contains: opts.q.trim() };
  }
  if (opts.clientId) where.clientId = opts.clientId;

  return prisma.project.findMany({
    where,
    include: { client: { select: { id: true, name: true, color: true } } },
    orderBy: [{ updatedAt: 'desc' }],
    take: 50,
  });
}
