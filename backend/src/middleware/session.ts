import { Request, Response, NextFunction } from 'express';

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const ABSOLUTE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Session validation middleware — checks idle timeout and absolute expiry.
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

  // Absolute expiry: 24 hours from session creation
  // Sessions without createdAt are treated as expired (safe default)
  if (!sess.createdAt || now - sess.createdAt > ABSOLUTE_EXPIRY_MS) {
    return destroySession(req, res, 'Session expired');
  }

  // Idle timeout: 8 hours since last activity
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
