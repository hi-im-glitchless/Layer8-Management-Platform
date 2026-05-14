import { z } from 'zod'

// ── Response types (from API) ──────────────────────────────────────

export interface TeamMemberUser {
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export interface TeamMember {
  id: string
  userId: string | null
  displayOrder: number
  status: string
  isBacklog: boolean
  displayName: string | null
  joinedAt: string
  createdAt: string
  updatedAt: string
  user: TeamMemberUser | null
}

export type AssignmentStatus = 'placeholder' | 'needs-reqs' | 'confirmed'

export interface Assignment {
  id: string
  teamMemberId: string
  /**
   * Nested team-member fields surfaced for pentester self-detection on the
   * schedule grid (plan 24-03). The data already arrives via the existing
   * `include: { teamMember: { include: { user: ... } } }` on
   * `assignmentService.listAssignments`; this declaration just exposes the
   * `userId` foreign key (and the avatar-relevant `user` block PMs render
   * elsewhere in the grid) on the FE type so call sites can compare it with
   * `useAuth().user.id` without an extra round-trip. Optional for backwards
   * compatibility with any consumer that hand-crafts an Assignment shape.
   */
  teamMember?: {
    userId: string | null
    user?: TeamMemberUser | null
  }
  projectName: string
  projectColor: string
  status: AssignmentStatus
  weekStart: string
  isLocked: boolean
  splitProjectName: string | null
  splitProjectColor: string | null
  splitProjectStatus: AssignmentStatus | null
  splitClientId: string | null
  splitTags: string[]
  splitClient: Client | null
  createdBy: string | null
  clientId: string | null
  tags: string[]
  client: Client | null
  /**
   * Phase 24-R03: FK to the Project entity for the primary half. Set
   * automatically by the backend when the assignment has name + client +
   * at least one tag. NULL otherwise — those rows do not appear in the
   * new Project-based Planner.
   */
  projectId: string | null
  /** Same as projectId but for the secondary half of a split assignment. */
  splitProjectId: string | null
  /** Project metadata (when projectId is set). Read-only at this layer. */
  project: { id: string; name: string; color: string; status: string } | null
  splitProject: { id: string; name: string; color: string; status: string } | null
  createdAt: string
  updatedAt: string
}

export type AbsenceType = 'holiday' | 'sick' | 'vacation' | 'other'

export interface Absence {
  id: string
  teamMemberId: string
  date: string
  type: AbsenceType
  reason: string | null
  createdAt: string
  updatedAt: string
}

export interface Holiday {
  id: string
  name: string
  month: number
  day: number
  isRecurring: boolean
}

export interface ProjectColor {
  id: string
  name: string
  color: string
  usageCount: number
  lastUsedAt: string
}

export interface Client {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface CreateClientRequest {
  name: string
  color: string
}

export interface UpdateClientRequest {
  name?: string
  color?: string
}

export const PREDEFINED_TAGS = [
  'Web', 'Mobile', 'API', 'Cloud', 'Docker', 'Externa', 'Interna', 'Red Team',
  'Phishing', 'OSINT', 'Esoterico', 'Fisico', 'Ransomware/Malware', 'Chatbot', 'Cert', 'Outro',
] as const

export type ProjectTag = (typeof PREDEFINED_TAGS)[number]

// ── Zod validation schemas (forms / requests) ──────────────────────

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
})

export const UpdateClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export const CreateAssignmentSchema = z.object({
  teamMemberId: z.string().min(1),
  projectName: z.string().max(200).default(''),
  projectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  status: z.enum(['placeholder', 'needs-reqs', 'confirmed']),
  weekStart: z.string().min(1),
  splitProjectName: z.string().max(200).nullable().optional(),
  splitProjectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  splitProjectStatus: z.enum(['placeholder', 'needs-reqs', 'confirmed']).nullable().optional(),
  splitClientId: z.string().nullable().optional(),
  splitTags: z.array(z.string()).optional(),
  clientId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  /**
   * Phase 24-R02: optional signal sent by the AssignmentModal when the user
   * is removing one half of a split. The backend uses this to decide which
   * BoardCard to keep (so the surviving project's notes/files/comments
   * are preserved). Plain upserts (creating, editing without side removal)
   * leave this undefined.
   */
  removedSide: z.enum(['primary', 'secondary']).optional(),
})

export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentSchema>

export const UpdateAssignmentSchema = z.object({
  projectName: z.string().max(200).optional(),
  projectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  status: z.enum(['placeholder', 'needs-reqs', 'confirmed']).optional(),
  splitProjectName: z.string().max(200).nullable().optional(),
  splitProjectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  splitProjectStatus: z.enum(['placeholder', 'needs-reqs', 'confirmed']).nullable().optional(),
  splitClientId: z.string().nullable().optional(),
  splitTags: z.array(z.string()).optional(),
  teamMemberId: z.string().min(1).optional(),
  weekStart: z.string().min(1).optional(),
  clientId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

export type UpdateAssignmentRequest = z.infer<typeof UpdateAssignmentSchema>

export const CreateAbsenceSchema = z.object({
  teamMemberId: z.string().min(1),
  date: z.string().min(1),
  type: z.enum(['holiday', 'sick', 'vacation', 'other']),
  reason: z.string().max(255).nullable().optional(),
})

export type CreateAbsenceRequest = z.infer<typeof CreateAbsenceSchema>

export const CreateHolidaySchema = z.object({
  name: z.string().min(1).max(100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  isRecurring: z.boolean().default(true),
})

export type CreateHolidayRequest = z.infer<typeof CreateHolidaySchema>

export const UpdateHolidaySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  isRecurring: z.boolean().optional(),
})

export type UpdateHolidayRequest = z.infer<typeof UpdateHolidaySchema>
