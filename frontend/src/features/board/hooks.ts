import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
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

// ── Comments ─────────────────────────────────────────────────────────

export function useBoardComments(cardId: string) {
  return useQuery({
    queryKey: ['board', 'comments', cardId],
    queryFn: () => boardApi.getComments(cardId),
    enabled: !!cardId,
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId, body }: { cardId: string; body: string }) =>
      boardApi.addComment(cardId, body),
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
      queryClient.invalidateQueries({ queryKey: ['board', 'files', cardId] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete file'),
  })
}
