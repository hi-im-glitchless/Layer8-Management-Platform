import { apiClient } from '@/lib/api'
import type {
  AdminUser,
  ActiveSession,
  CreateUserRequest,
  UpdateUserRequest,
} from './types'

/**
 * User management API
 */
export const adminApi = {
  // User CRUD
  async getUsers() {
    return apiClient<{ users: AdminUser[] }>('/api/users')
  },

  async createUser(data: CreateUserRequest) {
    return apiClient<AdminUser>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateUser(id: string, data: UpdateUserRequest) {
    return apiClient<AdminUser>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async resetPassword(id: string, password: string) {
    return apiClient<{ success: boolean }>(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  },

  async resetTOTP(id: string) {
    return apiClient<{ success: boolean }>(`/api/users/${id}/reset-totp`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  async deleteUser(id: string) {
    return apiClient<{ success: boolean }>(`/api/users/${id}`, {
      method: 'DELETE',
    })
  },

  // Session management
  async getSessions() {
    return apiClient<{ sessions: ActiveSession[] }>('/api/admin/sessions')
  },

  async terminateSession(sessionId: string) {
    return apiClient<{ success: boolean }>(`/api/admin/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  },

  async cleanupSessions() {
    return apiClient<{
      sessionsCleared: number
      devicesCleared: number
    }>('/api/admin/sessions/cleanup', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
}
