import { prisma } from '@/db/prisma.js';
import { upsertProjectColor } from '@/services/scheduleService.js';
import { isPlannerEligible, parseTags, upsertByKey as upsertProjectByKey } from '@/services/projectService.js';

/**
 * Parse JSON-stringified tag fields back to arrays for API responses.
 * SQLite stores tags as JSON strings; this ensures consumers get real arrays.
 */
function parseTagFields<T extends { tags?: string | unknown; splitTags?: string | unknown }>(
  assignment: T
): T & { tags: string[]; splitTags: string[] } {
  return {
    ...assignment,
    tags: typeof assignment.tags === 'string' ? JSON.parse(assignment.tags) : assignment.tags ?? [],
    splitTags: typeof assignment.splitTags === 'string' ? JSON.parse(assignment.splitTags) : assignment.splitTags ?? [],
  };
}

/** Predefined valid tag values for assignment categorization. */
export const VALID_TAGS = [
  'Web', 'Mobile', 'API', 'Cloud', 'Docker', 'Externa', 'Interna', 'Red Team',
  'Phishing', 'OSINT', 'Esoterico', 'Fisico', 'Ransomware/Malware', 'Chatbot', 'Cert', 'Outro',
] as const;

/**
 * Validate that all tags are from the predefined set.
 * Returns the validated array or throws on invalid tags.
 */
function validateTags(tags: string[]): string[] {
  const invalid = tags.filter((t) => !(VALID_TAGS as readonly string[]).includes(t));
  if (invalid.length > 0) {
    throw new Error(`Invalid tags: ${invalid.join(', ')}. Valid tags: ${VALID_TAGS.join(', ')}`);
  }
  return tags;
}

/**
 * Get the date range for a year/quarter filter.
 */
function getDateRange(year: number, quarter?: number): { start: Date; end: Date } {
  let start: Date;
  let end: Date;

  if (quarter) {
    const startMonth = (quarter - 1) * 3;
    start = new Date(year, startMonth, 1);
    end = new Date(year, startMonth + 3, 1);
  } else {
    start = new Date(year, 0, 1);
    end = new Date(year + 1, 0, 1);
  }

  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return { start, end };
}

/**
 * List assignments filtered by year and optional quarter, with team member info.
 */
export async function listAssignments(params: {
  year: number;
  quarter?: number;
  teamMemberId?: string;
}) {
  const { start, end } = getDateRange(params.year, params.quarter);

  const assignments = await prisma.assignment.findMany({
    where: {
      weekStart: { gte: start, lt: end },
      ...(params.teamMemberId ? { teamMemberId: params.teamMemberId } : {}),
    },
    orderBy: [{ weekStart: 'asc' }, { teamMemberId: 'asc' }],
    include: {
      teamMember: {
        include: {
          user: { select: { username: true, displayName: true } },
        },
      },
      client: true,
      splitClient: true,
      project: true,
      splitProject: true,
    },
  });
  return assignments.map(parseTagFields);
}

/**
 * Phase 24-R03: link an assignment's primary and secondary halves to Project
 * rows when they are Planner-eligible (have name + clientId + at least one
 * tag). Ineligible halves get NULL projectId — they remain in the schedule
 * but do not show up in the Planner.
 *
 * Idempotent: re-running with the same data is a no-op. Re-running with
 * changed eligibility re-links to a different Project (or sets NULL).
 */
