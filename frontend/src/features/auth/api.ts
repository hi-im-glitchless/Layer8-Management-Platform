/**
 * Auth API client functions
 */

import { apiClient } from '@/lib/api';
import type {
  User,
  LoginResponse,
  TOTPSetupResponse,
  TOTPVerifyResponse,
  PasswordChangeResponse,
  LogoutResponse,
} from './types';

/**
 * Initial login with username and password
 */
export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  return apiClient<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

/**
 * Verify TOTP code after password login
 */
export async function verifyTOTP(
  code: string,
  rememberDevice?: boolean
): Promise<TOTPVerifyResponse> {
  return apiClient<TOTPVerifyResponse>('/api/auth/login/totp', {
    method: 'POST',
    body: JSON.stringify({ code, rememberDevice }),
  });
}

/**
 * Generate TOTP secret and QR code for first-time setup
 */
export async function setupTOTP(): Promise<TOTPSetupResponse> {
  return apiClient<TOTPSetupResponse>('/api/auth/totp/setup', {
    method: 'POST',
  });
}

/**
 * Verify TOTP code during initial setup
 */
export async function verifyTOTPSetup(code: string): Promise<TOTPVerifyResponse> {
  return apiClient<TOTPVerifyResponse>('/api/auth/totp/verify-setup', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/**
 * Change user password
 */
export async function changePassword(
  newPassword: string,
  currentPassword?: string
): Promise<PasswordChangeResponse> {
  return apiClient<PasswordChangeResponse>('/api/auth/password/change', {
    method: 'POST',
    body: JSON.stringify({ newPassword, currentPassword }),
  });
}

/**
 * Logout and destroy session
 */
export async function logout(): Promise<LogoutResponse> {
  return apiClient<LogoutResponse>('/api/auth/logout', {
    method: 'POST',
  });
}

/**
 * Get current authenticated user
 */
export async function getMe(): Promise<User> {
  return apiClient<User>('/api/auth/me');
}
