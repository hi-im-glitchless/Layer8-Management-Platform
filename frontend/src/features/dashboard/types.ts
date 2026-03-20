export interface DashboardProject {
  projectName: string
  projectColor: string
  clientName: string | null
  tags: string[]
  startDate: string    // ISO date of first consecutive week
  endDate: string      // ISO date of last consecutive week
  durationWeeks: number // count of consecutive weeks
  status: string       // assignment status (confirmed, needs-reqs, placeholder)
}
