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
}