async function linkProjectsForAssignment(assignmentId: string): Promise<void> {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!a) return;

  const primaryTags = parseTags(a.tags);
  const secondaryTags = parseTags(a.splitTags);

  const primaryEligible = isPlannerEligible({
    name: a.projectName,
    clientId: a.clientId,
    tags: primaryTags,
  });
  const secondaryEligible = isPlannerEligible({
    name: a.splitProjectName,
    clientId: a.splitClientId,
    tags: secondaryTags,
  });

  let nextProjectId: string | null = null;
  let nextSplitProjectId: string | null = null;

  if (primaryEligible) {
    const proj = await upsertProjectByKey({
      name: a.projectName,
      clientId: a.clientId!,
      tags: primaryTags,
      color: a.projectColor,
      status: a.status,
    });
    nextProjectId = proj.id;
  }

  if (secondaryEligible) {
    const proj = await upsertProjectByKey({
      name: a.splitProjectName!,
      clientId: a.splitClientId!,
      tags: secondaryTags,
      color: a.splitProjectColor ?? a.projectColor,
      status: a.splitProjectStatus ?? a.status,
    });
    nextSplitProjectId = proj.id;
  }

  if (nextProjectId !== a.projectId || nextSplitProjectId !== a.splitProjectId) {
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { projectId: nextProjectId, splitProjectId: nextSplitProjectId },
    });
  }
}

/**
 * Create or update an assignment by (teamMemberId, weekStart).
 * Uses a transaction to find-then-update/create, preventing data loss
 * when the project name changes on an existing slot.
 * Also upserts project colors for autocomplete.
 */
export async function upsertAssignment(data: {
  teamMemberId: string;
  projectName: string;
  projectColor: string;
  status: string;
  weekStart: Date;
  splitProjectName?: string | null;
  splitProjectColor?: string | null;
  splitProjectStatus?: string | null;
  splitClientId?: string | null;
  splitTags?: string[];
  createdBy?: string | null;
  clientId?: string | null;
  tags?: string[];
  /**
   * Phase 24-R02: when the caller is removing one half of a split, this
   * tells the FE-side reconciliation which surviving card to preserve.
   * Phase 24-R03 keeps it as a forward-compatible no-op signal — cards are
   * now Project-scoped, so the reconciliation falls out of linkProjects.
   */
  removedSide?: 'primary' | 'secondary';
}) {
  if (data.projectName) {
    await upsertProjectColor(data.projectName, data.projectColor);
  }

  if (data.splitProjectName && data.splitProjectColor) {
    await upsertProjectColor(data.splitProjectName, data.splitProjectColor);
  }

  const validatedTags = data.tags ? validateTags(data.tags) : undefined;
  const validatedSplitTags = data.splitTags ? validateTags(data.splitTags) : undefined;

  if (data.clientId) {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) {
      throw new Error(`Client with id "${data.clientId}" not found`);
    }
  }

  if (data.splitClientId) {
    const client = await prisma.client.findUnique({ where: { id: data.splitClientId } });
    if (!client) {
      throw new Error(`Client with id "${data.splitClientId}" not found`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findUnique({
      where: {
        teamMemberId_weekStart: {
          teamMemberId: data.teamMemberId,
          weekStart: data.weekStart,
        },
      },
    });

    const clientAndTagData = {
      ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
      ...(validatedTags !== undefined ? { tags: JSON.stringify(validatedTags) } : {}),
      ...(data.splitClientId !== undefined ? { splitClientId: data.splitClientId } : {}),
      ...(validatedSplitTags !== undefined ? { splitTags: JSON.stringify(validatedSplitTags) } : {}),
    };

    if (existing) {
      return tx.assignment.update({
        where: { id: existing.id },
        data: {
          projectName: data.projectName,
          projectColor: data.projectColor,
          status: data.status,
          splitProjectName: data.splitProjectName ?? null,
          splitProjectColor: data.splitProjectColor ?? null,
          splitProjectStatus: data.splitProjectStatus ?? null,
          createdBy: data.createdBy ?? null,
          ...clientAndTagData,
        },
      });
    }

    return tx.assignment.create({
      data: {
        teamMemberId: data.teamMemberId,
        projectName: data.projectName,
        projectColor: data.projectColor,
        status: data.status,
        weekStart: data.weekStart,
        splitProjectName: data.splitProjectName ?? null,
        splitProjectColor: data.splitProjectColor ?? null,
        splitProjectStatus: data.splitProjectStatus ?? null,
        splitClientId: data.splitClientId ?? null,
        splitTags: validatedSplitTags ? JSON.stringify(validatedSplitTags) : '[]',
        createdBy: data.createdBy ?? null,
        clientId: data.clientId ?? null,
        tags: validatedTags ? JSON.stringify(validatedTags) : '[]',
      },
    });
  });

  // Phase 24-R03: after the assignment row is written, link both halves to
  // Project rows when eligible. Non-fatal — a board-side failure must not
  // roll back the schedule write.
  try {
    await linkProjectsForAssignment(result.id);
  } catch (err) {
    console.error('[assignmentService] Failed to link projects after upsert:', err);
  }

  return parseTagFields(result);
}

