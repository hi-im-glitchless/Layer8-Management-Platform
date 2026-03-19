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
      toast.success('Team member added successfully')
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to add team member'),
  })
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { displayOrder?: number; status?: string } }) =>
      scheduleApi.updateTeamMember(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
      toast.success('Team member updated successfully')
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
      toast.success('Team member archived successfully')
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
      toast.success('Team order updated')
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to reorder team members'),
  })
}

export function useInitBacklogMembers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => scheduleApi.initBacklogMembers(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'team-members'] })
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to initialize backlog members'),
  })
}

// ── Assignments ────────────────────────────────────────────────────

export function useAssignments(year: number, quarter?: number) {
  return useQuery({
    queryKey: ['schedule', 'assignments', year, quarter],
    queryFn: () => scheduleApi.getAssignments({ year, quarter }),
  })
}

export function useUpsertAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAssignmentRequest) => scheduleApi.upsertAssignment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
      toast.success('Assignment saved successfully')
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
      toast.success('Assignment updated successfully')
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to update assignment'),
  })
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
      toast.success('Assignment deleted successfully')
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
      toast.success('Assignments swapped successfully')
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
      toast.success('Lock toggled successfully')
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
      toast.success('Absence updated successfully')
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
      toast.success('Holiday created successfully')
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
      toast.success('Holiday updated successfully')
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
      toast.success('Holiday deleted successfully')
    },
    onError: (error: Error) => handleMutationError(error, 'Failed to delete holiday'),
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
