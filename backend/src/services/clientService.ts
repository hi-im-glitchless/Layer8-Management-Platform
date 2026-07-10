/**
 * clientService — thin wrappers around prisma.client.
 *
 * SCHEDULE-ISOLATION INVARIANT: the client-notes functions below are scoped to
 * the Client row's `notes` / `notesUpdatedAt` / `notesUpdatedBy` columns only and
 * MUST NEVER read or write Assignment / TeamMember / Absence / Holiday. Client
 * carries only inbound schedule relations (Assignment.clientId → Client), so a
 * plain `prisma.client.update` scoped to the notes columns cannot cascade into
 * the schedule domain. Keep it that way.
 */
import { prisma } from '@/db/prisma.js';
import { Prisma } from '@prisma/client';

/**
 * List all clients ordered by name ascending.
 */
export async function listClients() {
  return prisma.client.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * Get a single client by ID.
 */
export async function getClientById(id: string) {
  return prisma.client.findUnique({ where: { id } });
}

/**
 * Create a new client. Throws descriptive error on duplicate name.
 */
export async function createClient(name: string, color: string) {
  try {
    return await prisma.client.create({
      data: { name, color },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new Error(`A client with the name "${name}" already exists`);
    }
    throw error;
  }
}

/**
 * Update a client by ID. Throws descriptive error on duplicate name.
 */
export async function updateClient(
  id: string,
  data: { name?: string; color?: string }
) {
  try {
    return await prisma.client.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new Error(`A client with the name "${data.name}" already exists`);
    }
    throw error;
  }
}

/**
 * Delete a client by ID. Assignments referencing this client get clientId set to null
 * via the onDelete: SetNull relation.
 */
export async function deleteClient(id: string) {
  return prisma.client.delete({ where: { id } });
}

/**
 * Read a client's notes blob plus attribution. Returns the thin shape
 * `{ notes, notesUpdatedAt, notesUpdatedBy }`, or `null` when the client does
 * not exist (the route maps null → 404). Scoped to the notes columns only.
 */
export async function getClientNotes(id: string) {
  return prisma.client.findUnique({
    where: { id },
    select: { notes: true, notesUpdatedAt: true, notesUpdatedBy: true },
  });
}

/**
 * Last-write-wins update of a client's notes blob. Stamps `notesUpdatedAt` to
 * `now()` and `notesUpdatedBy` to the editing user's raw id. Mirrors
 * boardNotesService.updateNotes. References no other Prisma model; audit logging
 * and IP extraction are the route's responsibility, not this service's.
 */
export async function updateClientNotes(
  id: string,
  notes: string,
  editorUserId: string
) {
  return prisma.client.update({
    where: { id },
    data: {
      notes,
      notesUpdatedAt: new Date(),
      notesUpdatedBy: editorUserId,
    },
    select: { notes: true, notesUpdatedAt: true, notesUpdatedBy: true },
  });
}