/**
 * Update an assignment by ID. Rejects updates to locked assignments
 * unless explicitly unlocking.
 */
export async function updateAssignment(
  id: string,
  data: {
    projectName?: string;
    projectColor?: string;
    status?: string;
    isLocked?: boolean;
    splitProjectName?: string | null;
    splitProjectColor?: string | null;
    splitProjectStatus?: string | null;
    splitClientId?: string | null;
    splitTags?: string[];
    createdBy?: string | null;
    clientId?: string | null;
    tags?: string[];
    teamMemberId?: string;
    weekStart?: Date;
  }
) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  if (existing.isLocked && data.isLocked !== false) {
    throw new Error('Cannot update a locked assignment. Unlock it first.');
  }

  if (data.tags) {
    validateTags(data.tags);
  }
  if (data.splitTags) {
    validateTags(data.splitTags);
  }

  if (data.clientId) {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) {
      throw new Error(`Client with id "${data.clientId}" not found`);
    }
  }

  if (data.splitClientId) {
    const client = await prisma.client.findUnique({ where: { id: data.splitClientId } });
    if (!client) {
      throw new Error(`Client with id "${data.splitClientId}" not found`);
    }
  }

  const { tags, splitTags, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };
  if (tags !== undefined) {
    updateData.tags = JSON.stringify(tags);
  }
  if (splitTags !== undefined) {
    updateData.splitTags = JSON.stringify(splitTags);
  }

  const result = await prisma.assignment.update({
    where: { id },
    data: updateData,
  });

  // Phase 24-R03: re-link projects in case key fields changed.
  try {
    await linkProjectsForAssignment(result.id);
  } catch (err) {
    console.error('[assignmentService] Failed to link projects after update:', err);
  }

  return parseTagFields(result);
}

/**
 * Delete an assignment by ID. Rejects deletion of locked assignments.
 */
export async function deleteAssignment(id: string) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  if (existing.isLocked) {
    throw new Error('Cannot delete a locked assignment. Unlock it first.');
  }

  // Capture the linked project ids BEFORE the delete — the deleted row no
  // longer carries them, and a backlog/pre-R03 assignment has null halves.
  const projectId = existing.projectId;
  const splitProjectId = existing.splitProjectId;

  const deleted = await prisma.assignment.delete({ where: { id } });

  // Phase 09: last-assignment orphan guard. When the deleted assignment was
  // the LAST one pointing at a Planner project, the Project + its 1:1 BoardCard
  // survive (Assignment->Project FK is onDelete: SetNull), leaving a
  // zero-pentester card "hung up" in the board. We move that card to the
  // existing 'stopped' stage rather than deleting anything:
  //   - WHY 'stopped' (not delete): deleting the Project cascades to the
  //     BoardCard and destroys its comments/files/checklist — forbidden data
  //     loss. 'stopped' parks the card visibly so a PM can re-stage or archive.
  //   - WHY zero-count-only (MULTI-PENTESTER SAFETY, NON-NEGOTIABLE): a Project
  //     shared by other pentesters must be left COMPLETELY untouched. The count
  //     spans BOTH projectId and splitProjectId (a split half references the
  //     same Project via splitProjectId) — missing either set yields a false
  //     zero and would wrongly stop a still-active card.
  // BEST-EFFORT / NON-FATAL: wrapped in try/catch (mirroring
  // linkProjectsForAssignment) so a board-side failure never rolls back the
  // schedule delete — deleteAssignment still returns the deleted row.
  // SCHEDULE ISOLATION: the only write here is BoardCard.stage; no
  // Assignment/TeamMember/Absence/Holiday write, no row deletion.
  try {
    // De-dup the projectId === splitProjectId case (same project both halves)
    // so the count/update runs once per distinct project id.
    const linkedProjectIds = [...new Set([projectId, splitProjectId])].filter(
      (pid): pid is string => pid != null
    );

    for (const pid of linkedProjectIds) {
      const remaining = await prisma.assignment.count({
        where: { OR: [{ projectId: pid }, { splitProjectId: pid }] },
      });

      if (remaining === 0) {
        // Guard the update so a project without a BoardCard (no Planner card)
        // is a quiet no-op rather than a throw.
        const card = await prisma.boardCard.findUnique({ where: { projectId: pid } });
        if (card) {
          await prisma.boardCard.update({
            where: { projectId: pid },
            data: { stage: 'stopped' },
          });
        }
      }
    }
  } catch (err) {
    console.error('[assignmentService] Failed to stop orphaned board card after delete:', err);
  }

  return deleted;
}

