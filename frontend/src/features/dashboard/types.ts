export interface DashboardProject {
  projectName: string
  projectColor: string
  clientName: string | null
  tags: string[]
  startDate: string    // ISO date of first consecutive week
  endDate: string      // ISO date of last consecutive week
  durationWeeks: number // count of consecutive weeks
  status: string       // assignment status (confirmed, needs-reqs, placeholder)
  /**
   * Id of the underlying Assignment row that anchors this project entry.
   * Used by the Dashboard ProjectCard to deep-link to the corresponding
   * /board?card=<id>. Optional because synthetic/placeholder timeline rows
   * (with no backing Assignment) do not have one.
   */
  assignmentId?: string
  /**
   * Phase 24-R02: which half of a split assignment this entry represents.
   * Primary = the main project; secondary = the split half. Non-split
   * assignments only emit a primary entry. ProjectCard.handleClick passes
   * this through to /api/board/cards?side=... so the deep link lands on
   * the right BoardCard.
   */
  side?: 'primary' | 'secondary'
}
