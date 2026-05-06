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
  notesUpdatedAt: string | null
  notesUpdatedBy: string | null
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
    clientId: string | null
  } | null
  comments?: BoardComment[]
  files?: BoardFile[]
}

export interface BoardComment {
  id: string
  cardId: string
  authorId: string | null
  authorName?: string | null
  body: string | null
  isDeleted: boolean
  editedAt: string | null
  deletedAt: string | null
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
  storedName?: string
  mimeType: string
  sizeBytes: number
  scanStatus: string
  isQuarantined: boolean
  uploadedBy: string | null
  createdAt: string
  uploader?: {
    id: string
    username: string
  } | null
}

/** Per-card storage cap (mirrors backend MAX_CARD_BYTES from boardFileService.ts). */
export const MAX_CARD_BYTES = 500 * 1024 * 1024

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
  stageLockedBy?: string | null
}

export interface CardFilters {
  stage?: BoardStage
  assignmentId?: string
}

// ── Stage constants ─────────────────────────────────────────────────

/** Display stages (excludes 'archived' — shown only via toggle) */
export const BOARD_STAGES = ['upcoming', 'preparation', 'execution', 'closing', 'done'] as const

export const STAGE_LABELS: Record<BoardStage, string> = {
  upcoming: 'Upcoming',
  preparation: 'Preparation',
  execution: 'Execution',
  closing: 'Closing',
  done: 'Done',
  archived: 'Archived',
}

/** Group cards by stage, sorted within each group by weekStart ascending */
export function groupCardsByStage(cards: BoardCard[]): Record<BoardStage, BoardCard[]> {
  const grouped: Record<BoardStage, BoardCard[]> = {
    upcoming: [],
    preparation: [],
    execution: [],
    closing: [],
    done: [],
    archived: [],
  }

  for (const card of cards) {
    grouped[card.stage]?.push(card)
  }

  // Sort each group by assignment.weekStart ascending (soonest first)
  for (const stage of Object.keys(grouped) as BoardStage[]) {
    grouped[stage].sort((a, b) => {
      const aDate = a.assignment?.weekStart ?? ''
      const bDate = b.assignment?.weekStart ?? ''
      return aDate.localeCompare(bDate)
    })
  }

  return grouped
}
