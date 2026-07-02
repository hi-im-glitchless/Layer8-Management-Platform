import { UserX, CalendarCheck } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAbsencesOutToday } from '@/features/schedule/hooks'
import type { AbsenceOutEntry } from '@/features/schedule/types'

const TYPE_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  sick: 'Sick',
  vacation: 'Vacation',
  other: 'Other',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

export function OutTodayWidget() {
  const { data, isLoading, isError } = useAbsencesOutToday()
  const absences: AbsenceOutEntry[] = data?.absences ?? []

  return (
    <>
      <div className="flex items-center gap-2">
        <UserX className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold tracking-tight">Out Today</h2>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border bg-card px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">Could not load absence data</p>
        </div>
      ) : absences.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-8 text-center">
          <CalendarCheck className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No one is out today</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <ul className="divide-y">
            {absences.map((absence) => (
              <li
                key={absence.teamMemberId}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{absence.displayName}</p>
                  {absence.reason ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{absence.reason}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {typeLabel(absence.type)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
