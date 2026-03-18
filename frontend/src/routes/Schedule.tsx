import { useState } from 'react'
import { QuarterTabs } from '@/features/schedule/components/QuarterTabs'
import { YearPicker } from '@/features/schedule/components/YearPicker'
import { ScheduleGrid } from '@/features/schedule/components/ScheduleGrid'

function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3)
}

export function Schedule() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(getCurrentQuarter())

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <YearPicker selectedYear={selectedYear} onYearChange={setSelectedYear} />
      </div>
      <QuarterTabs activeQuarter={selectedQuarter} onQuarterChange={setSelectedQuarter} />
      <ScheduleGrid year={selectedYear} quarter={selectedQuarter} />
    </div>
  )
}
