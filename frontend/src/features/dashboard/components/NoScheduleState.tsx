import { CalendarX } from 'lucide-react'

export function NoScheduleState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-10 text-center">
      <CalendarX className="mb-3 h-10 w-10 text-muted-foreground/50" />
      <p className="text-lg font-medium text-muted-foreground">
        No schedule data available
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Your account is not linked to a team member profile. Contact an admin to
        get set up on the schedule.
      </p>
    </div>
  )
}
