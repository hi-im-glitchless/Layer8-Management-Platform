export interface AdminUser {
  id: string
  username: string
  isAdmin: boolean
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
  isAdmin?: boolean
}

export interface UpdateUserRequest {
  username?: string
  isAdmin?: boolean
  isActive?: boolean
}

export interface ResetPasswordRequest {
  password: string
}
