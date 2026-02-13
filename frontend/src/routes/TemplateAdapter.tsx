import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useActiveSession } from '@/features/adapter/hooks'
import { WizardShell } from '@/features/adapter/components/WizardShell'

export function TemplateAdapter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sessionId, setSessionId] = useState<string | null>(
    searchParams.get('session'),
  )

  // Check for active session on mount (for auto-resume)
  const activeSessionQuery = useActiveSession()

  // Auto-resume: if no session in URL but server has an active session, use it
  useEffect(() => {
    if (!sessionId && activeSessionQuery.data?.session) {
      const activeId = activeSessionQuery.data.session.sessionId
      setSessionId(activeId)
      setSearchParams({ session: activeId }, { replace: true })
    }
  }, [sessionId, activeSessionQuery.data, setSearchParams])

  const handleSessionCreate = useCallback(
    (id: string) => {
      setSessionId(id)
      setSearchParams({ session: id }, { replace: true })
    },
    [setSearchParams],
  )

  const handleSessionClear = useCallback(() => {
    setSessionId(null)
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Template Adapter</h1>
        <p className="text-muted-foreground mt-2">
          Upload a DOCX template and adapt it for Ghostwriter with AI-powered field mapping.
        </p>
      </div>

      {/* Wizard */}
      <WizardShell
        sessionId={sessionId}
        onSessionCreate={handleSessionCreate}
        onSessionClear={handleSessionClear}
      />
    </div>
  )
}
