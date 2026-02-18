import type { Role } from '@/lib/rbac'

export interface AdminUser {
  id: string
  username: string
  role: Role
  isActive: boolean
  totpEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ActiveSession {
  sessionId: string
  userId: string
  username: string
  ipAddress: string | null
  lastActivity: string
  createdAt: string
}

export interface CreateUserRequest {
  username: string
  password: string
  role?: Role
}

export interface UpdateUserRequest {
  username?: string
  role?: Role
  isActive?: boolean
}

export interface ResetPasswordRequest {
  password: string
}
