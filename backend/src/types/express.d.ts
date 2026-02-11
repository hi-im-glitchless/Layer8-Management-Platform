import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    username: string;
    isAdmin: boolean;
    totpVerified: boolean;
    pendingTOTPSecret?: string;
    awaitingTOTP?: boolean;
    mustResetPassword?: boolean;
    createdAt?: number;
    lastActivity?: number;
    ipAddress?: string | null;
  }
}
