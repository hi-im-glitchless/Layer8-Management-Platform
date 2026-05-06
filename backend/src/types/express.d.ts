import 'express-session';
import type { BoardCardContext } from '../middleware/boardAuth.js';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    username: string;
    role: string;
    totpVerified: boolean;
    pendingTOTPSecret?: string;
    awaitingTOTP?: boolean;
    mustResetPassword?: boolean;
    createdAt?: number;
    lastActivity?: number;
    ipAddress?: string | null;
  }
}

// Augment Express.Request with the optional `boardCard` snapshot attached by
// `requireCardAccess` (see backend/src/middleware/boardAuth.ts). The canonical
// shape lives in `BoardCardContext` exported from that middleware; this
// augmentation lets downstream handlers read `req.boardCard` without a per-call
// cast. Property remains optional because routes that do not pass through
// `requireCardAccess` will not have it set.
declare global {
  namespace Express {
    interface Request {
      boardCard?: BoardCardContext;
    }
  }
}
