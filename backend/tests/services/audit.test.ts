import { describe, it, expect, beforeEach } from 'vitest';
import { logAuditEvent, verifyAuditChain, queryAuditLogs, exportAuditLogs } from '../../src/services/audit.js';
import { prisma } from '../../src/db/prisma.js';

describe('Audit Service', () => {
  beforeEach(async () => {
    // Clean audit logs before each test
    await prisma.auditLog.deleteMany({});
  });

  describe('logAuditEvent', () => {
    it('creates an audit log entry with all required fields', async () => {
      await logAuditEvent({
        userId: 'user-123',
        action: 'auth.login',
        details: { method: 'POST', path: '/api/auth/login' },
        ipAddress: '127.0.0.1',
      });

      const logs = await prisma.auditLog.findMany();
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe('user-123');
      expect(logs[0].action).toBe('auth.login');
      expect(logs[0].ipAddress).toBe('127.0.0.1');
      expect(logs[0].details).toBeTruthy();
      expect(logs[0].hash).toBeTruthy();
      expect(logs[0].previousHash).toBeTruthy();
    });

    it('first entry has previousHash of genesis hash', async () => {
      const genesisHash = '0'.repeat(64);

      await logAuditEvent({
        action: 'system.startup',
        details: {},
        ipAddress: '127.0.0.1',
      });

      const logs = await prisma.auditLog.findMany();
      expect(logs[0].previousHash).toBe(genesisHash);
    });

    it('second entry previousHash equals first entry hash', async () => {
      await logAuditEvent({
        action: 'auth.login',
        details: {},
        ipAddress: '127.0.0.1',
      });

      await logAuditEvent({
        action: 'auth.logout',
        details: {},
        ipAddress: '127.0.0.1',
      });

      const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
      expect(logs).toHaveLength(2);
      expect(logs[1].previousHash).toBe(logs[0].hash);
    });

    it('entry hash is a SHA-256 hex string (64 characters)', async () => {
      await logAuditEvent({
        action: 'auth.login',
        details: {},
        ipAddress: '127.0.0.1',
      });

      const logs = await prisma.auditLog.findMany();
      expect(logs[0].hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('details are stored as JSON string', async () => {
      await logAuditEvent({
        action: 'auth.login',
        details: { method: 'POST', statusCode: 200 },
        ipAddress: '127.0.0.1',
      });

      const logs = await prisma.auditLog.findMany();
      const parsed = JSON.parse(logs[0].details);
      expect(parsed.method).toBe('POST');
      expect(parsed.statusCode).toBe(200);
    });

    it('entry without userId (system event) creates record with null userId', async () => {
      await logAuditEvent({
        action: 'system.startup',
        details: {},
        ipAddress: '127.0.0.1',
      });

      const logs = await prisma.auditLog.findMany();
      expect(logs[0].userId).toBeNull();
    });
  });

  describe('verifyAuditChain', () => {
    it('returns valid: true for an untampered chain of 5+ entries', async () => {
      // Create 7 entries
      for (let i = 0; i < 7; i++) {
        await logAuditEvent({
          action: `action-${i}`,
          details: { index: i },
          ipAddress: '127.0.0.1',
        });
      }

      const result = await verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(7);
      expect(result.brokenAt).toBeUndefined();
    });

    it('returns valid: false when a middle entry hash is manually modified', async () => {
      // Create 5 entries
      for (let i = 0; i < 5; i++) {
        await logAuditEvent({
          action: `action-${i}`,
          details: { index: i },
          ipAddress: '127.0.0.1',
        });
      }

      // Tamper with the third entry (index 2)
      const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
      await prisma.auditLog.update({
        where: { id: logs[2].id },
        data: { hash: 'tampered'.repeat(9) }, // 63 chars, pad with 'x'
      });

      const result = await verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(logs[3].id); // The next entry will fail verification
    });

    it('returns valid: true, entries: 0 for an empty chain', async () => {
      const result = await verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(0);
    });
  });

  describe('queryAuditLogs', () => {
    beforeEach(async () => {
      // Create test data
      await logAuditEvent({
        userId: 'user-1',
        action: 'auth.login',
        details: { test: 'data1' },
        ipAddress: '192.168.1.1',
      });

      await logAuditEvent({
        userId: 'user-2',
        action: 'auth.logout',
        details: { test: 'data2' },
        ipAddress: '192.168.1.2',
      });

      await logAuditEvent({
        userId: 'user-1',
        action: 'auth.password.change',
        details: { test: 'data3' },
        ipAddress: '192.168.1.1',
      });
    });

    it('returns all logs when no filters', async () => {
      const result = await queryAuditLogs({});
      expect(result.logs.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('filters by userId', async () => {
      const result = await queryAuditLogs({ userId: 'user-1' });
      expect(result.logs.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.logs.every(log => log.userId === 'user-1')).toBe(true);
    });

    it('filters by action type (exact match)', async () => {
      const result = await queryAuditLogs({ action: 'auth.login' });
      expect(result.logs.length).toBe(1);
      expect(result.logs[0].action).toBe('auth.login');
    });

    it('filters by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const result = await queryAuditLogs({
        startDate: yesterday,
        endDate: tomorrow,
      });
      expect(result.logs.length).toBe(3);
    });

    it('combines filters (userId + action)', async () => {
      const result = await queryAuditLogs({
        userId: 'user-1',
        action: 'auth.login',
      });
      expect(result.logs.length).toBe(1);
      expect(result.logs[0].userId).toBe('user-1');
      expect(result.logs[0].action).toBe('auth.login');
    });

    it('returns results sorted by createdAt descending', async () => {
      const result = await queryAuditLogs({});
      // Most recent first
      expect(result.logs[0].action).toBe('auth.password.change');
      expect(result.logs[2].action).toBe('auth.login');
    });

    it('pagination works (page, pageSize)', async () => {
      const result = await queryAuditLogs({ page: 1, pageSize: 2 });
      expect(result.logs.length).toBe(2);
      expect(result.total).toBe(3);

      const result2 = await queryAuditLogs({ page: 2, pageSize: 2 });
      expect(result2.logs.length).toBe(1);
      expect(result2.total).toBe(3);
    });

    it('returns total count for pagination UI', async () => {
      const result = await queryAuditLogs({ pageSize: 1 });
      expect(result.total).toBe(3);
      expect(result.logs.length).toBe(1);
    });
  });

  describe('exportAuditLogs', () => {
    beforeEach(async () => {
      // Create test user first
      await prisma.user.create({
        data: {
          id: 'user-export-1',
          username: 'testuser',
          passwordHash: 'hash',
        },
      });

      await logAuditEvent({
        userId: 'user-export-1',
        action: 'auth.login',
        details: { method: 'POST' },
        ipAddress: '10.0.0.1',
      });
    });

    it('returns JSON array of all matching logs', async () => {
      const result = await exportAuditLogs({});
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('each log includes all required fields', async () => {
      const result = await exportAuditLogs({});
      const log = result[0];

      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('userId');
      expect(log).toHaveProperty('username');
      expect(log).toHaveProperty('action');
      expect(log).toHaveProperty('details');
      expect(log).toHaveProperty('ipAddress');
      expect(log).toHaveProperty('createdAt');
      expect(log).toHaveProperty('hash');

      expect(log.username).toBe('testuser');
      expect(log.action).toBe('auth.login');
      expect(typeof log.details).toBe('object'); // Parsed JSON
      expect(log.details.method).toBe('POST');
    });

    it('filters same as queryAuditLogs', async () => {
      await logAuditEvent({
        userId: 'user-export-1',
        action: 'auth.logout',
        details: {},
        ipAddress: '10.0.0.1',
      });

      const result = await exportAuditLogs({ action: 'auth.login' });
      expect(result.length).toBe(1);
      expect(result[0].action).toBe('auth.login');
    });
  });

  describe('concurrent writes', () => {
    it('submits 10 audit events simultaneously and maintains chain integrity', async () => {
      // Submit 10 events concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        logAuditEvent({
          action: `concurrent-${i}`,
          details: { index: i },
          ipAddress: '127.0.0.1',
        })
      );

      await Promise.all(promises);

      // Verify all 10 were created
      const logs = await prisma.auditLog.findMany();
      expect(logs).toHaveLength(10);

      // Verify chain is still valid
      const result = await verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(10);

      // Verify no duplicate previousHash values (except genesis for first entry)
      const previousHashes = logs.map(log => log.previousHash);
      const nonGenesisPrevHashes = previousHashes.filter(h => h !== '0'.repeat(64));
      const uniquePrevHashes = new Set(nonGenesisPrevHashes);
      expect(uniquePrevHashes.size).toBe(nonGenesisPrevHashes.length);
    });
  });
});
