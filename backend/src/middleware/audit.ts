import { Request, Response, NextFunction } from 'express';
import { logAuditEvent } from '../services/audit.js';

/**
 * Sanitizes request body by removing sensitive fields
 * Never log passwords, TOTP codes, or tokens
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields = [
    'password',
    'currentPassword',
    'newPassword',
    'code',
    'token',
    'totpCode',
    'secret',
    'totpSecret',
  ];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Factory function that creates audit-logging middleware
 * Logs the action after the response is sent (fire and forget)
 */
export function auditMiddleware(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Call next() first to let the request execute
    next();

    // Log the audit event after the response is sent
    res.on('finish', async () => {
      try {
        // Extract userId from session (null for unauthenticated requests)
        const userId = (req.session as any)?.userId ?? null;

        // Get IP address (prefer X-Forwarded-For if behind proxy)
        const ipAddress =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.ip ||
          req.socket.remoteAddress ||
          'unknown';

        // Build details object with sanitized body
        const details = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          body: sanitizeBody(req.body),
        };

        // Log asynchronously (fire and forget)
        await logAuditEvent({
          userId,
          action,
          details,
          ipAddress,
        });
      } catch (error) {
        // Don't block the response on audit logging failure
        console.error('[audit middleware] Failed to log audit event:', error);
      }
    });
  };
}
