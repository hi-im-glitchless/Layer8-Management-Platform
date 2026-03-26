import { Request, Response, NextFunction } from 'express';

const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours of inactivity

/**
 * Session validation middleware — checks idle timeout.
 * Uses rolling sessions: the cookie and idle timer refresh on every request,
 * so active users stay logged in indefinitely. Only logs out after 24h of
 * zero activity.
 * Must run BEFORE the activity tracker that updates lastActivity.
 * Skips unauthenticated requests (no userId in session).
 */
export function validateSession(req: Request, res: Response, next: NextFunction) {
  const sess = req.session as any;

  // Skip if not authenticated
  if (!sess?.userId) {
    return next();
  }

  const now = Date.now();

  // Idle timeout: 24 hours since last activity
  // Sessions without lastActivity are treated as expired (safe default)
  if (!sess.lastActivity || now - sess.lastActivity > IDLE_TIMEOUT_MS) {
    return destroySession(req, res, 'Session expired due to inactivity');
  }

  next();
}

function destroySession(req: Request, res: Response, message: string) {
  req.session.destroy((err) => {
    if (err) {
      console.error('[session validation] Error destroying session:', err);
    }
    res.clearCookie('connect.sid');
    return res.status(401).json({ error: message });
  });
}
