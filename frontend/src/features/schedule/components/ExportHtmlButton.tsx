import { useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTeamMembers, useAssignments, useAbsences, useHolidays } from '../hooks'
import { getQuarterDateRange, toLocalDateString } from '../constants'
import { generateScheduleHtml } from '../utils/exportHtml'

interface ExportHtmlButtonProps {
  year: number
  quarter: number | null
}

export function ExportHtmlButton({ year, quarter }: ExportHtmlButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const teamMembersQuery = useTeamMembers()
  const assignmentsQuery = useAssignments(year, quarter ?? undefined)

  const { start, end } = getQuarterDateRange(year, quarter)
  const dateStart = toLocalDateString(start)
  const dateEnd = toLocalDateString(end)

  const absencesQuery = useAbsences({ dateStart, dateEnd })
  const holidaysQuery = useHolidays()

  const isLoading = teamMembersQuery.isLoading || assignmentsQuery.isLoading || absencesQuery.isLoading || holidaysQuery.isLoading

  const handleExport = () => {
    try {
      setIsExporting(true)

      const html = generateScheduleHtml({
        teamMembers: teamMembersQuery.data?.teamMembers ?? [],
        assignments: assignmentsQuery.data?.assignments ?? [],
        absences: absencesQuery.data?.absences ?? [],
        holidays: holidaysQuery.data?.holidays ?? [],
        year,
        quarter,
      })

      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `schedule_${year}${quarter ? '_Q' + quarter : '_full'}.html`
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('Schedule exported')
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isLoading || isExporting}
      onClick={handleExport}
    >
      <Download className="mr-1.5 h-4 w-4" />
      {isExporting ? 'Exporting...' : 'Export HTML'}
    </Button>
  )
}
