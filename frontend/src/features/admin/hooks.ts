import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminApi } from './api'
import type { CreateUserRequest, UpdateUserRequest } from './types'

/**
 * User management hooks
 */
export function useUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.getUsers(),
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateUserRequest) => adminApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('User created successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create user')
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) =>
      adminApi.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('User updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update user')
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminApi.resetPassword(id, password),
    onSuccess: () => {
      toast.success('Password reset successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset password')
    },
  })
}

export function useResetTOTP() {
  return useMutation({
    mutationFn: (id: string) => adminApi.resetTOTP(id),
    onSuccess: () => {
      toast.success('MFA reset successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset MFA')
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('User deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete user')
    },
  })
}

/**
 * Session management hooks
 */
export function useSessions() {
  return useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => adminApi.getSessions(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })
}

export function useTerminateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => adminApi.terminateSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] })
      toast.success('Session terminated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to terminate session')
    },
  })
}

export function useCleanupSessions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => adminApi.cleanupSessions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] })
      toast.success(
        `Cleaned up ${data.sessionsCleared} sessions and ${data.devicesCleared} devices`
      )
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cleanup sessions')
    },
  })
}
