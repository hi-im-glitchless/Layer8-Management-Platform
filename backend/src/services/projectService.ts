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
  if (existing) {
    // Phase 05-01: the schedule may have edited status/color on an
    // already-existing Project (e.g. an assignment's status changed). Keep the
    // canonical Project row in sync so the Planner board card reflects it.
    // Last-writer-wins — write opts.status/opts.color directly, no merge.
    // The dedupe triple {name, clientId, tags} is unchanged; only Project is
    // written (no Assignment/TeamMember/Absence/Holiday touch).
    if (existing.status !== opts.status || existing.color !== opts.color) {
      return prisma.project.update({
        where: { id: existing.id },
        data: { status: opts.status, color: opts.color },
      });
    }
    return existing;
  }

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

/**
 * Phase 01 — resolve the Project for an assignment half that ALREADY carries a
 * Project FK.
 *
 * `upsertByKey` resolves purely by the dedupe triple, so an edit to any of
 * (name, clientId, tags) on an already-linked assignment misses that lookup and
 * mints a *second* Project + BoardCard, orphaning the original card along with
 * all its stage/checklist/notes/comments/files state. When the FK is already
 * known, that id — not the triple — is authoritative; the triple is only used
 * to *resolve* a first-time link. This resolver therefore renames that row in
 * place by id, or re-points to an existing Project when the new triple collides
 * with one.
 *
 * Never used for a first-time link: linkProjectsForAssignment still calls
 * upsertByKey (and its DEFAULT_CHECKLIST BoardCard seeding) when the FK is null.
 */
export async function resolveLinkedProject(opts: {
  currentProjectId: string;
  name: string;
  clientId: string;
  tags: string[];
  color: string;
  status: string;
}) {
  const current = await prisma.project.findUnique({ where: { id: opts.currentProjectId } });
  // Defensive: the FK points at a row that no longer exists (deleted out from
  // under us). Fall back to the first-time-link path rather than throwing.
  if (!current) {
    return upsertByKey({
      name: opts.name,
      clientId: opts.clientId,
      tags: opts.tags,
      color: opts.color,
      status: opts.status,
    });
  }

  // Reuse the same normalisation upsertByKey applies, so a triple compared here
  // is byte-comparable with one resolved there.
  const name = opts.name.trim();
  const tagsJson = normaliseTags(opts.tags);

  if (current.name === name && current.clientId === opts.clientId && current.tags === tagsJson) {
    // Identity unchanged — this is not a rename. Fall through to the existing
    // Phase 05-01 last-writer-wins status/color sync, same shape as
    // upsertByKey's existing-match branch.
    // Phase 01: the zero-write short-circuit below is load-bearing, not an
    // optimisation — projectUpsertStatus.test.ts asserts updatedAt is
    // byte-identical after a true no-op re-save.
    if (current.status === opts.status && current.color === opts.color) {
      return current;
    }
    return prisma.project.update({
      where: { id: current.id },
      data: { status: opts.status, color: opts.color },
    });
  }

  // Identity changed. Look for a *different* Project that already owns the new
  // triple. Phase 01: excluding current.id from the match below is mandatory —
  // without that exclusion this query finds the very row being renamed and the
  // rename degenerates into a permanent no-op.
  const collision = await prisma.project.findFirst({
    where: { name, clientId: opts.clientId, tags: tagsJson, id: { not: current.id } },
  });

  if (collision) {
    // Collision → re-point only. The target's identity is correct by
    // construction (it was found by that exact triple), so nothing is written
    // onto it beyond the status/color diff-sync below, and Phase 01
    // deliberately writes *nothing at all* onto the abandoned row `current` —
    // no identity fields, no status/color, no delete. Leaving it orphaned
    // matches the existing un-link path exactly (linkProjectsForAssignment
    // nulls the FK and touches no Project row); orphan cleanup is explicitly
    // out of scope for this phase.
    if (collision.status !== opts.status || collision.color !== opts.color) {
      return prisma.project.update({
        where: { id: collision.id },
        data: { status: opts.status, color: opts.color },
      });
    }
    return collision;
  }

  // Genuine rename → update the already-known row BY ID, never by triple, so
  // its single BoardCard follows the rename instead of being orphaned behind a
  // freshly minted duplicate.
  return prisma.project.update({
    where: { id: current.id },
    data: {
      name,
      clientId: opts.clientId,
      tags: tagsJson,
      color: opts.color,
      status: opts.status,
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
