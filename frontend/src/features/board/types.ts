// ── Board domain types ───────────────────────────────────────────────

export interface ChecklistItem {
  label: string
  checked: boolean
  order: number
}

export type BoardStage = 'upcoming' | 'preparation' | 'execution' | 'closing' | 'done' | 'archived'

/**
 * Phase 24-R03: a BoardCard now represents a Project, not an Assignment.
 * The `project` field carries the canonical project metadata; `assignments`
 * lists every (pentester, week) commitment that links to this Project.
 * Multiple assignments → multi-pentester / multi-week engagement, one card.
 */
export interface BoardCard {
  id: string
  stage: BoardStage
  checklist: ChecklistItem[]
  notes: string
  notesUpdatedAt: string | null
  notesUpdatedBy: string | null
  stageLockedBy: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  project: {
    id: string
    name: string
    clientId: string | null
    tags: string[]
    color: string
    status: string
    client?: { id: string; name: string; color: string } | null
  }
  assignments: BoardCardAssignment[]
  comments?: BoardComment[]
  files?: BoardFile[]
}

/** One Assignment row's slot in a card — pentester + week + which side. */
export interface BoardCardAssignment {
  assignmentId: string
  teamMemberId: string
  weekStart: string
  side: 'primary' | 'secondary'
  teamMember: {
    userId: string | null
    displayName: string | null
    user: { displayName: string | null; username: string } | null
  } | null
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

export interface UpdateCardPayload {
  stage?: BoardStage
  notes?: string
  checklist?: ChecklistItem[]
  stageLockedBy?: string | null
}

export interface CardFilters {
  stage?: BoardStage
  /** Phase 24-R03: cards are keyed by Project. */
  projectId?: string
}

// ── Stage constants ─────────────────────────────────────────────────

/** Display stages (excludes 'archived' — shown only via toggle) */
export const BOARD_STAGES = ['upcoming', 'preparation', 'execution', 'closing', 'done'] as const

export const STAGE_LABELS: Record<BoardStage, string> = {
  upcoming: 'Upcoming',
  preparation: 'Next Week',
  execution: 'Execution',
  closing: 'Closing',
  done: 'Done',
  archived: 'Archived',
}

/** Group cards by stage, sorted within each group by earliest assignment weekStart. */
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

  // Sort each group by earliest assignment weekStart (soonest first). Cards
  // with no assignments sort last.
  for (const stage of Object.keys(grouped) as BoardStage[]) {
    grouped[stage].sort((a, b) => {
      const aDate = a.assignments.length
        ? a.assignments.map((x) => x.weekStart).sort()[0]
        : '￿'
      const bDate = b.assignments.length
        ? b.assignments.map((x) => x.weekStart).sort()[0]
        : '￿'
      return aDate.localeCompare(bDate)
    })
  }

  return grouped
}
