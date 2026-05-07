import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError, apiClient } from '@/lib/api'
import { boardApi } from './api'
import type { CardFilters, CreateCardPayload, UpdateCardPayload } from './types'

function handleMutationError(error: Error, fallbackMessage: string) {
  if (error instanceof ApiError && error.status === 403) {
    toast.error('Permission denied: you do not have access to perform this action')
  } else {
    toast.error(error.message || fallbackMessage)
  }
}

// ── Cards ────────────────────────────────────────────────────────────

export function useBoardCards(filters?: CardFilters) {
  return useQuery({
    queryKey: ['board', 'cards', filters],
    queryFn: () => boardApi.getCards(filters),
  })
}

export function useBoardCard(id: string) {
  return useQuery({
    queryKey: ['board', 'cards', id],
    queryFn: () => boardApi.getCard(id),
    enabled: !!id,
  })
}

/**
 * Look up the BoardCard linked to a given Assignment id, if any.
 *
 * Used by the schedule AssignmentModal "View on Board" link (plan 24-02).
 * Returns the first matching card or null. Hidden when no card exists
 * (e.g., legacy assignments from before Phase 23 auto-create).
 */
export function useBoardCardByAssignmentId(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ['board', 'cards', { assignmentId }],
    queryFn: () => boardApi.getCards({ assignmentId: assignmentId! }),
    enabled: !!assignmentId,
    select: (data) => data.cards[0] ?? null,
  })
}

export function useCreateCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCardPayload) => boardApi.createCard(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to create card'),
  })
}

export function useUpdateCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCardPayload }) =>
      boardApi.updateCard(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to update card'),
  })
}

export function useDeleteCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => boardApi.deleteCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete card'),
  })
}

// ── Card mutations (DnD + auto-move) ────────────────────────────────

export function useMoveCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      boardApi.updateCard(id, { stage: stage as import('./types').BoardStage }),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['board', 'cards'] })
      const prev = queryClient.getQueriesData({ queryKey: ['board', 'cards'] })
      queryClient.setQueriesData<{ cards: import('./types').BoardCard[] }>(
        { queryKey: ['board', 'cards'] },
        (old) => {
          if (!old?.cards) return old
          return {
            ...old,
            cards: old.cards.map((c) =>
              c.id === id ? { ...c, stage: stage as import('./types').BoardStage } : c
            ),
          }
        }
      )
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        for (const [key, data] of context.prev) {
          queryClient.setQueryData(key, data)
        }
      }
      toast.error('Failed to move card')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
    },
  })
}

export function useResetAutoMove() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      boardApi.updateCard(id, { stageLockedBy: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
      toast.success('Auto-move re-enabled')
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to reset'),
  })
}

export function useAutoMoveCards() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient<{ moved: number }>('/api/board/cards/auto-move', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
    },
  })
}

// ── Comments ─────────────────────────────────────────────────────────

export function useBoardComments(cardId: string) {
  return useQuery({
    queryKey: ['board', 'comments', cardId],
    queryFn: () => boardApi.getComments(cardId),
    enabled: !!cardId,
  })
}

export function useBoardMembers() {
  return useQuery({
    queryKey: ['board', 'members'],
    queryFn: () => boardApi.getMembers(),
    staleTime: 5 * 60 * 1000, // 5 minutes — member list rarely changes
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cardId,
      body,
      mentions = [],
    }: {
      cardId: string
      body: string
      mentions?: string[]
    }) => boardApi.addComment(cardId, body, mentions),
    onSuccess: (_, { cardId }) => {
      queryClient.invalidateQueries({ queryKey: ['board', 'comments', cardId] })
      queryClient.invalidateQueries({ queryKey: ['board', 'cards', cardId] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to add comment'),
  })
}

export function useDeleteComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId, commentId }: { cardId: string; commentId: string }) =>
      boardApi.deleteComment(cardId, commentId),
    onSuccess: (_, { cardId }) => {
      queryClient.invalidateQueries({ queryKey: ['board', 'comments', cardId] })
      queryClient.invalidateQueries({ queryKey: ['board', 'cards', cardId] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete comment'),
  })
}

// ── Files ────────────────────────────────────────────────────────────

export function useBoardFiles(cardId: string) {
  return useQuery({
    queryKey: ['board', 'files', cardId],
    queryFn: () => boardApi.getFiles(cardId),
    enabled: !!cardId,
  })
}

export function useUploadFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId, file }: { cardId: string; file: File }) =>
      boardApi.uploadFile(cardId, file),
    onSuccess: (_, { cardId }) => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards', cardId] })
      queryClient.invalidateQueries({ queryKey: ['board', 'files', cardId] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to upload file'),
  })
}

