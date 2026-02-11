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
 * Invalidates auth query on success
 */
export function useLogin() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.login(username, password),
    onSuccess: () => {
      // Invalidate and refetch auth query
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
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
 * Invalidates auth query and navigates to login on success
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Clear auth cache
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });

      // Navigate to login
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
 * Hook for TOTP verification
 */
export function useVerifyTOTP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, rememberDevice }: { code: string; rememberDevice?: boolean }) =>
      authApi.verifyTOTP(code, rememberDevice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

/**
 * Hook for TOTP setup
 */
export function useSetupTOTP() {
  return useMutation({
    mutationFn: authApi.setupTOTP,
  });
}

/**
 * Hook for TOTP setup verification
 */
export function useVerifyTOTPSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) => authApi.verifyTOTPSetup(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

/**
 * Hook for password change
 */
export function useChangePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ newPassword, currentPassword }: { newPassword: string; currentPassword?: string }) =>
      authApi.changePassword(newPassword, currentPassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}
