import { Request, Response, NextFunction } from 'express';
import { logAuditEvent } from '../services/audit.js';

/**
 * Fire-and-forget audit log for denied access attempts
 */
function logAccessDenied(req: Request, reason: string, statusCode: number) {
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';

  logAuditEvent({
    userId: req.session.userId ?? null,
    action: 'access.denied',
    ipAddress,
    details: {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      reason,
    },
  }).catch((err) => {
    console.error('[auth middleware] Failed to log access denied event:', err);
  });
}

/**
 * Middleware to require authentication
 * Checks that user is logged in and has verified TOTP (if enabled)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    logAccessDenied(req, 'Not authenticated', 401);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check if user needs to verify TOTP
  if (req.session.awaitingTOTP) {
    logAccessDenied(req, 'TOTP verification required', 401);
    return res.status(401).json({ error: 'TOTP verification required' });
  }

  // For users with TOTP enabled, ensure it's been verified in this session
  // (totpVerified is set after successful TOTP or trusted device validation)
  if (!req.session.totpVerified) {
    logAccessDenied(req, 'TOTP verification required', 401);
    return res.status(401).json({ error: 'TOTP verification required' });
  }

  next();
}

const ROLE_HIERARCHY: Record<string, number> = {
  NORMAL: 1,
  PM: 2,
  ADMIN: 3,
};

/**
 * Middleware factory for role-based access control
 * Creates middleware that requires the user to have at least the specified role
 */
export function requireRole(minimumRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.totpVerified) {
      logAccessDenied(req, 'Not authenticated', 401);
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userLevel = ROLE_HIERARCHY[req.session.role ?? ''] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? Infinity;

    if (userLevel < requiredLevel) {
      logAccessDenied(req, `Insufficient role: has ${req.session.role ?? 'none'}, needs ${minimumRole}`, 403);
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

/** @deprecated Use requireRole('ADMIN') instead */
export const requireAdmin = requireRole('ADMIN');

/**
 * Middleware to require pending TOTP state
 * Used for /login/totp endpoint - user must have passed password check but not TOTP yet
 */
export function requirePendingTOTP(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || !req.session.awaitingTOTP) {
    return res.status(401).json({ error: 'Not authenticated or TOTP not required' });
  }

  next();
}
