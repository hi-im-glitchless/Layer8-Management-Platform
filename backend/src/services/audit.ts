import { createHash } from 'crypto';
import { prisma } from '../db/prisma.js';

export interface AuditEvent {
  userId?: string | null;
  action: string;
  details: Record<string, unknown>;
  ipAddress: string;
}

export interface AuditQueryFilter {
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface ExportedAuditLog {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  details: Record<string, unknown>;
  ipAddress: string;
  createdAt: Date;
  hash: string;
}

const GENESIS_HASH = '0'.repeat(64);

/**
 * Computes the hash for an audit entry using SHA-256
 */
function computeEntryHash(entryString: string, previousHash: string): string {
  return createHash('sha256')
    .update(previousHash + entryString)
    .digest('hex');
}

/**
 * Logs an audit event with hash-chain integrity
 * Uses transaction locking to prevent race conditions
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // Find the last entry to get its hash
      const lastEntry = await tx.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { hash: true },
      });

      const previousHash = lastEntry?.hash ?? GENESIS_HASH;

      // Create entry string for hashing
      const timestamp = new Date().toISOString();
      const entryString = JSON.stringify({
        userId: event.userId ?? null,
        action: event.action,
        details: event.details,
        ipAddress: event.ipAddress,
        timestamp,
      });

      // Compute hash
      const hash = computeEntryHash(entryString, previousHash);

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          userId: event.userId ?? null,
          action: event.action,
          details: JSON.stringify(event.details),
          ipAddress: event.ipAddress,
          previousHash,
          hash,
        },
      });
    },
    {
      isolationLevel: 'Serializable', // Prevent concurrent write issues
    }
  );
}

/**
 * Verifies the integrity of the entire audit chain
 * Returns valid: true if chain is intact, false with brokenAt ID if tampered
 */
export async function verifyAuditChain(): Promise<{
  valid: boolean;
  entries: number;
  brokenAt?: string;
}> {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
  });

  if (entries.length === 0) {
    return { valid: true, entries: 0 };
  }

  // Verify each entry starting from the second one
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPreviousHash = i === 0 ? GENESIS_HASH : entries[i - 1].hash;

    // Verify previousHash link
    if (entry.previousHash !== expectedPreviousHash) {
      return { valid: false, entries: entries.length, brokenAt: entry.id };
    }

    // Recompute hash and verify it matches
    const entryString = JSON.stringify({
      userId: entry.userId,
      action: entry.action,
      details: JSON.parse(entry.details),
      ipAddress: entry.ipAddress,
      timestamp: entry.createdAt.toISOString(),
    });

    const computedHash = computeEntryHash(entryString, entry.previousHash);

    if (computedHash !== entry.hash) {
      return { valid: false, entries: entries.length, brokenAt: entry.id };
    }
  }

  return { valid: true, entries: entries.length };
}

/**
 * Queries audit logs with filtering and pagination
 */
export async function queryAuditLogs(filter: AuditQueryFilter): Promise<{
  logs: Array<{
    id: string;
    userId: string | null;
    action: string;
    details: string;
    ipAddress: string;
    createdAt: Date;
    hash: string;
    previousHash: string;
    user: { username: string } | null;
  }>;
  total: number;
}> {
  const {
    userId,
    action,
    startDate,
    endDate,
    page = 1,
    pageSize = 50,
  } = filter;

  // Build where clause
  const where: any = {};

  if (userId) {
    where.userId = userId;
  }

  if (action) {
    where.action = action;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = startDate;
    }
    if (endDate) {
      where.createdAt.lte = endDate;
    }
  }

  // Execute query with pagination
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { username: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Exports audit logs as JSON array for compliance auditors
 * No pagination - returns all matching logs
 */
export async function exportAuditLogs(
  filter: Omit<AuditQueryFilter, 'page' | 'pageSize'>
): Promise<ExportedAuditLog[]> {
  const { userId, action, startDate, endDate } = filter;

  // Build where clause (same as queryAuditLogs)
  const where: any = {};

  if (userId) {
    where.userId = userId;
  }

  if (action) {
    where.action = action;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = startDate;
    }
    if (endDate) {
      where.createdAt.lte = endDate;
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { username: true },
      },
    },
  });

  // Parse details JSON and format for export
  return logs.map((log) => ({
    id: log.id,
    userId: log.userId,
    username: log.user?.username ?? null,
    action: log.action,
    details: JSON.parse(log.details),
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
    hash: log.hash,
  }));
}

/**
 * Purges all audit logs (admin only)
 * This deletes every entry so the chain restarts cleanly from genesis.
 * Returns the count of deleted entries.
 */
export async function purgeAllAuditLogs(): Promise<number> {
  const result = await prisma.auditLog.deleteMany();
  return result.count;
}
