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
  'Web', 'Mobile', 'API', 'Cloud', 'Externa', 'Interna', 'Red Team',
  'Phishing', 'OSINT', 'Esoterico', 'Cert', 'Outro',
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
  projectName: z.string().min(1).max(200),
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
})

export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentSchema>

export const UpdateAssignmentSchema = z.object({
  projectName: z.string().min(1).max(200).optional(),
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
