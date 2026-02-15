import { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { ReportMetadata } from '../types'

interface MetadataEditorProps {
  /** LLM-extracted metadata (read-only reference) */
  extractedMetadata: ReportMetadata
  /** Current editable metadata values */
  metadata: ReportMetadata
  /** Callback when user edits metadata */
  onMetadataChange: (metadata: ReportMetadata) => void
  disabled?: boolean
}

const FIELD_DEFS: {
  key: keyof ReportMetadata
  label: string
  type: 'text' | 'date' | 'textarea'
}[] = [
  { key: 'clientName', label: 'Client Name', type: 'text' },
  { key: 'projectCode', label: 'Project Code', type: 'text' },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'endDate', label: 'End Date', type: 'date' },
  { key: 'scopeSummary', label: 'Scope Summary', type: 'textarea' },
]

export function MetadataEditor({
  extractedMetadata,
  metadata,
  onMetadataChange,
  disabled = false,
}: MetadataEditorProps) {
  // Local state for immediate updates
  const [local, setLocal] = useState<ReportMetadata>(metadata)

  // Sync external changes
  useEffect(() => {
    setLocal(metadata)
  }, [metadata])

  const handleChange = useCallback(
    (key: keyof ReportMetadata, value: string) => {
      const updated = { ...local, [key]: value }
      setLocal(updated)
      onMetadataChange(updated)
    },
    [local, onMetadataChange],
  )

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Report Metadata</h3>
      <p className="text-xs text-muted-foreground">
        LLM-extracted values are shown on the left. Edit the values on the right to correct any sanitized placeholders or inaccuracies.
      </p>

      <div className="rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[140px_1fr_1fr] gap-0 border-b bg-muted/30">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
            Field
          </div>
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-l">
            Extracted (read-only)
          </div>
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-l">
            Editable
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y">
          {FIELD_DEFS.map(({ key, label, type }) => (
            <div
              key={key}
              className="grid grid-cols-[140px_1fr_1fr] gap-0 items-start"
            >
              {/* Label */}
              <div className="px-3 py-3 text-sm font-medium bg-muted/10">
                <Label className="text-xs">{label}</Label>
              </div>

              {/* Extracted (read-only) */}
              <div className="px-3 py-3 border-l bg-muted/5">
                <span className="text-sm text-muted-foreground italic">
                  {extractedMetadata[key] || '(not detected)'}
                </span>
              </div>

              {/* Editable */}
              <div className="px-3 py-3 border-l">
                {type === 'textarea' ? (
                  <Textarea
                    value={local[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={disabled}
                    rows={3}
                    className="text-sm resize-none"
                    placeholder={`Enter ${label.toLowerCase()}...`}
                  />
                ) : type === 'date' ? (
                  <Input
                    type="date"
                    value={local[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={disabled}
                    className="text-sm"
                  />
                ) : (
                  <Input
                    type="text"
                    value={local[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={disabled}
                    className="text-sm"
                    placeholder={`Enter ${label.toLowerCase()}...`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
