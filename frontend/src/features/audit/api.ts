import { apiClient } from '@/lib/api'

export interface AuditLog {
  id: string
  userId: string | null
  username: string | null
  action: string
  details: Record<string, any>
  ipAddress: string | null
  userAgent: string | null
  timestamp: string
  previousHash: string | null
  currentHash: string
}

export interface AuditLogsResponse {
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
}

export interface AuditFilters {
  userId?: string
  action?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export interface VerifyChainResult {
  valid: boolean
  totalEntries: number
  verifiedEntries: number
  firstInvalidIndex?: number
}

export const auditApi = {
  async getAuditLogs(filters: AuditFilters = {}) {
    const params = new URLSearchParams()

    if (filters.userId) params.append('userId', filters.userId)
    if (filters.action) params.append('action', filters.action)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.pageSize) params.append('pageSize', filters.pageSize.toString())

    return apiClient<AuditLogsResponse>(`/api/audit?${params.toString()}`)
  },

  async exportAuditLogs(filters: AuditFilters = {}) {
    const params = new URLSearchParams()

    if (filters.userId) params.append('userId', filters.userId)
    if (filters.action) params.append('action', filters.action)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)

    // Use native fetch for blob response
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
    const response = await fetch(`${API_BASE_URL}/api/audit/export?${params.toString()}`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error('Failed to export audit logs')
    }

    // Trigger file download
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  },

  async verifyAuditChain() {
    return apiClient<VerifyChainResult>('/api/audit/verify')
  },

  async purgeAuditLogs() {
    return apiClient<{ purged: number }>('/api/audit/purge', {
      method: 'DELETE',
    })
  },
}
