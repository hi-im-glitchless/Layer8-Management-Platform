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
   * Phase 24-R03: FK to the Project entity for click-through. NULL when
   * this dashboard entry belongs to a pre-R03 assignment (or one missing
   * name/client/tags) — those entries are visible on the dashboard but do
   * not have a Planner card to navigate to.
   */
  projectId: string | null
  /**
   * Underlying Assignment row id — retained for the "View on Board" link
   * and for legacy callers. Optional because synthetic timeline rows may
   * not have one.
   */
  assignmentId?: string
  /** Phase 24-R02: which half of a split assignment this entry represents. */
  side?: 'primary' | 'secondary'
}
