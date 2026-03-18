import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QUARTER_TABS } from '../constants'

interface QuarterTabsProps {
  activeQuarter: number | null
  onQuarterChange: (quarter: number | null) => void
}

export function QuarterTabs({ activeQuarter, onQuarterChange }: QuarterTabsProps) {
  const currentValue = activeQuarter === null ? 'all' : `Q${activeQuarter}`

  return (
    <Tabs
      value={currentValue}
      onValueChange={(value) => {
        if (value === 'all') {
          onQuarterChange(null)
        } else {
          onQuarterChange(parseInt(value.replace('Q', ''), 10))
        }
      }}
    >
      <TabsList>
        {QUARTER_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
