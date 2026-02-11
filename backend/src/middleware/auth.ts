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

/**
 * Middleware to require admin privileges
 * First checks authentication, then checks admin status
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Check auth first
  if (!req.session.userId || !req.session.totpVerified) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check admin status
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

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
