/**
 * Schedule-isolation regression — Phase 23.
 *
 * Asserts that every Phase 23 mutation (notes PATCH, comment edit, comment
 * soft-delete, mention notification creation, card archive) leaves the
 * Assignment / TeamMember / Absence / Holiday tables byte-identical.
 *
 * The assertion model is "byte equality of the JSON serialisation of every
 * row currently in the table". This catches both writes to the rows we seed
 * AND incidental writes to unrelated rows (e.g. an inadvertent updatedAt
 * trigger on a sibling Assignment). Tests run against the dev DB per the
 * project's vitest.config.ts; cleanup runs in a try/finally so a failure
 * mid-test does not leave seed rows behind.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { updateNotes } from '../boardNotesService.js';
import {
  editComment,
  softDeleteComment,
} from '../boardCommentService.js';
import { createNotificationsForMentions } from '../boardNotificationService.js';
import { archiveCard } from '../boardArchiveService.js';

interface SeedIds {
  userId: string;
  teamMemberId: string;
  assignmentId: string;
  cardId: string;
  projectId: string;
  commentId: string;
  fileId: string;
  storedName: string;
  holidayId: string;
  absenceId: string;
}

function uniqueSuffix(): string {
  return `iso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function snapshotScheduleTables() {
  const [assignments, teamMembers, absences, holidays] = await Promise.all([
    prisma.assignment.findMany({ orderBy: { id: 'asc' } }),
    prisma.teamMember.findMany({ orderBy: { id: 'asc' } }),
    prisma.absence.findMany({ orderBy: { id: 'asc' } }),
    prisma.holiday.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return {
    assignment: JSON.stringify(assignments),
    teamMember: JSON.stringify(teamMembers),
    absence: JSON.stringify(absences),
    holiday: JSON.stringify(holidays),
  };
}

async function seedDataset(): Promise<SeedIds> {
  const suffix = uniqueSuffix();
  const user = await prisma.user.create({
    data: {
      username: `iso-admin-${suffix}`,
      passwordHash: 'not-a-real-hash',
      role: 'ADMIN',
      displayName: 'Isolation Test Admin',
    },
  });
  const teamMember = await prisma.teamMember.create({
    data: {
      userId: user.id,
      displayName: 'Isolation Test TM',
      status: 'active',
    },
  });
  const assignment = await prisma.assignment.create({
    data: {
      teamMemberId: teamMember.id,
      projectName: `Iso Project ${suffix}`,
      projectColor: '#abcdef',
      status: 'confirmed',
      weekStart: new Date('2099-01-05T00:00:00.000Z'),
    },
  });
  // Phase 24-R03: BoardCard is now keyed by Project, not Assignment.
  // Materialise a Project for the test fixture so the card has somewhere to attach.
  const project = await prisma.project.create({
    data: {
      name: `Iso Project ${suffix}`,
      clientId: null,
      tags: '["Externa"]',
      color: '#abcdef',
      status: 'placeholder',
    },
  });
  const card = await prisma.boardCard.create({
    data: {
      projectId: project.id,
      stage: 'preparation',
      checklist: '[]',
      notes: 'initial notes',
    },
  });
  const comment = await prisma.boardComment.create({
    data: {
      cardId: card.id,
      authorId: user.id,
      body: 'initial body',
    },
  });
  const storedName = `${suffix}.bin`;
  const cardUploadDir = path.join(process.cwd(), 'uploads', 'board', card.id);
  fs.mkdirSync(cardUploadDir, { recursive: true });
  const onDisk = path.join(cardUploadDir, storedName);
  fs.writeFileSync(onDisk, 'isolation test bytes');
  const file = await prisma.boardFile.create({
    data: {
      cardId: card.id,
      filename: 'iso.bin',
      storedName,
      mimeType: 'application/octet-stream',
      sizeBytes: 20,
      uploadedBy: user.id,
    },
  });
  const holiday = await prisma.holiday.create({
    data: {
      name: `Iso Holiday ${suffix}`,
      month: 12,
      day: 31,
      isRecurring: false,
    },
  });
  const absence = await prisma.absence.create({
    data: {
      teamMemberId: teamMember.id,
      date: new Date('2099-01-06T00:00:00.000Z'),
      type: 'vacation',
    },
  });
  return {
    userId: user.id,
    teamMemberId: teamMember.id,
    assignmentId: assignment.id,
    cardId: card.id,
    projectId: project.id,
    commentId: comment.id,
    fileId: file.id,
    storedName,
    holidayId: holiday.id,
    absenceId: absence.id,
  };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // Order matters: BoardNotification → BoardFile → BoardComment → BoardCard
  // → Assignment → Absence → TeamMember → Holiday → User. Wrap each in
  // try/catch so a partial seed (e.g. archive already deleted BoardFile)
  // does not abort cleanup of the rest.
  await prisma.boardNotification.deleteMany({ where: { cardId: ids.cardId } }).catch(() => undefined);
  await prisma.boardFile.deleteMany({ where: { cardId: ids.cardId } }).catch(() => undefined);
  await prisma.boardComment.deleteMany({ where: { cardId: ids.cardId } }).catch(() => undefined);
  await prisma.boardCard.deleteMany({ where: { id: ids.cardId } }).catch(() => undefined);
  await prisma.project.deleteMany({ where: { id: ids.projectId } }).catch(() => undefined);
  await prisma.absence.deleteMany({ where: { id: ids.absenceId } }).catch(() => undefined);
  await prisma.assignment.deleteMany({ where: { id: ids.assignmentId } }).catch(() => undefined);
  await prisma.teamMember.deleteMany({ where: { id: ids.teamMemberId } }).catch(() => undefined);
  await prisma.holiday.deleteMany({ where: { id: ids.holidayId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: ids.userId } }).catch(() => undefined);
  // Disk file may already have been unlinked by archiveCard.
  try {
    const cardDir = path.join(process.cwd(), 'uploads', 'board', ids.cardId);
    if (fs.existsSync(cardDir)) {
      fs.rmSync(cardDir, { recursive: true, force: true });
    }
  } catch {
    // best-effort cleanup
  }
}

describe('Phase 23 schedule isolation', () => {
  let ids: SeedIds | null = null;

  beforeEach(async () => {
    ids = await seedDataset();
  });

  afterEach(async () => {
    await teardownDataset(ids);
    ids = null;
  });

  it('updateNotes leaves Assignment / TeamMember / Absence / Holiday byte-identical', async () => {
    const before = await snapshotScheduleTables();
    await updateNotes(ids!.cardId, 'updated notes content', ids!.userId);
    const after = await snapshotScheduleTables();
    expect(after).toEqual(before);
  });

  it('editComment leaves the schedule tables byte-identical', async () => {
    const before = await snapshotScheduleTables();
    await editComment(ids!.commentId, ids!.userId, 'edited body');
    const after = await snapshotScheduleTables();
    expect(after).toEqual(before);
  });

  it('softDeleteComment leaves the schedule tables byte-identical', async () => {
    const before = await snapshotScheduleTables();
    await softDeleteComment(ids!.commentId);
    const after = await snapshotScheduleTables();
    expect(after).toEqual(before);
  });

  it('createNotificationsForMentions leaves the schedule tables byte-identical', async () => {
    const before = await snapshotScheduleTables();
    // Self-mention is filtered, but still exercises the User read path.
    await createNotificationsForMentions({
      cardId: ids!.cardId,
      authorUserId: ids!.userId,
      mentionedUserIds: [ids!.userId],
    });
    const after = await snapshotScheduleTables();
    expect(after).toEqual(before);
  });

  it('archiveCard leaves the schedule tables byte-identical', async () => {
    const before = await snapshotScheduleTables();
    const beforeAssignment = await prisma.assignment.findUnique({
      where: { id: ids!.assignmentId },
    });
    await archiveCard(ids!.cardId, beforeAssignment!.projectName, ids!.userId);
    const after = await snapshotScheduleTables();
    expect(after).toEqual(before);

    // Defence in depth: also assert that the linked Assignment row is
    // byte-identical to its pre-archive form (the global snapshot above
    // would also catch this, but a focused diff is easier to debug).
    const afterAssignment = await prisma.assignment.findUnique({
      where: { id: ids!.assignmentId },
    });
    expect(JSON.stringify(afterAssignment)).toEqual(JSON.stringify(beforeAssignment));
  });

  it('full Phase 23 mutation matrix leaves the schedule tables byte-identical', async () => {
    const before = await snapshotScheduleTables();
    await updateNotes(ids!.cardId, 'matrix notes', ids!.userId);
    await editComment(ids!.commentId, ids!.userId, 'matrix edit');
    await createNotificationsForMentions({
      cardId: ids!.cardId,
      authorUserId: ids!.userId,
      mentionedUserIds: [ids!.userId],
    });
    await softDeleteComment(ids!.commentId);
    const assignment = await prisma.assignment.findUnique({
      where: { id: ids!.assignmentId },
    });
    await archiveCard(ids!.cardId, assignment!.projectName, ids!.userId);
    const after = await snapshotScheduleTables();
    expect(after).toEqual(before);
  });
});
