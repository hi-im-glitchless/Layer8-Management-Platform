import { Router } from 'express';
import { queryAuditLogs, exportAuditLogs, verifyAuditChain, purgeAllAuditLogs } from '../services/audit.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/audit
 * Query audit logs with filters and pagination
 * Admin: can see all logs, can filter by userId
 * Regular user: only sees own logs
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const session = req.session as any;
    const isAdmin = session.isAdmin === true;

    // Parse query parameters
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50;
    const action = req.query.action as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Build filter
    const filter: any = {
      page,
      pageSize,
      action,
      startDate,
      endDate,
    };

    // If admin and userId filter provided, use it. Otherwise filter to own logs for non-admin.
    if (isAdmin && req.query.userId) {
      filter.userId = req.query.userId as string;
    } else if (!isAdmin) {
      filter.userId = session.userId;
    }

    const result = await queryAuditLogs(filter);

    // Transform to match frontend AuditLog interface
    const logs = result.logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      username: log.user?.username ?? null,
      action: log.action,
      details: JSON.parse(log.details),
      ipAddress: log.ipAddress,
      userAgent: null, // Not tracked in current schema
      timestamp: log.createdAt.toISOString(),
      previousHash: log.previousHash,
      currentHash: log.hash,
    }));

    res.json({
      logs,
      total: result.total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('[audit routes] Error querying audit logs:', error);
    res.status(500).json({ error: 'Failed to query audit logs' });
  }
});

/**
 * GET /api/audit/export
 * Export audit logs as JSON for compliance auditors
 * Admin only
 */
router.get('/export', requireAdmin, async (req, res) => {
  try {
    // Parse query parameters (same as query but no pagination)
    const action = req.query.action as string | undefined;
    const userId = req.query.userId as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const logs = await exportAuditLogs({
      userId,
      action,
      startDate,
      endDate,
    });

    // Generate filename with current date
    const date = new Date().toISOString().split('T')[0];
    const filename = `audit-log-${date}.json`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(logs);
  } catch (error) {
    console.error('[audit routes] Error exporting audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

/**
 * GET /api/audit/verify
 * Verify the integrity of the audit chain
 * Admin only
 */
router.get('/verify', requireAdmin, async (req, res) => {
  try {
    const result = await verifyAuditChain();
    // Transform to match frontend VerifyChainResult interface
    res.json({
      valid: result.valid,
      totalEntries: result.entries,
      verifiedEntries: result.valid ? result.entries : 0,
      firstInvalidIndex: result.brokenAt ?? undefined,
    });
  } catch (error) {
    console.error('[audit routes] Error verifying audit chain:', error);
    res.status(500).json({ error: 'Failed to verify audit chain' });
  }
});

/**
 * DELETE /api/audit/purge
 * Purge all audit logs so the chain restarts from genesis
 * Admin only
 */
router.delete('/purge', requireAdmin, async (req, res) => {
  try {
    const deletedCount = await purgeAllAuditLogs();
    res.json({ purged: deletedCount });
  } catch (error) {
    console.error('[audit routes] Error purging audit logs:', error);
    res.status(500).json({ error: 'Failed to purge audit logs' });
  }
});

export default router;
