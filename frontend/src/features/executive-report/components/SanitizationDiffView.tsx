import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SanitizedParagraph, SanitizedEntity } from '../types'

/** Color mapping for entity types */
const ENTITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PERSON: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Person' },
  ORG: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'Organization' },
  ORGANIZATION: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'Organization' },
  IP_ADDRESS: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', label: 'IP Address' },
  EMAIL_ADDRESS: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', label: 'Email' },
  PHONE_NUMBER: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', label: 'Phone' },
  LOCATION: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Location' },
  URL: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'URL' },
  DATE_TIME: { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', label: 'Date/Time' },
  DENY_LIST: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Deny List' },
}

const DEFAULT_ENTITY_COLOR = { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', label: 'Other' }

function getEntityColor(type: string) {
  return ENTITY_COLORS[type.toUpperCase()] ?? DEFAULT_ENTITY_COLOR
}

/**
 * Render sanitized text with highlighted entity replacements.
 * Uses entity start/end positions in the sanitized text to wrap replaced text in <mark> spans.
 */
function HighlightedText({ text, entities }: { text: string; entities: SanitizedEntity[] }) {
  if (entities.length === 0) {
    return <span>{text}</span>
  }

  // Sort entities by start position
  const sorted = [...entities].sort((a, b) => a.start - b.start)

  const parts: JSX.Element[] = []
  let lastEnd = 0

  sorted.forEach((entity, i) => {
    // Text before this entity
    if (entity.start > lastEnd) {
      parts.push(<span key={`text-${i}`}>{text.slice(lastEnd, entity.start)}</span>)
    }

    const color = getEntityColor(entity.type)
    parts.push(
      <mark
        key={`entity-${i}`}
        className={cn(
          'rounded px-0.5 py-0 font-medium',
          color.bg,
          color.text,
        )}
        title={`${entity.type}: "${entity.text}" -> "${entity.placeholder}"`}
      >
        {text.slice(entity.start, entity.end)}
      </mark>,
    )

    lastEnd = entity.end
  })

  // Remaining text
  if (lastEnd < text.length) {
    parts.push(<span key="text-end">{text.slice(lastEnd)}</span>)
  }

  return <>{parts}</>
}

interface SanitizationDiffViewProps {
  paragraphs: SanitizedParagraph[]
}

export function SanitizationDiffView({ paragraphs }: SanitizationDiffViewProps) {
  // Filter out empty paragraphs
  const nonEmpty = useMemo(
    () => paragraphs.filter((p) => p.original.trim().length > 0),
    [paragraphs],
  )

  // Collect unique entity types for legend
  const entityTypes = useMemo(() => {
    const types = new Set<string>()
    nonEmpty.forEach((p) => p.entities.forEach((e) => types.add(e.type.toUpperCase())))
    return Array.from(types).sort()
  }, [nonEmpty])

  // Summary stats
  const totalEntities = useMemo(
    () => nonEmpty.reduce((sum, p) => sum + p.entities.length, 0),
    [nonEmpty],
  )
  const paragraphsWithEntities = useMemo(
    () => nonEmpty.filter((p) => p.entities.length > 0).length,
    [nonEmpty],
  )

  if (nonEmpty.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-sm text-muted-foreground">No paragraphs to display.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Entity type legend */}
      {entityTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entityTypes.map((type) => {
            const color = getEntityColor(type)
            return (
              <Badge
                key={type}
                variant="outline"
                className={cn('text-xs', color.bg, color.text)}
              >
                {color.label}
              </Badge>
            )
          })}
        </div>
      )}

      {/* Summary */}
      <p className="text-xs text-muted-foreground">
        {totalEntities} {totalEntities === 1 ? 'entity' : 'entities'} detected across{' '}
        {paragraphsWithEntities} {paragraphsWithEntities === 1 ? 'paragraph' : 'paragraphs'}
      </p>

      {/* Side-by-side diff */}
      <div className="rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-2 border-b bg-muted/30">
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-r">
            Original
          </div>
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">
            Sanitized
          </div>
        </div>

        {/* Paragraphs */}
        <div className="max-h-[60vh] overflow-y-auto divide-y">
          {nonEmpty.map((paragraph) => (
            <div key={paragraph.index} className="grid grid-cols-2">
              {/* Original */}
              <div className="px-4 py-3 text-sm border-r bg-background">
                <span className="text-muted-foreground/50 text-xs mr-2">#{paragraph.index}</span>
                {paragraph.original}
              </div>
              {/* Sanitized */}
              <div className="px-4 py-3 text-sm bg-background">
                <span className="text-muted-foreground/50 text-xs mr-2">#{paragraph.index}</span>
                <HighlightedText text={paragraph.sanitized} entities={paragraph.entities} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
