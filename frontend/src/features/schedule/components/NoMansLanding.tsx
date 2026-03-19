import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { AssignmentCell } from './AssignmentCell'
import { AvailabilityDots } from './AvailabilityDots'
import { toLocalDateString } from '../constants'
import type { Assignment, Absence, Holiday, TeamMember, AssignmentStatus } from '../types'

interface NoMansLandingProps {
  backlogMembers: TeamMember[]
  weekSlice: Date[]
  year: number
  canEdit: boolean
  absences: Absence[]
  holidays: Holiday[]
  holidaysByWeek: Map<string, string[]>
  getAssignment: (teamMemberId: string, weekStart: Date) => Assignment | undefined
  isFullyAbsent: (teamMemberId: string, weekStart: Date) => boolean
  onCellClick: (teamMemberId: string, weekStart: Date, assignment: Assignment | undefined, e?: React.MouseEvent) => void
  onCellHover: (teamMemberId: string, weekStart: string) => void
  onLockToggle: (assignmentId: string) => void
  onStatusCycle?: (assignmentId: string, nextStatus: AssignmentStatus) => void
}

function getMemberLabel(member: TeamMember): string {
  if (member.displayName) return member.displayName
  if (member.user?.displayName) return member.user.displayName
  if (member.user?.username) return member.user.username
  return `Futuro ${member.displayOrder}`
}

export function NoMansLanding({
  backlogMembers,
  weekSlice,
  year,
  canEdit,
  absences,
  holidays,
  getAssignment,
  isFullyAbsent,
  onCellClick,
  onCellHover,
  onLockToggle,
  onStatusCycle,
}: NoMansLandingProps) {
  if (backlogMembers.length === 0) return null

  return (
    <>
      {/* Separator row */}
      <tr>
        <td
          colSpan={weekSlice.length + 1}
          className="bg-amber-50 dark:bg-amber-950/20 border-t-2 border-amber-300 dark:border-amber-700 px-4 py-1.5 text-sm font-bold text-amber-800 dark:text-amber-300 tracking-wide"
        >
          No Man&apos;s Landing
        </td>
      </tr>
      {/* Backlog member rows */}
      {backlogMembers.map((member) => (
        <tr key={member.id} className="hover:bg-muted/30 transition-colors">
          <td className="sticky left-0 z-20 bg-background border-b border-r border-border/50 px-3 py-1.5 text-sm font-medium w-[250px] min-w-[200px] max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap text-amber-700 dark:text-amber-400 italic">
            {getMemberLabel(member)}
          </td>
          {weekSlice.map((week) => {
            const assignment = getAssignment(member.id, week)
            const fullyOut = isFullyAbsent(member.id, week)
            const weekStr = toLocalDateString(week)
            return (
              <td
                key={week.toISOString()}
                className={`border-b border-r border-border/50 p-0.5 min-w-[150px] h-[56px] align-top${fullyOut ? ' bg-muted' : ''}`}
                onMouseEnter={() => onCellHover(member.id, weekStr)}
              >
                {fullyOut ? (
                  <div className="h-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">OUT</span>
                  </div>
                ) : (
                  <>
                    <AssignmentCell
                      assignment={assignment}
                      teamMemberId={member.id}
                      weekStart={weekStr}
                      canEdit={canEdit}
                      isDragOverlay={false}
                      onCellClick={(e) => onCellClick(member.id, week, assignment, e)}
                      onLockToggle={assignment ? () => onLockToggle(assignment.id) : undefined}
                      onStatusCycle={canEdit && assignment ? onStatusCycle : undefined}
                    />
                    <AvailabilityDots
                      weekStart={week}
                      teamMemberId={member.id}
                      absences={absences}
                      holidays={holidays}
                      year={year}
                    />
                  </>
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
