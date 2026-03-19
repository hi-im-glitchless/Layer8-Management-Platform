import { apiClient, apiUpload } from '@/lib/api'
import type {
  TeamMember,
  Assignment,
  Absence,
  Holiday,
  ProjectColor,
  CreateAssignmentRequest,
  UpdateAssignmentRequest,
  CreateAbsenceRequest,
  CreateHolidayRequest,
  UpdateHolidayRequest,
} from './types'

export const scheduleApi = {
  // ── Team Members ───────────────────────────────────────────────

  async getTeamMembers() {
    return apiClient<{ teamMembers: TeamMember[] }>('/api/schedule/team-members')
  },

  async createTeamMember(userId: string) {
    return apiClient<TeamMember>('/api/schedule/team-members', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },

  async updateTeamMember(id: string, data: { displayOrder?: number; status?: string }) {
    return apiClient<TeamMember>(`/api/schedule/team-members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async archiveTeamMember(id: string) {
    return apiClient<{ success: boolean }>(`/api/schedule/team-members/${id}`, {
      method: 'DELETE',
    })
  },

  async reorderTeamMembers(orderedIds: string[]) {
    return apiClient<{ success: boolean }>('/api/schedule/team-members/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    })
  },

  async addBacklogMember() {
    return apiClient<{ member: TeamMember }>('/api/schedule/team-members/add-backlog', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  // ── Assignments ────────────────────────────────────────────────

  async getAssignments(params: { year: number; quarter?: number }) {
    const searchParams = new URLSearchParams({ year: String(params.year) })
    if (params.quarter) searchParams.set('quarter', String(params.quarter))
    return apiClient<{ assignments: Assignment[] }>(
      `/api/schedule/assignments?${searchParams.toString()}`
    )
  },

  async upsertAssignment(data: CreateAssignmentRequest) {
    return apiClient<Assignment>('/api/schedule/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateAssignment(id: string, data: UpdateAssignmentRequest) {
    return apiClient<Assignment>(`/api/schedule/assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async deleteAssignment(id: string) {
    return apiClient<{ success: boolean }>(`/api/schedule/assignments/${id}`, {
      method: 'DELETE',
    })
  },

  async swapAssignments(idA: string, idB: string) {
    return apiClient<{ success: boolean }>('/api/schedule/assignments/swap', {
      method: 'POST',
      body: JSON.stringify({ idA, idB }),
    })
  },

  async toggleLock(id: string) {
    return apiClient<Assignment>(`/api/schedule/assignments/${id}/lock`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  // ── Absences ───────────────────────────────────────────────────

  async getAbsences(params: { teamMemberId?: string; dateStart?: string; dateEnd?: string }) {
    const searchParams = new URLSearchParams()
    if (params.teamMemberId) searchParams.set('teamMemberId', params.teamMemberId)
    if (params.dateStart) searchParams.set('dateStart', params.dateStart)
    if (params.dateEnd) searchParams.set('dateEnd', params.dateEnd)
    const qs = searchParams.toString()
    return apiClient<{ absences: Absence[] }>(
      `/api/schedule/absences${qs ? `?${qs}` : ''}`
    )
  },

  async toggleAbsence(data: CreateAbsenceRequest) {
    return apiClient<{ absence: Absence | null; action: 'created' | 'deleted' }>(
      '/api/schedule/absences/toggle',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
  },

  // ── Holidays ───────────────────────────────────────────────────

  async getHolidays() {
    return apiClient<{ holidays: Holiday[] }>('/api/schedule/holidays')
  },

  async createHoliday(data: CreateHolidayRequest) {
    return apiClient<Holiday>('/api/schedule/holidays', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateHoliday(id: string, data: UpdateHolidayRequest) {
    return apiClient<Holiday>(`/api/schedule/holidays/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async deleteHoliday(id: string) {
    return apiClient<{ success: boolean }>(`/api/schedule/holidays/${id}`, {
      method: 'DELETE',
    })
  },

  // ── Project Colors ─────────────────────────────────────────────

  async searchProjectColors(query: string) {
    return apiClient<{ projectColors: ProjectColor[] }>(
      `/api/schedule/project-colors?search=${encodeURIComponent(query)}`
    )
  },

  // ── Excel Import ──────────────────────────────────────────────────

  async importExcel(file: File, year: number) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('year', String(year))
    return apiUpload<{
      imported: number
      skipped: number
      errors: { row: number; message: string }[]
      summary: {
        membersFound: number
        weeksFound: number
        totalParsed: number
      }
    }>('/api/schedule/import', formData)
  },
}
