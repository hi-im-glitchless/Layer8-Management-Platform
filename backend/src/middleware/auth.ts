import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to require authentication
 * Checks that user is logged in and has verified TOTP (if enabled)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check if user needs to verify TOTP
  if (req.session.awaitingTOTP) {
    return res.status(401).json({ error: 'TOTP verification required' });
  }

  // For users with TOTP enabled, ensure it's been verified in this session
  // (totpVerified is set after successful TOTP or trusted device validation)
  if (!req.session.totpVerified) {
    return res.status(401).json({ error: 'TOTP verification required' });
  }

  next();
}

const ROLE_HIERARCHY: Record<string, number> = {
  NORMAL: 1,
  PM: 2,
  MANAGER: 3,
  ADMIN: 4,
};

/**
 * Middleware factory for role-based access control
 * Creates middleware that requires the user to have at least the specified role
 */
export function requireRole(minimumRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.totpVerified) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userLevel = ROLE_HIERARCHY[req.session.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? Infinity;

    if (userLevel < requiredLevel) {
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
