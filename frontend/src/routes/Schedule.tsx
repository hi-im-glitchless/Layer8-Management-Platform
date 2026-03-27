import { useState } from 'react'
import { QuarterTabs } from '@/features/schedule/components/QuarterTabs'
import { YearPicker } from '@/features/schedule/components/YearPicker'
import { ScheduleGrid } from '@/features/schedule/components/ScheduleGrid'
import { LegendBar } from '@/features/schedule/components/LegendBar'
import { TeamManagementPanel } from '@/features/schedule/components/TeamManagementPanel'
import { HolidayManager } from '@/features/schedule/components/HolidayManager'
import { ClientManager } from '@/features/schedule/components/ClientManager'
import { PurgeScheduleDialog } from '@/features/schedule/components/PurgeScheduleDialog'
import { useAuth } from '@/features/auth/hooks'
import { useScheduleSync } from '@/features/schedule/useScheduleSync'

function getCurrentQuarter(): number {
  const now = new Date()
  const month = now.getMonth() // 0-11
  const quarter = Math.ceil((month + 1) / 3)
  // If we're in the last 4 days of a quarter's last month and today is
  // in a week that spans into the next quarter, advance to next quarter.
  // Quarter end months: 2 (Mar), 5 (Jun), 8 (Sep), 11 (Dec)
  const endMonth = (quarter * 3) - 1
  if (month === endMonth) {
    const lastDay = new Date(now.getFullYear(), endMonth + 1, 0).getDate()
    if (now.getDate() > lastDay - 4) {
      return quarter < 4 ? quarter + 1 : quarter
    }
  }
  return quarter
}

export function Schedule() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(getCurrentQuarter())
  const { hasRole } = useAuth()
  useScheduleSync()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <div className="flex items-center gap-2">
          {hasRole('ADMIN') && <PurgeScheduleDialog />}
          {hasRole('PM') && <HolidayManager />}
          <ClientManager />
          {hasRole('PM') && <TeamManagementPanel />}
          <YearPicker selectedYear={selectedYear} onYearChange={setSelectedYear} />
        </div>
      </div>
      <QuarterTabs activeQuarter={selectedQuarter} onQuarterChange={setSelectedQuarter} />
      <LegendBar />
      <div className="-mx-6 px-1 overflow-x-hidden">
        <ScheduleGrid year={selectedYear} quarter={selectedQuarter} />
      </div>
    </div>
  )
}
