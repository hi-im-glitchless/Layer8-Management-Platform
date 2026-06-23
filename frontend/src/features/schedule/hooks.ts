import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { scheduleApi } from './api'
import type {
  CreateAssignmentRequest,
  UpdateAssignmentRequest,
  CreateAbsenceRequest,
  CreateHolidayRequest,
  UpdateHolidayRequest,
  CreateClientRequest,
  UpdateClientRequest,
} from './types'

function handleMutationError(error: Error, fallbackMessage: string) {
  if (error instanceof ApiError && error.status === 403) {
    toast.error('Permission denied: you do not have access to perform this action')
  } else {
    toast.error(error.message || fallbackMessage)
  }
}

// ── Team Members ───────────────────────────────────────────────────

export function useTeamMembers() {
  return useQuery({
    queryKey: ['schedule', 'team-members'],
    queryFn: () => scheduleApi.getTeamMembers(),
  })
}

export function useCreateTeamMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => scheduleApi.createTeamMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to add team member'),
  })
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { displayOrder?: number; status?: string; displayName?: string | null } }) =>
      scheduleApi.updateTeamMember(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to update team member'),
  })
}

export function useArchiveTeamMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => scheduleApi.archiveTeamMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to archive team member'),
  })
}

export function useReorderTeamMembers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orderedIds: string[]) => scheduleApi.reorderTeamMembers(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to reorder team members'),
  })
}

export function useAddBacklogMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => scheduleApi.addBacklogMember(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to add backlog row'),
  })
}

export function useDeleteBacklogMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteBacklogMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete backlog row'),
  })
}

// ── Assignments ────────────────────────────────────────────────────

export function useAssignments(year: number, quarter?: number) {
  return useQuery({
    queryKey: ['schedule', 'assignments', year, quarter],
    queryFn: () => scheduleApi.getAssignments({ year, quarter }),
  })
}

export function useMyAssignments(year: number, quarter?: number) {
  return useQuery({
    queryKey: ['schedule', 'assignments', 'me', year, quarter],
    queryFn: () => scheduleApi.getMyAssignments({ year, quarter }),
  })
}

export function useUpsertAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAssignmentRequest) => scheduleApi.upsertAssignment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
      // Phase 24-R02: upserts also create/destroy BoardCards via the backend
      // reconcile pass, so the planner queries need to refetch.
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to save assignment'),
  })
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssignmentRequest }) =>
      scheduleApi.updateAssignment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
      // Phase 05-01: a status (or color) edit here can change the linked
      // Project, so the Planner board card must refetch — mirror the board
      // invalidation already wired in useUpsertAssignment.
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to update assignment'),
  })
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteAssignment(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
      // Phase 09: deleting the last assignment for a project moves its Planner
      // card to 'stopped' on the backend, so the board cache must refetch —
      // mirror the invalidation already wired in useUpsertAssignment/useUpdateAssignment.
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
      // UAT R01 (b3): the orphan-cleanup of a last-assignment delete is
      // best-effort and non-fatal. When the backend reports it failed, the
      // Project/Board card survived even though the assignment was deleted —
      // warn the user instead of letting the failure pass silently.
      if (data?.orphanCleanupFailed) {
        toast.warning(
          'Assignment deleted, but the project/board card could not be cleaned up — please retry or remove it from the Board.',
        )
      }
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete assignment'),
  })
}

export function useSwapAssignments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ idA, idB }: { idA: string; idB: string }) =>
      scheduleApi.swapAssignments(idA, idB),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to swap assignments'),
  })
}

export function useToggleLock() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => scheduleApi.toggleLock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to toggle lock'),
  })
}

// ── Absences ───────────────────────────────────────────────────────

export function useAbsences(params: { teamMemberId?: string; dateStart?: string; dateEnd?: string }) {
  return useQuery({
    queryKey: ['schedule', 'absences', params],
    queryFn: () => scheduleApi.getAbsences(params),
  })
}

export function useToggleAbsence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAbsenceRequest) => scheduleApi.toggleAbsence(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'absences'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to update absence'),
  })
}

// ── Holidays ───────────────────────────────────────────────────────

export function useHolidays() {
  return useQuery({
    queryKey: ['schedule', 'holidays'],
    queryFn: () => scheduleApi.getHolidays(),
  })
}

export function useCreateHoliday() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateHolidayRequest) => scheduleApi.createHoliday(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'holidays'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to create holiday'),
  })
}

export function useUpdateHoliday() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHolidayRequest }) =>
      scheduleApi.updateHoliday(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'holidays'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to update holiday'),
  })
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteHoliday(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'holidays'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete holiday'),
  })
}

// ── Clients ───────────────────────────────────────────────────────

export function useClients() {
  return useQuery({
    queryKey: ['schedule', 'clients'],
    queryFn: () => scheduleApi.getClients(),
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateClientRequest) => scheduleApi.createClient(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'clients'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to create client'),
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClientRequest }) =>
      scheduleApi.updateClient(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'clients'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to update client'),
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'clients'] })
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete client'),
  })
}

// ── Purge Schedule ───────────────────────────────────────────────

export function usePurgeSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => scheduleApi.purgeSchedule(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to purge schedule'),
  })
}

// ── Project Tags ──────────────────────────────────────────────────

export function useProjectTags() {
  return useQuery({
    queryKey: ['schedule', 'project-tags'],
    queryFn: () => scheduleApi.getProjectTags(),
    staleTime: Infinity,
  })
}

// ── Project Colors ─────────────────────────────────────────────────

export function useSearchProjectColors(query: string) {
  return useQuery({
    queryKey: ['schedule', 'project-colors', query],
    queryFn: () => scheduleApi.searchProjectColors(query),
    enabled: query.length > 0,
  })
}
