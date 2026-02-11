/**
 * React hooks for auth state management using TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as authApi from './api';

const AUTH_QUERY_KEY = ['auth', 'me'];

/**
 * Hook to get current authenticated user
 * Returns cached user data with 5-minute stale time
 */
export function useAuth() {
  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: authApi.getMe,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on 401
    retryOnMount: false,
  });

  return {
    user: query.data,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data && !query.error,
    isAdmin: query.data?.isAdmin ?? false,
    refetch: query.refetch,
    error: query.error,
  };
}

/**
 * Hook for login mutation
 */
export function useLogin() {
  const mutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.login(username, password),
    // Don't invalidate auth here — login may return intermediate states
    // (requiresTOTP, requiresPasswordChange) before full authentication.
    // The caller refetches auth after the full flow completes.
  });

  return {
    login: mutation.mutate,
    loginAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
  };
}

/**
 * Hook for logout mutation
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      navigate('/login');
    },
  });

  return {
    logout: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook for TOTP verification (login flow)
 */
export function useVerifyTOTP() {
  return useMutation({
    mutationFn: ({ code, rememberDevice }: { code: string; rememberDevice?: boolean }) =>
      authApi.verifyTOTP(code, rememberDevice),
    // Caller refetches auth after full flow completes
  });
}

/**
 * Hook for TOTP setup (generates QR code)
 */
export function useSetupTOTP() {
  return useMutation({
    mutationFn: authApi.setupTOTP,
  });
}

/**
 * Hook for TOTP setup verification (enables TOTP on account)
 */
export function useVerifyTOTPSetup() {
  return useMutation({
    mutationFn: (code: string) => authApi.verifyTOTPSetup(code),
    // Caller refetches auth after full flow completes
  });
}

/**
 * Hook for password change
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({ newPassword, currentPassword }: { newPassword: string; currentPassword?: string }) =>
      authApi.changePassword(newPassword, currentPassword),
    // Caller refetches auth after full flow completes
  });
}
