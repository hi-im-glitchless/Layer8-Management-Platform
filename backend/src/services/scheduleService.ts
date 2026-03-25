import { prisma } from '@/db/prisma.js';

/**
 * List active team members ordered by displayOrder, with user info.
 * Real members come first, backlog members last.
 */
export async function listTeamMembers() {
  const members = await prisma.teamMember.findMany({
    where: { status: 'active' },
    orderBy: { displayOrder: 'asc' },
    include: {
      user: {
        select: { username: true, displayName: true, avatarUrl: true },
      },
    },
  });

  // Sort: real members first (by displayOrder), backlog members last (by displayOrder)
  return members.sort((a, b) => {
    if (a.isBacklog !== b.isBacklog) return a.isBacklog ? 1 : -1;
    return a.displayOrder - b.displayOrder;
  });
}

/**
 * Create a new team member linked to a user.
 * If the user was previously archived, reactivate them instead of
 * creating a duplicate (userId has a unique constraint).
 * Sets displayOrder to the next available value.
 */
export async function createTeamMember(userId: string) {
  // Check for an existing archived record for this user
  const existing = await prisma.teamMember.findUnique({
    where: { userId },
  });

  const maxOrder = await prisma.teamMember.aggregate({
    _max: { displayOrder: true },
  });
  const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

  if (existing) {
    // Reactivate the archived member
    return prisma.teamMember.update({
      where: { id: existing.id },
      data: {
        status: 'active',
        displayOrder: nextOrder,
      },
      include: {
        user: {
          select: { username: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  return prisma.teamMember.create({
    data: {
      userId,
      displayOrder: nextOrder,
    },
    include: {
      user: {
        select: { username: true, displayName: true, avatarUrl: true },
      },
    },
  });
}

/**
 * Update a team member's status, displayOrder, and/or displayName.
 */
export async function updateTeamMember(
  id: string,
  data: { status?: string; displayOrder?: number; displayName?: string | null }
) {
  return prisma.teamMember.update({
    where: { id },
    data,
    include: {
      user: {
        select: { username: true, displayName: true, avatarUrl: true },
      },
    },
  });
}

/**
 * Archive a team member (soft delete).
 */
export async function archiveTeamMember(id: string) {
  return prisma.teamMember.update({
    where: { id },
    data: { status: 'archived' },
  });
}

/**
 * Bulk update displayOrder based on array position.
 * orderedIds[0] gets displayOrder 0, orderedIds[1] gets 1, etc.
 */
export async function reorderTeamMembers(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.teamMember.update({
        where: { id },
        data: { displayOrder: index },
      })
    )
  );
}

/**
 * Search project colors by name prefix, ordered by usage count desc.
 */
export async function searchProjectColors(query: string) {
  return prisma.projectColor.findMany({
    where: {
      name: { startsWith: query },
    },
    orderBy: { usageCount: 'desc' },
    take: 10,
  });
}

/**
 * Create or increment usage count for a project color.
 */
export async function upsertProjectColor(name: string, color: string) {
  const existing = await prisma.projectColor.findUnique({ where: { name } });

  if (existing) {
    return prisma.projectColor.update({
      where: { name },
      data: {
        color,
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  return prisma.projectColor.create({
    data: { name, color },
  });
}
