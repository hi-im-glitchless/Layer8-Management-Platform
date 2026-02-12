import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { auditApi, type AuditFilters } from './api'

export function useAuditLogs(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ['audit', 'logs', filters],
    queryFn: () => auditApi.getAuditLogs(filters),
  })
}

export function useExportAuditLogs() {
  return useMutation({
    mutationFn: (filters: AuditFilters) => auditApi.exportAuditLogs(filters),
    onSuccess: () => {
      toast.success('Audit logs exported successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export audit logs')
    },
  })
}

export function usePurgeAuditLogs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => auditApi.purgeAuditLogs(),
    onSuccess: (data) => {
      toast.success(`Purged ${data.purged} audit log${data.purged !== 1 ? 's' : ''}`)
      queryClient.invalidateQueries({ queryKey: ['audit', 'logs'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to purge audit logs')
    },
  })
}

export function useVerifyChain() {
  return useMutation({
    mutationFn: () => auditApi.verifyAuditChain(),
    onSuccess: (data) => {
      if (data.valid) {
        toast.success(
          `Audit chain verified: ${data.verifiedEntries} entries valid`
        )
      } else {
        toast.error(
          `Audit chain integrity compromised at entry ${data.firstInvalidIndex}`
        )
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to verify audit chain')
    },
  })
}
