/**
 * Phase 24-R03 dry-run: preview what the Project-entity migration would do
 * against the current database WITHOUT writing anything.
 *
 * Reads every Assignment row, groups by (projectName, clientId, sortedTags) —
 * the dedupe key we'll use to materialise the new Project entity — and prints:
 *
 *   • Total assignments, total resulting projects
 *   • Top groups by assignment-count (multi-pentester / multi-week projects)
 *   • Examples of would-be-merged BoardCards (notes/files/comments counts)
 *   • Suspicious cases (e.g., a group whose name is empty)
 *
 * Run with:  npx tsx backend/scripts/dryrun-project-dedupe.ts
 *
 * Safe to run on prod. The script is read-only. No writes, no side-effects.
 */

import { prisma } from '../src/db/prisma.js';

function parseTags(raw: unknown): string[] {
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

function dedupeKey(name: string | null, clientId: string | null, tagsArr: string[]): string {
  const cleanName = (name ?? '').trim();
  const sortedTags = [...tagsArr].sort().join(',');
  return `${cleanName}|${clientId ?? ''}|${sortedTags}`;
}

interface Group {
  key: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  tags: string[];
  assignmentIds: string[];
  // BoardCards that would be merged into a single Project card.
  primaryCardIds: string[];
  secondaryCardIds: string[];
  notesCount: number;        // assignments with non-empty notes (any side)
  filesCount: number;        // total files across all of this group's cards
  commentsCount: number;     // total comments across all of this group's cards
}

async function main() {
  console.log('=== Phase 24-R03 dry-run: Project dedupe preview ===\n');

  const assignments = await prisma.assignment.findMany({
    include: {
      client: { select: { id: true, name: true } },
      splitClient: { select: { id: true, name: true } },
      boardCards: {
        include: {
          _count: { select: { files: true, comments: true } },
        },
      },
    },
  });

  console.log(`Total Assignment rows: ${assignments.length}`);
  console.log(`Total BoardCard rows:  ${assignments.reduce((n, a) => n + a.boardCards.length, 0)}`);

  // A split assignment contributes up to 2 "virtual project slots" — one for primary, one for secondary.
  // Group both halves with the same dedupe key so we see real consolidation.
  const groups = new Map<string, Group>();

  function addToGroup(
    key: string,
    g: Pick<Group, 'projectName' | 'clientId' | 'clientName' | 'tags'>,
    assignmentId: string,
    cardId: string | null,
    side: 'primary' | 'secondary',
    files: number,
    comments: number,
    hasNotes: boolean,
  ) {
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        key,
        projectName: g.projectName,
        clientId: g.clientId,
        clientName: g.clientName,
        tags: g.tags,
        assignmentIds: [],
        primaryCardIds: [],
        secondaryCardIds: [],
        notesCount: 0,
        filesCount: 0,
        commentsCount: 0,
      };
      groups.set(key, entry);
    }
    entry.assignmentIds.push(assignmentId);
    if (cardId) {
      if (side === 'primary') entry.primaryCardIds.push(cardId);
      else entry.secondaryCardIds.push(cardId);
    }
    entry.filesCount += files;
    entry.commentsCount += comments;
    if (hasNotes) entry.notesCount += 1;
  }

  for (const a of assignments) {
    // Primary half
    const pTags = parseTags(a.tags);
    const pKey = dedupeKey(a.projectName, a.clientId, pTags);
    const pCard = a.boardCards.find((c) => c.side === 'primary');
    addToGroup(
      pKey,
      {
        projectName: (a.projectName ?? '').trim(),
        clientId: a.clientId,
        clientName: a.client?.name ?? null,
        tags: pTags,
      },
      a.id,
      pCard?.id ?? null,
      'primary',
      pCard?._count.files ?? 0,
      pCard?._count.comments ?? 0,
      !!(pCard?.notes && pCard.notes.length > 0),
    );

    // Secondary half (only if data exists)
    const hasSplit = !!(a.splitProjectName?.trim()) || !!a.splitClientId;
    if (hasSplit) {
      const sTags = parseTags(a.splitTags);
      const sKey = dedupeKey(a.splitProjectName, a.splitClientId, sTags);
      const sCard = a.boardCards.find((c) => c.side === 'secondary');
      addToGroup(
        sKey,
        {
          projectName: (a.splitProjectName ?? '').trim(),
          clientId: a.splitClientId,
          clientName: a.splitClient?.name ?? null,
          tags: sTags,
        },
        a.id,
        sCard?.id ?? null,
        'secondary',
        sCard?._count.files ?? 0,
        sCard?._count.comments ?? 0,
        !!(sCard?.notes && sCard.notes.length > 0),
      );
    }
  }

  console.log(`Total Projects after dedupe: ${groups.size}`);
  const totalCardsAfter = groups.size;
  const cardsCollapsing = Array.from(groups.values()).reduce(
    (n, g) => n + Math.max(0, g.primaryCardIds.length + g.secondaryCardIds.length - 1),
    0,
  );
  console.log(`BoardCards that would consolidate (merge): ${cardsCollapsing}`);
  console.log(`Final BoardCard count: ${totalCardsAfter}\n`);

  // Top groups by assignment count (multi-pentester / multi-week)
  const sorted = Array.from(groups.values()).sort(
    (a, b) => b.assignmentIds.length - a.assignmentIds.length,
  );

  console.log('=== Top 15 groups by assignment count ===');
  for (const g of sorted.slice(0, 15)) {
    const tagStr = g.tags.length ? ` [${g.tags.join(', ')}]` : '';
    const client = g.clientName ? ` · ${g.clientName}` : '';
    const name = g.projectName || '(no name)';
    const cards = g.primaryCardIds.length + g.secondaryCardIds.length;
    console.log(
      `  ${g.assignmentIds.length} assignments  →  "${name}"${client}${tagStr}  ` +
        `[cards: ${cards}, files: ${g.filesCount}, comments: ${g.commentsCount}, notes: ${g.notesCount}]`,
    );
  }

  // Groups with data that would consolidate (multiple cards with notes/files/comments → one)
  console.log('\n=== Groups where multiple BoardCards would merge (DATA REVIEW NEEDED) ===');
  const consolidating = sorted.filter(
    (g) =>
      g.primaryCardIds.length + g.secondaryCardIds.length > 1 &&
      (g.notesCount > 0 || g.filesCount > 0 || g.commentsCount > 0),
  );
  if (consolidating.length === 0) {
    console.log('  (none — no overlapping cards have notes/files/comments to merge)');
  } else {
    for (const g of consolidating.slice(0, 20)) {
      const tagStr = g.tags.length ? ` [${g.tags.join(', ')}]` : '';
      const client = g.clientName ? ` · ${g.clientName}` : '';
      const name = g.projectName || '(no name)';
      const cards = g.primaryCardIds.length + g.secondaryCardIds.length;
      console.log(
        `  "${name}"${client}${tagStr}  →  ${cards} cards merge  ` +
          `(notes_assignments=${g.notesCount}, files=${g.filesCount}, comments=${g.commentsCount})`,
      );
    }
    if (consolidating.length > 20) {
      console.log(`  ... and ${consolidating.length - 20} more.`);
    }
  }

  // Suspicious / edge cases
  console.log('\n=== Edge cases ===');
  const emptyName = sorted.filter((g) => !g.projectName);
  const emptyClient = sorted.filter((g) => !g.clientId && !g.projectName);
  console.log(`  Groups with empty projectName (will dedupe by client+tags only): ${emptyName.length}`);
  console.log(`  Truly empty groups (no name and no client): ${emptyClient.length}`);

  console.log('\nDry-run complete. No data was modified.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
