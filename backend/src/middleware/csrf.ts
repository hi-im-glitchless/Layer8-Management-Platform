import { doubleCsrf } from 'csrf-csrf';
import { Request } from 'express';

/**
 * CSRF protection using double-submit cookie pattern
 * Cookie name: __csrf
 * Header name: X-CSRF-Token
 */
const {
  generateCsrfToken, // Generates a new CSRF token
  doubleCsrfProtection, // Middleware to validate CSRF token
} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  getSessionIdentifier: (req: Request) => {
    // Return empty string for consistent behavior (double-submit pattern doesn't need session)
    return '';
  },
  cookieName: '__csrf',
  cookieOptions: {
    httpOnly: false, // Must be readable by frontend JS for double-submit pattern
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64, // Token size
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // Don't check CSRF on these methods
  getCsrfTokenFromRequest: (req: Request) => {
    // Check X-CSRF-Token header
    return req.headers['x-csrf-token'] as string;
  },
});

// Export middleware and token generator
export const csrfProtection = doubleCsrfProtection;
export { generateCsrfToken };
