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
