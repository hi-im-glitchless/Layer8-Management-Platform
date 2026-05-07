import { ApiError, apiClient, apiUpload } from '@/lib/api'
import type {
  BoardCard,
  BoardComment,
  BoardFile,
  CreateCardPayload,
  UpdateCardPayload,
  CardFilters,
} from './types'

export const boardApi = {
  // ── Cards ──────────────────────────────────────────────────────────

  async getCards(filters?: CardFilters) {
    const params = new URLSearchParams()
    if (filters?.stage) params.set('stage', filters.stage)
    if (filters?.assignmentId) params.set('assignmentId', filters.assignmentId)
    const query = params.toString()
    return apiClient<{ cards: BoardCard[] }>(`/api/board/cards${query ? `?${query}` : ''}`)
  },

  async getCard(id: string) {
    return apiClient<{ card: BoardCard }>(`/api/board/cards/${id}`)
  },

  async createCard(data: CreateCardPayload) {
    return apiClient<{ card: BoardCard }>('/api/board/cards', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateCard(id: string, data: UpdateCardPayload) {
    return apiClient<{ card: BoardCard }>(`/api/board/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteCard(id: string) {
    return apiClient<{ success: boolean }>(`/api/board/cards/${id}`, {
      method: 'DELETE',
    })
  },

  // ── Comments ───────────────────────────────────────────────────────

  async getComments(cardId: string) {
    return apiClient<{ comments: BoardComment[] }>(`/api/board/cards/${cardId}/comments`)
  },

  async addComment(cardId: string, body: string, mentions: string[] = []) {
    return apiClient<{ comment: BoardComment }>(`/api/board/cards/${cardId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, mentions }),
    })
  },

  async editComment(cardId: string, commentId: string, body: string) {
    return apiClient<{ comment: BoardComment }>(
      `/api/board/cards/${cardId}/comments/${commentId}`,
      { method: 'PATCH', body: JSON.stringify({ body }) },
    )
  },

  async softDeleteComment(cardId: string, commentId: string) {
    return apiClient<{ success: boolean }>(`/api/board/cards/${cardId}/comments/${commentId}`, {
      method: 'DELETE',
    })
  },

  /** @deprecated Phase 23 soft-deletes comments. Kept as alias of softDeleteComment. */
  async deleteComment(cardId: string, commentId: string) {
    return apiClient<{ success: boolean }>(`/api/board/cards/${cardId}/comments/${commentId}`, {
      method: 'DELETE',
    })
  },

  // ── Members ────────────────────────────────────────────────────────

  async getMembers() {
    return apiClient<{
      users: Array<{ id: string; username: string; displayName: string | null }>
    }>(`/api/board/members`)
  },

  // ── Files ──────────────────────────────────────────────────────────

  async getFiles(cardId: string) {
    return apiClient<{ files: BoardFile[] }>(`/api/board/cards/${cardId}/files`)
  },

  async uploadFile(cardId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return apiUpload<{ file: BoardFile }>(`/api/board/cards/${cardId}/files`, formData)
  },

  async deleteFile(cardId: string, fileId: string) {
    return apiClient<{ success: boolean }>(`/api/board/cards/${cardId}/files/${fileId}`, {
      method: 'DELETE',
    })
  },

  async downloadFile(cardId: string, fileId: string): Promise<Blob> {
    const res = await fetch(`/api/board/cards/${cardId}/files/${fileId}/download`, {
      credentials: 'include',
    })
    if (!res.ok) {
      throw new ApiError(res.status, `Download failed: ${res.statusText}`)
    }
    return res.blob()
  },

  // ── Notes ──────────────────────────────────────────────────────────

  async updateNotes(cardId: string, notes: string) {
    return apiClient<{
      card: {
        id: string
        notes: string
        notesUpdatedAt: string | null
        notesUpdatedBy: string | null
      }
    }>(`/api/board/cards/${cardId}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    })
  },

  // ── Admin ──────────────────────────────────────────────────────────

  async archiveCard(cardId: string, confirmProjectName: string) {
    return apiClient<{
      success: boolean
      cardId: string
      projectName: string
      fileCount: number
      totalBytes: number
    }>(`/api/board/cards/${cardId}/admin/archive`, {
      method: 'POST',
      body: JSON.stringify({ confirmProjectName }),
    })
  },

  // ── Notifications ──────────────────────────────────────────────────

  async getUnreadNotificationCount() {
    return apiClient<{ count: number }>(`/api/board/notifications/unread-count`)
  },

  async markCardNotificationsRead(cardId: string) {
    return apiClient<{ success: boolean }>(`/api/board/notifications/mark-read`, {
      method: 'POST',
      body: JSON.stringify({ cardId }),
    })
  },
}
