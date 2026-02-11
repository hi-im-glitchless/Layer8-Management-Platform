/**
 * Auth types for API responses and user data
 */

export interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  totpEnabled: boolean;
}

export interface LoginResponse {
  success?: boolean;
  requiresTOTP?: boolean;
  requiresTOTPSetup?: boolean;
  requiresPasswordChange?: boolean;
  error?: string;
  message?: string;
}

export interface TOTPSetupResponse {
  qrCodeDataURL: string;
  message?: string;
}

export interface TOTPVerifyResponse {
  success: boolean;
  message?: string;
}

export interface PasswordChangeResponse {
  success: boolean;
  message?: string;
}

export interface LogoutResponse {
  success: boolean;
  message?: string;
}
