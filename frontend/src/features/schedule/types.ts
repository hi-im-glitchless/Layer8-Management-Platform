import { z } from 'zod'

// ── Response types (from API) ──────────────────────────────────────

export interface TeamMemberUser {
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export interface TeamMember {
  id: string
  userId: string
  displayOrder: number
  status: string
  joinedAt: string
  createdAt: string
  updatedAt: string
  user: TeamMemberUser
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
  createdBy: string | null
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

// ── Zod validation schemas (forms / requests) ──────────────────────

export const CreateAssignmentSchema = z.object({
  teamMemberId: z.string().min(1),
  projectName: z.string().min(1).max(100),
  projectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  status: z.enum(['placeholder', 'needs-reqs', 'confirmed']),
  weekStart: z.string().min(1),
  splitProjectName: z.string().max(100).nullable().optional(),
  splitProjectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
})

export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentSchema>

export const UpdateAssignmentSchema = z.object({
  projectName: z.string().min(1).max(100).optional(),
  projectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  status: z.enum(['placeholder', 'needs-reqs', 'confirmed']).optional(),
  splitProjectName: z.string().max(100).nullable().optional(),
  splitProjectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
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
