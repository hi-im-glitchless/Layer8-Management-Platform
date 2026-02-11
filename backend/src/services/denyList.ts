import { prisma } from '@/db/prisma.js';

/**
 * Get all active deny list terms (hot path - called on every sanitize request)
 * @returns Array of term strings only
 */
export async function getAllActiveTerms(): Promise<string[]> {
  const terms = await prisma.denyListTerm.findMany({
    where: { isActive: true },
    select: { term: true },
  });

  return terms.map((t) => t.term);
}

/**
 * List deny list terms with full details for admin UI
 * @param options - Optional filters
 * @returns Array of full term records with creator info
 */
export async function listTerms(options?: { includeInactive?: boolean }) {
  const where = options?.includeInactive ? {} : { isActive: true };

  const terms = await prisma.denyListTerm.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      creator: {
        select: { username: true },
      },
    },
  });

  return terms.map((term) => ({
    id: term.id,
    term: term.term,
    description: term.description,
    createdBy: term.createdBy,
    isActive: term.isActive,
    createdAt: term.createdAt,
    updatedAt: term.updatedAt,
    creatorUsername: term.creator?.username ?? null,
  }));
}

/**
 * Create a new deny list term
 * @param term - The term to add to deny list
 * @param description - Optional description
 * @param createdBy - User ID who created the term
 * @returns The created term
 */
export async function createTerm(
  term: string,
  description: string | null,
  createdBy: string
) {
  // Trim whitespace from term
  const trimmedTerm = term.trim();

  // Check if term already exists
  const existing = await prisma.denyListTerm.findUnique({
    where: { term: trimmedTerm },
  });

  if (existing) {
    throw new Error(`Term "${trimmedTerm}" already exists in deny list`);
  }

  const created = await prisma.denyListTerm.create({
    data: {
      term: trimmedTerm,
      description,
      createdBy,
    },
    include: {
      creator: {
        select: { username: true },
      },
    },
  });

  return {
    id: created.id,
    term: created.term,
    description: created.description,
    createdBy: created.createdBy,
    isActive: created.isActive,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    creatorUsername: created.creator?.username ?? null,
  };
}

/**
 * Update a deny list term
 * @param id - Term ID
 * @param data - Fields to update
 * @returns The updated term
 */
export async function updateTerm(
  id: string,
  data: { term?: string; description?: string | null; isActive?: boolean }
) {
  // If updating term, trim whitespace
  const updateData: any = { ...data };
  if (data.term !== undefined) {
    updateData.term = data.term.trim();

    // Check if new term conflicts with existing
    const existing = await prisma.denyListTerm.findUnique({
      where: { term: updateData.term },
    });

    if (existing && existing.id !== id) {
      throw new Error(`Term "${updateData.term}" already exists in deny list`);
    }
  }

  const updated = await prisma.denyListTerm.update({
    where: { id },
    data: updateData,
    include: {
      creator: {
        select: { username: true },
      },
    },
  });

  return {
    id: updated.id,
    term: updated.term,
    description: updated.description,
    createdBy: updated.createdBy,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    creatorUsername: updated.creator?.username ?? null,
  };
}

/**
 * Delete a deny list term
 * @param id - Term ID
 * @returns True if deleted
 */
export async function deleteTerm(id: string): Promise<boolean> {
  try {
    await prisma.denyListTerm.delete({
      where: { id },
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Bulk create deny list terms
 * @param terms - Array of terms to create
 * @param createdBy - User ID who created the terms
 * @returns Count of created and skipped terms
 */
export async function bulkCreateTerms(
  terms: Array<{ term: string; description?: string }>,
  createdBy: string
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const termData of terms) {
    try {
      const trimmedTerm = termData.term.trim();

      // Check if already exists
      const existing = await prisma.denyListTerm.findUnique({
        where: { term: trimmedTerm },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.denyListTerm.create({
        data: {
          term: trimmedTerm,
          description: termData.description ?? null,
          createdBy,
        },
      });

      created++;
    } catch (error) {
      // Skip on error (likely duplicate)
      skipped++;
    }
  }

  return { created, skipped };
}
