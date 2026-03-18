import type { Assignment } from '../types'

interface AssignmentModalProps {
  open: boolean
  onClose: () => void
  teamMemberId: string
  weekStart: string
  assignment: Assignment | undefined
}

export function AssignmentModal({ open, onClose, teamMemberId, weekStart, assignment }: AssignmentModalProps) {
  if (!open) return null
  // Stub - will be replaced in T3
  return null
}
