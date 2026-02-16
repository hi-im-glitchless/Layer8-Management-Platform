import { useState, useCallback, useMemo } from 'react'
import { CheckCircle, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HtmlReportPreview } from './HtmlReportPreview'
import { useReportSession } from '../hooks'
import { ReportChatPanel } from './ReportChatPanel'
import type { EntityMapping } from '../types'

interface StepReviewProps {
  sessionId: string
  onSatisfied: () => void
  onRegenerate: () => void
}

/**
 * Build a placeholder -> originalValue lookup from entity mappings
 * for frontend-only de-sanitization.
 */
function buildDesanitizeMap(mappings: EntityMapping[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of mappings) {
    if (m.placeholder && m.originalValue) {
      map[m.placeholder] = m.originalValue
    }
  }
  return map
}

/**
 * Apply de-sanitization: replace all [ENTITY_TYPE_N] placeholders
 * with their original values using simple string replacement.
 */
function desanitizeHtml(html: string, desanitizeMap: Record<string, string>): string {
  let result = html
  for (const [placeholder, originalValue] of Object.entries(desanitizeMap)) {
    result = result.replaceAll(placeholder, originalValue)
  }
  return result
}

export function StepReview({ sessionId, onSatisfied, onRegenerate }: StepReviewProps) {
  const sessionQuery = useReportSession(sessionId)
  const [showRealValues, setShowRealValues] = useState(false)

  const generatedHtml = sessionQuery.data?.generatedHtml ?? ''
  const entityMappings = sessionQuery.data?.entityMappings ?? []
  const chatIterationCount = sessionQuery.data?.chatIterationCount ?? 0
  const hasHtml = !!generatedHtml

  // Build de-sanitization map from entity mappings
  const desanitizeMap = useMemo(
    () => buildDesanitizeMap(entityMappings),
    [entityMappings],
  )

  // Compute the HTML to display based on toggle state
  const displayHtml = useMemo(() => {
    if (!generatedHtml) return ''
    if (showRealValues) {
      return desanitizeHtml(generatedHtml, desanitizeMap)
    }
    return generatedHtml
  }, [generatedHtml, showRealValues, desanitizeMap])

  // When a section_update arrives via chat, refetch session to get updated generatedHtml
  const handleSectionUpdate = useCallback(
    (_sectionKey: string, _text: string) => {
      sessionQuery.refetch()
    },
    [sessionQuery],
  )

  // Toggle de-sanitization
  const toggleDesanitize = useCallback(() => {
    setShowRealValues((prev) => !prev)
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review Executive Report</CardTitle>
          <CardDescription>
            Preview the generated report. Use the chat panel to request corrections
            to specific sections, or regenerate the entire report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant={showRealValues ? 'default' : 'outline'}
              size="sm"
              onClick={toggleDesanitize}
              disabled={!hasHtml}
            >
              {showRealValues ? (
                <EyeOff className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              )}
              {showRealValues ? 'Show Sanitized' : 'Show Real Values'}
            </Button>
            <Badge variant={showRealValues ? 'destructive' : 'secondary'} className="text-xs">
              {showRealValues ? 'De-sanitized' : 'Sanitized'}
            </Badge>
          </div>

          {/* Split layout: HTML preview (left/top 60%) + Chat (right/bottom 40%) */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* HTML Preview Panel */}
            <div className="flex-[3] min-w-0">
              <HtmlReportPreview
                html={displayHtml}
                className="min-h-[600px]"
              />
            </div>

            {/* Chat Panel */}
            <div className="flex-[2] min-w-0 lg:min-w-[320px]">
              <ReportChatPanel
                sessionId={sessionId}
                iterationCount={chatIterationCount}
                onSectionUpdate={handleSectionUpdate}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onRegenerate}
        >
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          Regenerate
        </Button>
        <Button
          variant="gradient"
          onClick={onSatisfied}
          disabled={!hasHtml}
          className="min-w-[180px]"
        >
          <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
          Satisfied -- Continue
        </Button>
      </div>
    </div>
  )
}