/**
 * Swap the teamMemberId and weekStart between two assignments (for drag-and-drop).
 *
 * Phase 24-R03 simplification: BoardCards are now Project-scoped (not
 * Assignment-scoped), so the swap no longer has to relink any cards.
 * Project metadata stays with the content as it moves between rows.
 */
export async function swapAssignments(idA: string, idB: string) {
  const [a, b] = await Promise.all([
    prisma.assignment.findUniqueOrThrow({ where: { id: idA } }),
    prisma.assignment.findUniqueOrThrow({ where: { id: idB } }),
  ]);

  await prisma.$transaction([
    prisma.assignment.delete({ where: { id: idA } }),
    prisma.assignment.delete({ where: { id: idB } }),
    prisma.assignment.create({
      data: {
        id: idA,
        teamMemberId: b.teamMemberId,
        weekStart: b.weekStart,
        projectName: a.projectName,
        projectColor: a.projectColor,
        status: a.status,
        isLocked: a.isLocked,
        splitProjectName: a.splitProjectName,
        splitProjectColor: a.splitProjectColor,
        splitProjectStatus: a.splitProjectStatus,
        splitClientId: a.splitClientId,
        splitTags: a.splitTags,
        createdBy: a.createdBy,
        clientId: a.clientId,
        tags: a.tags,
        projectId: a.projectId,
        splitProjectId: a.splitProjectId,
      },
    }),
    prisma.assignment.create({
      data: {
        id: idB,
        teamMemberId: a.teamMemberId,
        weekStart: a.weekStart,
        projectName: b.projectName,
        projectColor: b.projectColor,
        status: b.status,
        isLocked: b.isLocked,
        splitProjectName: b.splitProjectName,
        splitProjectColor: b.splitProjectColor,
        splitProjectStatus: b.splitProjectStatus,
        splitClientId: b.splitClientId,
        splitTags: b.splitTags,
        createdBy: b.createdBy,
        clientId: b.clientId,
        tags: b.tags,
        projectId: b.projectId,
        splitProjectId: b.splitProjectId,
      },
    }),
  ]);
}

/**
 * Add a single backlog ("No Man's Landing") row.
 */
export async function addBacklogMember() {
  const existing = await prisma.teamMember.findMany({
    where: { isBacklog: true, status: 'active' },
    orderBy: { displayOrder: 'asc' },
  });

  const maxOrder = await prisma.teamMember.aggregate({
    _max: { displayOrder: true },
  });
  const baseOrder = (maxOrder._max.displayOrder ?? -1) + 1000;

  const existingNumbers = existing.map((m) => {
    const match = m.displayName?.match(/Futuro (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const nextNum = Math.max(0, ...existingNumbers) + 1;

  return prisma.teamMember.create({
    data: {
      isBacklog: true,
      displayName: `Futuro ${nextNum}`,
      displayOrder: baseOrder + existing.length,
      status: 'active',
    },
  });
}

/**
 * Toggle the isLocked boolean on an assignment.
 */
export async function toggleLock(id: string) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  return prisma.assignment.update({
    where: { id },
    data: { isLocked: !existing.isLocked },
  });
}
