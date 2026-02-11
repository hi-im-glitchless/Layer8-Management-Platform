import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  getActiveSessions,
  terminateSession,
  cleanupExpiredSessions,
  cleanupExpiredDevices,
} from '../services/session.js';

const router = Router();

// All routes require admin
router.use(requireAdmin);

/**
 * GET /api/admin/sessions
 * List all active sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await getActiveSessions();
    res.json({ sessions });
  } catch (error) {
    console.error('[admin routes] Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * DELETE /api/admin/sessions/:sessionId
 * Terminate a specific session
 */
router.delete('/sessions/:sessionId', auditMiddleware('admin.session.terminate'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const currentSession = req.session as any;

    // Prevent self-termination
    if (req.sessionID === sessionId) {
      return res.status(400).json({ error: 'Cannot terminate your own session' });
    }

    const success = await terminateSession(sessionId);

    if (!success) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[admin routes] Error terminating session:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

/**
 * POST /api/admin/sessions/cleanup
 * Clean up expired sessions and trusted devices
 */
router.post('/sessions/cleanup', auditMiddleware('admin.session.cleanup'), async (req, res) => {
  try {
    const [sessionsCleared, devicesCleared] = await Promise.all([
      cleanupExpiredSessions(),
      cleanupExpiredDevices(),
    ]);

    res.json({
      sessionsCleared,
      devicesCleared,
    });
  } catch (error) {
    console.error('[admin routes] Error cleaning up sessions:', error);
    res.status(500).json({ error: 'Failed to cleanup sessions' });
  }
});

export default router;
