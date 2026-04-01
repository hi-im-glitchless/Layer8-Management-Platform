// ── Board domain types ───────────────────────────────────────────────

export interface ChecklistItem {
  label: string
  checked: boolean
  order: number
}

export type BoardStage = 'upcoming' | 'preparation' | 'execution' | 'closing' | 'done' | 'archived'

export interface BoardCard {
  id: string
  assignmentId: string | null
  stage: BoardStage
  checklist: ChecklistItem[]
  notes: string
  stageLockedBy: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  assignment?: {
    id: string
    teamMemberId: string
    projectName: string
    projectColor: string
    status: string
    weekStart: string
  } | null
  comments?: BoardComment[]
  files?: BoardFile[]
}

export interface BoardComment {
  id: string
  cardId: string
  authorId: string | null
  body: string
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    displayName?: string
  } | null
}

export interface BoardFile {
  id: string
  cardId: string
  filename: string
  storedName: string
  mimeType: string
  sizeBytes: number
  uploadedBy: string | null
  createdAt: string
  uploader?: {
    id: string
    username: string
  } | null
}

// ── API request/response types ───────────────────────────────────────

export interface CreateCardPayload {
  assignmentId?: string
  stage?: BoardStage
  checklist?: ChecklistItem[]
  notes?: string
}

export interface UpdateCardPayload {
  stage?: BoardStage
  notes?: string
  checklist?: ChecklistItem[]
  stageLockedBy?: string
}

export interface CardFilters {
  stage?: BoardStage
  assignmentId?: string
}
