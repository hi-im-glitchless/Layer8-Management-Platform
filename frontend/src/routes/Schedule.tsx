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

function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3)
}

export function Schedule() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(getCurrentQuarter())
  const { hasRole } = useAuth()

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
      <div className="-mx-6 px-1">
        <ScheduleGrid year={selectedYear} quarter={selectedQuarter} />
      </div>
    </div>
  )
}
