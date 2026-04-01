import { apiClient, apiUpload } from '@/lib/api'
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

  async addComment(cardId: string, body: string) {
    return apiClient<{ comment: BoardComment }>(`/api/board/cards/${cardId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
  },

  async deleteComment(cardId: string, commentId: string) {
    return apiClient<{ success: boolean }>(`/api/board/cards/${cardId}/comments/${commentId}`, {
      method: 'DELETE',
    })
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
}