export function useDeleteFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId, fileId }: { cardId: string; fileId: string }) =>
      boardApi.deleteFile(cardId, fileId),
    onSuccess: (_, { cardId }) => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards', cardId] })
      queryClient.invalidateQueries({ queryKey: ['board', 'files', cardId] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete file'),
  })
}

export function useDownloadFile() {
  return useMutation({
    mutationFn: ({ cardId, fileId }: { cardId: string; fileId: string; filename: string }) =>
      boardApi.downloadFile(cardId, fileId),
    onSuccess: (blob, { filename }) => {
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: filename })
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to download file'),
  })
}

// ── Notes ────────────────────────────────────────────────────────────

export function useUpdateNotes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId, notes }: { cardId: string; notes: string }) =>
      boardApi.updateNotes(cardId, notes),
    onMutate: async ({ cardId, notes }) => {
      await queryClient.cancelQueries({ queryKey: ['board', 'cards', cardId] })
      const prev = queryClient.getQueryData<{ card: import('./types').BoardCard }>([
        'board',
        'cards',
        cardId,
      ])
      if (prev?.card) {
        queryClient.setQueryData(['board', 'cards', cardId], {
          card: {
            ...prev.card,
            notes,
            notesUpdatedAt: new Date().toISOString(),
          },
        })
      }
      return { prev }
    },
    onError: (error: Error, { cardId }, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['board', 'cards', cardId], context.prev)
      }
      handleMutationError(error, 'Failed to save notes')
    },
    onSettled: (_data, _error, { cardId }) => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards', cardId] })
    },
  })
}

// ── Comment edit/soft-delete ─────────────────────────────────────────

export function useEditComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cardId,
      commentId,
      body,
    }: {
      cardId: string
      commentId: string
      body: string
    }) => boardApi.editComment(cardId, commentId, body),
    onSuccess: (_, { cardId }) => {
      queryClient.invalidateQueries({ queryKey: ['board', 'comments', cardId] })
      queryClient.invalidateQueries({ queryKey: ['board', 'cards', cardId] })
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 403) {
        const code = (error.message ?? '').toUpperCase()
        if (code.includes('WINDOW_EXPIRED')) {
          toast.error('Edit window expired (10 minutes after posting)')
          return
        }
        if (code.includes('NOT_AUTHOR')) {
          toast.error('You can only edit your own comments')
          return
        }
      }
      handleMutationError(error, 'Failed to edit comment')
    },
  })
}

export function useSoftDeleteComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId, commentId }: { cardId: string; commentId: string }) =>
      boardApi.softDeleteComment(cardId, commentId),
    onMutate: async ({ cardId, commentId }) => {
      await queryClient.cancelQueries({ queryKey: ['board', 'cards', cardId] })
      const prev = queryClient.getQueryData<{ card: import('./types').BoardCard }>([
        'board',
        'cards',
        cardId,
      ])
      if (prev?.card?.comments) {
        queryClient.setQueryData(['board', 'cards', cardId], {
          card: {
            ...prev.card,
            comments: prev.card.comments.map((c) =>
              c.id === commentId
                ? { ...c, body: null, isDeleted: true, deletedAt: new Date().toISOString() }
                : c,
            ),
          },
        })
      }
      return { prev }
    },
    onError: (error: Error, { cardId }, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['board', 'cards', cardId], context.prev)
      }
      handleMutationError(error, 'Failed to delete comment')
    },
    onSettled: (_data, _error, { cardId }) => {
      queryClient.invalidateQueries({ queryKey: ['board', 'comments', cardId] })
      queryClient.invalidateQueries({ queryKey: ['board', 'cards', cardId] })
    },
  })
}

// ── Admin archive ────────────────────────────────────────────────────

export function useArchiveCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cardId,
      confirmProjectName,
    }: {
      cardId: string
      confirmProjectName: string
    }) => boardApi.archiveCard(cardId, confirmProjectName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
      toast.success('Card archived')
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 400) {
        const code = (error.message ?? '').toUpperCase()
        if (code.includes('PROJECT_NAME_MISMATCH')) {
          toast.error('Project name does not match')
          return
        }
      }
      handleMutationError(error, 'Failed to archive card')
    },
  })
}

// ── Notifications ────────────────────────────────────────────────────

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: ['board', 'notifications', 'unread'],
    queryFn: () => boardApi.getUnreadNotificationCount(),
    refetchInterval: 60_000,
    enabled,
  })
}

export function useMarkCardNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId }: { cardId: string }) => boardApi.markCardNotificationsRead(cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'notifications', 'unread'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to mark notifications read'),
  })
}
