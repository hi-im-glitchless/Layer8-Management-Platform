/**
 * Route-level access matrix — client notes read/write (Phase 01).
 *
 * Contract asserted here:
 *   1. GET /clients/:id/notes as NORMAL            → 200 { notes, notesUpdatedAt, notesUpdatedBy }
 *   2. GET as PM and as ADMIN                      → 200 (all-roles read regression)
 *   3. GET for a non-existent client id            → 404
 *   4. PUT /clients/:id/notes as NORMAL            → 403 AND the DB row's notes unchanged
 *   5. PUT as PM                                    → 200; notes updated, notesUpdatedAt set,
 *      notesUpdatedBy === the PM user's raw id (NOT username/display name)
 *   6. PUT as ADMIN                                 → 200 (requireRole('PM') admits ADMIN)
 *   7. After a successful PUT, exactly one AuditLog row exists with
 *      action 'client.notes.update' and details.clientId === the seeded client id
 *   8. Schedule isolation: the notes write neither mutates nor inserts any
 *      Assignment / TeamMember / Absence / Holiday row tied to this fixture.
 *
 * The real `schedule.ts` router is mounted behind a session-injecting middleware
 * that reads the desired identity from an `x-test-user` header, so one app serves
 * every role (normal / pm / admin). All injected sessions are TOTP-verified so
 * `requireAuth` passes; authorization is then decided by the route guards.
 *
 * SCHEDULE-ISOLATION (case 8): because vitest runs suites in parallel against the
 * shared dev DB, global row counts would flake (other suites seed/tear down
 * Assignment/TeamMember rows concurrently). Instead we seed one row in each of the
 * four schedule tables tied uniquely to this fixture and assert those exact rows
 * are byte-identical after the write (no UPDATE/DELETE) and that no new rows appear
 * under this fixture's markers (no INSERT) — a parallel-worker-safe proof of the
 * no-write boundary.
 *
 * Tests run against the dev DB per vitest.config.ts; cleanup runs in afterEach
 * (reverse-FK order, each delete scoped + .catch). AuditLog rows are intentionally
 * NOT deleted (append-only hash chain) — case 7 asserts by a unique
 * details.clientId marker rather than an empty table.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import scheduleRouter from '../schedule.js';

interface SeedIds {
  normalUserId: string;
  pmUserId: string;
  adminUserId: string;
  clientId: string;
  teamMemberId: string;
  assignmentId: string;
  absenceId: string;
  holidayId: string;
  marker: string;
}

function uniqueSuffix(): string {
  return `clnotes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function withDbRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isLockTimeout =
        /timed out|database is locked|SQLITE_BUSY|Transaction (?:already closed|api error)/i.test(msg);
      if (!isLockTimeout) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 50 * (i + 1) + Math.floor(Math.random() * 50)));
    }
  }
  throw lastErr;
}

function buildApp(sessions: Record<string, { userId: string; role: string }>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const key = (req.headers['x-test-user'] as string) ?? '';
    const picked = sessions[key];
    (req as unknown as { session: Record<string, unknown> }).session = picked
      ? { userId: picked.userId, role: picked.role, totpVerified: true }
      : { totpVerified: true };
    next();
  });
  app.use('/', scheduleRouter);
  return app;
}

async function startServer(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function seedDataset(): Promise<SeedIds> {
  const suffix = uniqueSuffix();

  const normalUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `${suffix}-normal`,
        passwordHash: 'not-a-real-hash',
        role: 'NORMAL',
        displayName: 'ClientNotes Normal User',
      },
    }),
  );
  const pmUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `${suffix}-pm`,
        passwordHash: 'not-a-real-hash',
        role: 'PM',
        displayName: 'ClientNotes PM User',
      },
    }),
  );
  const adminUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `${suffix}-admin`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        displayName: 'ClientNotes Admin User',
      },
    }),
  );

  const client = await withDbRetry(() =>
    prisma.client.create({
      data: { name: `ClientNotes Client ${suffix}`, color: '#abcdef' },
    }),
  );

  // Schedule-domain fixtures, tied to this suite by unique markers. They exist
  // ONLY so case 8 can prove the notes write leaves them untouched. The
  // Assignment references the seeded client so an "incidental" client-scoped
  // write would be caught.
  const teamMember = await withDbRetry(() =>
    prisma.teamMember.create({
      data: {
        displayName: `${suffix}-tm`,
        status: 'active',
        isBacklog: true,
      },
    }),
  );
  const assignment = await withDbRetry(() =>
    prisma.assignment.create({
      data: {
        teamMemberId: teamMember.id,
        projectName: `${suffix}-proj`,
        projectColor: '#abcdef',
        status: 'placeholder',
        weekStart: new Date('2026-06-01T00:00:00.000Z'),
        clientId: client.id,
      },
    }),
  );
  const absence = await withDbRetry(() =>
    prisma.absence.create({
      data: {
        teamMemberId: teamMember.id,
        date: new Date('2026-06-02T00:00:00.000Z'),
        type: 'vacation',
        reason: `${suffix}-absence`,
      },
    }),
  );
  const holiday = await withDbRetry(() =>
    prisma.holiday.create({
      data: { name: `${suffix}-holiday`, month: 1, day: 2 },
    }),
  );

  return {
    normalUserId: normalUser.id,
    pmUserId: pmUser.id,
    adminUserId: adminUser.id,
    clientId: client.id,
    teamMemberId: teamMember.id,
    assignmentId: assignment.id,
    absenceId: absence.id,
    holidayId: holiday.id,
    marker: suffix,
  };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // Reverse FK order. Assignment/Absence reference TeamMember (and Assignment
  // references Client via SetNull); delete children first. Audit rows are
  // intentionally NOT deleted (append-only hash chain).
  await withDbRetry(() =>
    prisma.absence.deleteMany({ where: { id: ids.absenceId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.assignment.deleteMany({ where: { id: ids.assignmentId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.holiday.deleteMany({ where: { id: ids.holidayId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.teamMember.deleteMany({ where: { id: ids.teamMemberId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.client.deleteMany({ where: { id: ids.clientId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.user.deleteMany({
      where: { id: { in: [ids.normalUserId, ids.pmUserId, ids.adminUserId] } },
    }),
  ).catch(() => undefined);
}

describe('client notes access (Phase 01)', () => {
  let ids: SeedIds | null = null;
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    ids = await seedDataset();
    const sessions = {
      normal: { userId: ids.normalUserId, role: 'NORMAL' },
      pm: { userId: ids.pmUserId, role: 'PM' },
      admin: { userId: ids.adminUserId, role: 'ADMIN' },
    };
    const started = await startServer(buildApp(sessions));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
    server = null;
    await teardownDataset(ids);
    ids = null;
  });

  // (1) GET as NORMAL → 200 with the thin shape
  it('(1) lets a NORMAL user read client notes → 200 with the thin shape', async () => {
    const res = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      headers: { 'x-test-user': 'normal' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['notes', 'notesUpdatedAt', 'notesUpdatedBy']);
    expect(body.notes).toBe('');
    expect(body.notesUpdatedAt).toBeNull();
    expect(body.notesUpdatedBy).toBeNull();
  });

  // (2) GET as PM and ADMIN → 200 (all-roles read regression)
  it('(2) lets PM and ADMIN read client notes → 200/200', async () => {
    const pmRes = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      headers: { 'x-test-user': 'pm' },
    });
    expect(pmRes.status).toBe(200);
    const adminRes = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      headers: { 'x-test-user': 'admin' },
    });
    expect(adminRes.status).toBe(200);
  });

  // (3) GET for an unknown client id → 404
  it('(3) returns 404 reading notes for a non-existent client id', async () => {
    const res = await fetch(`${baseUrl}/clients/does-not-exist/notes`, {
      headers: { 'x-test-user': 'normal' },
    });
    expect(res.status).toBe(404);
  });

  // (4) PUT as NORMAL → 403 and the DB row is unchanged
  it('(4) blocks a NORMAL user from writing notes → 403 and leaves the row unchanged', async () => {
    const res = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'normal' },
      body: JSON.stringify({ notes: 'normal should not be able to write this' }),
    });
    expect(res.status).toBe(403);
    const row = await prisma.client.findUnique({ where: { id: ids!.clientId } });
    expect(row?.notes).toBe('');
    expect(row?.notesUpdatedAt).toBeNull();
    expect(row?.notesUpdatedBy).toBeNull();
  });

  // (5) PUT as PM → 200; attribution stamped with the raw PM user id
  it('(5) lets a PM write notes → 200 and stamps notesUpdatedBy with the raw user id', async () => {
    const res = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'pm' },
      body: JSON.stringify({ notes: '# Client note\nWritten by PM.' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { client: Record<string, unknown> };
    expect(body.client.notes).toBe('# Client note\nWritten by PM.');

    const row = await prisma.client.findUnique({ where: { id: ids!.clientId } });
    expect(row?.notes).toBe('# Client note\nWritten by PM.');
    expect(row?.notesUpdatedAt).toBeInstanceOf(Date);
    // Raw user id — NOT the username or display name.
    expect(row?.notesUpdatedBy).toBe(ids!.pmUserId);
    expect(row?.notesUpdatedBy).not.toBe('ClientNotes PM User');
  });

  // (6) PUT as ADMIN → 200 (requireRole('PM') admits ADMIN)
  it('(6) lets an ADMIN write notes → 200 (requireRole(PM) admits ADMIN)', async () => {
    const res = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'admin' },
      body: JSON.stringify({ notes: 'Written by ADMIN.' }),
    });
    expect(res.status).toBe(200);
    const row = await prisma.client.findUnique({ where: { id: ids!.clientId } });
    expect(row?.notes).toBe('Written by ADMIN.');
    expect(row?.notesUpdatedBy).toBe(ids!.adminUserId);
  });

  // (7) exactly one AuditLog row per successful write, scoped by clientId marker
  it('(7) writes exactly one client.notes.update audit entry for the client', async () => {
    const res = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'pm' },
      body: JSON.stringify({ notes: 'Audited write.' }),
    });
    expect(res.status).toBe(200);

    const rows = await prisma.auditLog.findMany({
      where: { action: 'client.notes.update' },
    });
    const forThisClient = rows.filter((r) => {
      try {
        const details = JSON.parse(r.details) as { clientId?: string };
        return details.clientId === ids!.clientId;
      } catch {
        return false;
      }
    });
    expect(forThisClient).toHaveLength(1);
    expect(forThisClient[0].userId).toBe(ids!.pmUserId);
    const details = JSON.parse(forThisClient[0].details) as { clientId: string; clientName: string };
    expect(details.clientId).toBe(ids!.clientId);
    expect(details.clientName).toContain(ids!.marker);
  });

  // (8) schedule isolation: the write touches no Assignment/TeamMember/Absence/Holiday
  it('(8) does not mutate or insert any schedule-domain row tied to this fixture', async () => {
    const tmBefore = await prisma.teamMember.findUnique({ where: { id: ids!.teamMemberId } });
    const asgBefore = await prisma.assignment.findUnique({ where: { id: ids!.assignmentId } });
    const absBefore = await prisma.absence.findUnique({ where: { id: ids!.absenceId } });
    const holBefore = await prisma.holiday.findUnique({ where: { id: ids!.holidayId } });

    // Fixture-scoped counts (immune to parallel workers seeding other rows).
    const tmCountBefore = await prisma.teamMember.count({ where: { displayName: `${ids!.marker}-tm` } });
    const asgCountBefore = await prisma.assignment.count({ where: { clientId: ids!.clientId } });
    const absCountBefore = await prisma.absence.count({ where: { teamMemberId: ids!.teamMemberId } });
    const holCountBefore = await prisma.holiday.count({ where: { name: `${ids!.marker}-holiday` } });

    const res = await fetch(`${baseUrl}/clients/${ids!.clientId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'pm' },
      body: JSON.stringify({ notes: 'Isolation probe write.' }),
    });
    expect(res.status).toBe(200);

    const tmAfter = await prisma.teamMember.findUnique({ where: { id: ids!.teamMemberId } });
    const asgAfter = await prisma.assignment.findUnique({ where: { id: ids!.assignmentId } });
    const absAfter = await prisma.absence.findUnique({ where: { id: ids!.absenceId } });
    const holAfter = await prisma.holiday.findUnique({ where: { id: ids!.holidayId } });

    // No UPDATE / DELETE of the seeded rows.
    expect(tmAfter).toEqual(tmBefore);
    expect(asgAfter).toEqual(asgBefore);
    expect(absAfter).toEqual(absBefore);
    expect(holAfter).toEqual(holBefore);

    // No INSERT under this fixture's markers.
    expect(await prisma.teamMember.count({ where: { displayName: `${ids!.marker}-tm` } })).toBe(tmCountBefore);
    expect(await prisma.assignment.count({ where: { clientId: ids!.clientId } })).toBe(asgCountBefore);
    expect(await prisma.absence.count({ where: { teamMemberId: ids!.teamMemberId } })).toBe(absCountBefore);
    expect(await prisma.holiday.count({ where: { name: `${ids!.marker}-holiday` } })).toBe(holCountBefore);
  });
});
