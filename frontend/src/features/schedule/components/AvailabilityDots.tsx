import { memo, useMemo, useCallback } from 'react'
import { useAuth } from '@/features/auth/hooks'
import { useToggleAbsence } from '../hooks'
import type { Absence, Holiday } from '../types'

interface AvailabilityDotsProps {
  weekStart: Date
  teamMemberId: string
  absences: Absence[]
  holidays: Holiday[]
  year: number
}

function getDaysOfWeek(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  return days
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

export const AvailabilityDots = memo(function AvailabilityDots({
  weekStart,
  teamMemberId,
  absences,
  holidays,
  year,
}: AvailabilityDotsProps) {
  const { hasRole } = useAuth()
  const canToggle = hasRole('MANAGER')
  const toggleAbsence = useToggleAbsence()

  const days = useMemo(() => getDaysOfWeek(weekStart), [weekStart])

  const absenceMap = useMemo(() => {
    const map = new Set<string>()
    for (const a of absences) {
      if (a.teamMemberId === teamMemberId) {
        map.add(new Date(a.date).toISOString().split('T')[0])
      }
    }
    return map
  }, [absences, teamMemberId])

  const holidaySet = useMemo(() => {
    const set = new Set<string>()
    for (const h of holidays) {
      const date = new Date(year, h.month - 1, h.day)
      set.add(formatDateKey(date))
    }
    return set
  }, [holidays, year])

  const handleToggle = useCallback((dateKey: string) => {
    if (!canToggle) return
    toggleAbsence.mutate({
      teamMemberId,
      date: dateKey,
      type: 'vacation',
    })
  }, [canToggle, teamMemberId, toggleAbsence])

  return (
    <div className="flex gap-[2px] justify-center mt-0.5">
      {days.map((day) => {
        const key = formatDateKey(day)
        const isHoliday = holidaySet.has(key)
        const isAbsent = absenceMap.has(key)

        let dotClass = 'w-[5px] h-[5px] rounded-full border border-muted-foreground/30'

        if (isHoliday) {
          dotClass = 'w-[5px] h-[5px] rounded-full bg-blue-500'
        } else if (isAbsent) {
          dotClass = 'w-[5px] h-[5px] rounded-full bg-red-500'
        }

        if (canToggle && !isHoliday) {
          return (
            <button
              key={key}
              type="button"
              className={`${dotClass} cursor-pointer hover:ring-1 hover:ring-ring transition-all`}
              onClick={(e) => {
                e.stopPropagation()
                handleToggle(key)
              }}
            />
          )
        }

        return <div key={key} className={dotClass} />
      })}
    </div>
  )
})
