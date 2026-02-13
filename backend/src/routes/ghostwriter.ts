import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth.js';
import { fetchReportData, checkGhostwriterHealth } from '@/services/ghostwriter.js';
import { mapReportToTemplateContext } from '@/services/ghostwriterMapper.js';
import { logAuditEvent } from '@/services/audit.js';

const router = Router();

// Validation: report ID must be a positive integer
const reportIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer').transform(Number),
});

/**
 * GET /api/ghostwriter/report/:id
 * Fetch report data from Ghostwriter and return both raw and mapped context.
 */
router.get('/report/:id', requireAuth, async (req, res) => {
  try {
    const validation = reportIdSchema.safeParse(req.params);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid report ID',
        details: validation.error.issues,
      });
    }

    const { id } = validation.data;
    const sess = req.session as any;

    const report = await fetchReportData(id);
    const templateContext = mapReportToTemplateContext(report);

    // Audit log the GW data fetch
    await logAuditEvent({
      userId: sess.userId,
      action: 'ghostwriter_fetch',
      details: {
        reportId: id,
        reportTitle: report.title,
        findingCount: report.findings.length,
      },
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    });

    res.json({ report, templateContext });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ghostwriter routes] Report fetch error:', msg);

    if (msg.includes('not configured')) {
      return res.status(503).json({ error: 'Ghostwriter not configured' });
    }
    if (msg.includes('not found')) {
      return res.status(404).json({ error: msg });
    }
    if (msg.includes('authentication failed')) {
      return res.status(401).json({ error: 'Ghostwriter authentication failed' });
    }
    if (msg.includes('unavailable')) {
      return res.status(503).json({ error: 'Ghostwriter service unavailable' });
    }

    res.status(500).json({ error: 'Failed to fetch Ghostwriter report', details: msg });
  }
});

/**
 * GET /api/ghostwriter/health
 * Check Ghostwriter API connectivity and authentication status.
 */
router.get('/health', requireAuth, async (req, res) => {
  try {
    const health = await checkGhostwriterHealth();
    res.json(health);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ghostwriter routes] Health check error:', msg);

    if (msg.includes('not configured')) {
      return res.status(503).json({ available: false, error: 'Ghostwriter not configured' });
    }

    res.status(500).json({
      available: false,
      error: 'Health check failed',
      details: msg,
    });
  }
});

export default router;
