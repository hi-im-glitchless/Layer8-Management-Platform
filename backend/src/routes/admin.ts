import { Router } from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { requireAdmin } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  getActiveSessions,
  terminateSession,
  cleanupExpiredSessions,
  cleanupExpiredDevices,
} from '../services/session.js';
import { getLlmSettings, updateLlmSettings } from '../services/settings.js';
import { createLLMClient } from '../services/llm/client.js';
import { logAuditEvent } from '../services/audit.js';
import { config } from '../config.js';

// Tracked CLIProxyAPI child process (survives across requests, not across backend restarts)
let cliproxyProcess: ChildProcess | null = null;

function isCliproxyTrackedAndRunning(): boolean {
  if (!cliproxyProcess) return false;
  // exitCode is null while the process is still running
  if (cliproxyProcess.exitCode !== null) {
    cliproxyProcess = null;
    return false;
  }
  return true;
}

async function pollHealthCheck(baseUrl: string, attempts = 15, intervalMs = 1000): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${config.CLIPROXY_API_KEY}` },
      });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

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

/**
 * GET /api/admin/llm-settings
 * Returns current LLM settings (API key masked)
 */
router.get('/llm-settings', async (req, res) => {
  try {
    const settings = await getLlmSettings();

    // Mask API key - show only last 4 chars
    let maskedApiKey: string | null = null;
    if (settings.anthropicApiKey) {
      const key = settings.anthropicApiKey;
      maskedApiKey = key.length > 4
        ? '****' + key.slice(-4)
        : '****';
    }

    res.json({
      cliproxyBaseUrl: settings.cliproxyBaseUrl,
      anthropicApiKey: maskedApiKey,
      defaultModel: settings.defaultModel,
      templateAdapterModel: settings.templateAdapterModel,
      executiveReportModel: settings.executiveReportModel,
      fallbackEnabled: settings.fallbackEnabled,
    });
  } catch (error) {
    console.error('[admin routes] Error getting LLM settings:', error);
    res.status(500).json({ error: 'Failed to get LLM settings' });
  }
});

/**
 * PUT /api/admin/llm-settings
 * Updates LLM settings
 */
router.put('/llm-settings', async (req, res) => {
  try {
    const { defaultModel, templateAdapterModel, executiveReportModel, anthropicApiKey, fallbackEnabled } = req.body;

    // Validate types
    const updateData: Record<string, any> = {};

    if (defaultModel !== undefined) {
      if (typeof defaultModel !== 'string' || defaultModel.trim().length === 0) {
        return res.status(400).json({ error: 'defaultModel must be a non-empty string' });
      }
      updateData.defaultModel = defaultModel.trim();
    }

    if (templateAdapterModel !== undefined) {
      if (typeof templateAdapterModel !== 'string' || templateAdapterModel.trim().length === 0) {
        return res.status(400).json({ error: 'templateAdapterModel must be a non-empty string' });
      }
      updateData.templateAdapterModel = templateAdapterModel.trim();
    }

    if (executiveReportModel !== undefined) {
      if (typeof executiveReportModel !== 'string' || executiveReportModel.trim().length === 0) {
        return res.status(400).json({ error: 'executiveReportModel must be a non-empty string' });
      }
      updateData.executiveReportModel = executiveReportModel.trim();
    }

    if (anthropicApiKey !== undefined) {
      if (anthropicApiKey !== null && typeof anthropicApiKey !== 'string') {
        return res.status(400).json({ error: 'anthropicApiKey must be a string or null' });
      }
      updateData.anthropicApiKey = anthropicApiKey;
    }

    if (fallbackEnabled !== undefined) {
      if (typeof fallbackEnabled !== 'boolean') {
        return res.status(400).json({ error: 'fallbackEnabled must be a boolean' });
      }
      updateData.fallbackEnabled = fallbackEnabled;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updated = await updateLlmSettings(updateData);

    // Log settings change to audit trail
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    await logAuditEvent({
      userId: req.session.userId!,
      action: 'admin.llm.settings.update',
      ipAddress,
      details: { fieldsUpdated: Object.keys(updateData) },
    });

    // Return with masked API key
    let maskedApiKey: string | null = null;
    if (updated.anthropicApiKey) {
      const key = updated.anthropicApiKey;
      maskedApiKey = key.length > 4 ? '****' + key.slice(-4) : '****';
    }

    res.json({
      cliproxyBaseUrl: updated.cliproxyBaseUrl,
      anthropicApiKey: maskedApiKey,
      defaultModel: updated.defaultModel,
      templateAdapterModel: updated.templateAdapterModel,
      executiveReportModel: updated.executiveReportModel,
      fallbackEnabled: updated.fallbackEnabled,
    });
  } catch (error) {
    console.error('[admin routes] Error updating LLM settings:', error);
    res.status(500).json({ error: 'Failed to update LLM settings' });
  }
});

/**
 * GET /api/admin/llm-status
 * Returns provider status
 */
router.get('/llm-status', async (req, res) => {
  try {
    const client = await createLLMClient();
    const statuses = await client.checkStatus();
    res.json({ providers: statuses });
  } catch (error) {
    console.error('[admin routes] Error checking LLM status:', error);
    res.status(500).json({ error: 'Failed to check LLM status' });
  }
});

/**
 * POST /api/admin/llm-start-cliproxy
 * Spawns the CLIProxyAPI process and polls for readiness
 */
router.post('/llm-start-cliproxy', async (req, res) => {
  try {
    // Check if CLIProxyAPI is already running (either tracked or external)
    const client = await createLLMClient();
    const statuses = await client.checkStatus();
    const cliproxy = statuses.find((s) => s.provider === 'cliproxy');

    if (cliproxy?.available) {
      return res.json({ success: true, message: 'CLIProxyAPI is already running' });
    }

    // Already tracked and running (but health check above failed -- unlikely but guard)
    if (isCliproxyTrackedAndRunning()) {
      return res.json({ success: false, message: 'CLIProxyAPI process is tracked but not yet responding. Try refreshing status.' });
    }

    // Spawn the binary
    const binPath = config.CLIPROXY_BIN_PATH;
    const cwd = path.dirname(binPath);

    const child = spawn(binPath, [], {
      cwd,
      stdio: 'ignore',
      detached: true,
    });

    // Allow the parent to exit without waiting for this child
    child.unref();

    child.on('error', (err) => {
      console.error('[admin routes] CLIProxyAPI spawn error:', err.message);
      cliproxyProcess = null;
    });

    cliproxyProcess = child;

    // Poll health check to confirm it started
    const settings = await getLlmSettings();
    const baseUrl = settings.cliproxyBaseUrl || 'http://localhost:8317';
    const healthy = await pollHealthCheck(baseUrl);

    if (healthy) {
      res.json({ success: true, message: 'CLIProxyAPI started successfully' });
    } else {
      res.json({ success: false, message: 'CLIProxyAPI process spawned but did not respond to health checks. Check the binary path and config.yaml.' });
    }
  } catch (error) {
    console.error('[admin routes] Error starting CLIProxyAPI:', error);
    res.status(500).json({ error: 'Failed to start CLIProxyAPI' });
  }
});

/**
 * POST /api/admin/llm-stop-cliproxy
 * Kills the CLIProxyAPI process (tracked or discovered via pgrep)
 */
router.post('/llm-stop-cliproxy', async (req, res) => {
  try {
    // Try tracked process first
    if (isCliproxyTrackedAndRunning()) {
      try {
        process.kill(-cliproxyProcess!.pid!, 'SIGTERM');
      } catch {
        cliproxyProcess!.kill('SIGTERM');
      }
      cliproxyProcess = null;
      return res.json({ success: true, message: 'CLIProxyAPI process stopped' });
    }

    // No tracked process — find it by scanning for the binary name
    const binName = path.basename(config.CLIPROXY_BIN_PATH);
    const { execSync } = await import('node:child_process');
    try {
      const pids = execSync(`pgrep -f "${binName}"`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        process.kill(Number(pid), 'SIGTERM');
      }
      cliproxyProcess = null;
      res.json({ success: true, message: `CLIProxyAPI stopped (killed ${pids.length} process${pids.length > 1 ? 'es' : ''})` });
    } catch {
      res.json({ success: false, message: 'No CLIProxyAPI process found to stop' });
    }
  } catch (error) {
    console.error('[admin routes] Error stopping CLIProxyAPI:', error);
    res.status(500).json({ error: 'Failed to stop CLIProxyAPI' });
  }
});

export default router;
