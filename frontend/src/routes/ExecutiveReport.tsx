import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useActiveReportSession } from '@/features/executive-report/hooks'
import { ReportWizardShell } from '@/features/executive-report/components/ReportWizardShell'

const SESSION_STORAGE_KEY = 'report-active-session'

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class WizardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" aria-hidden="true" />
            <p className="text-destructive font-medium">Something went wrong</p>
            <p className="text-sm text-muted-foreground mt-2">
              {this.state.error?.message || 'An unexpected error occurred in the wizard.'}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export function ExecutiveReport() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Resolve initial sessionId: URL param > sessionStorage > null
  const [sessionId, setSessionId] = useState<string | null>(() => {
    const fromUrl = searchParams.get('session')
    if (fromUrl) return fromUrl
    return sessionStorage.getItem(SESSION_STORAGE_KEY)
  })

  // Track whether the user manually cleared the session (prevents auto-resume race)
  const manualClearRef = useRef(false)

  // Check for active session on mount (for auto-resume)
  const activeSessionQuery = useActiveReportSession()

  // Sync sessionId to sessionStorage whenever it changes
  useEffect(() => {
    if (sessionId) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId)
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [sessionId])

  // Sync URL param if we restored from sessionStorage but URL is missing it
  useEffect(() => {
    if (sessionId && !searchParams.get('session')) {
      setSearchParams({ session: sessionId }, { replace: true })
    }
  }, [sessionId, searchParams, setSearchParams])

  // Auto-resume: if no session locally but server has an active session, use it
  useEffect(() => {
    if (manualClearRef.current) return
    if (!sessionId && activeSessionQuery.data?.session) {
      const activeId = activeSessionQuery.data.session.sessionId
      setSessionId(activeId)
      setSearchParams({ session: activeId }, { replace: true })
    }
  }, [sessionId, activeSessionQuery.data, setSearchParams])

  const handleSessionCreate = useCallback(
    (id: string) => {
      manualClearRef.current = false
      setSessionId(id)
      setSearchParams({ session: id }, { replace: true })
    },
    [setSearchParams],
  )

  const handleSessionClear = useCallback(() => {
    manualClearRef.current = true
    setSessionId(null)
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executive Report Generator</h1>
        <p className="text-muted-foreground mt-2">
          Upload a technical pentest report and generate a professional executive summary with
          automated sanitization, risk scoring, and chart generation.
        </p>
      </div>

      {/* Wizard with error boundary */}
      <WizardErrorBoundary>
        <ReportWizardShell
          sessionId={sessionId}
          onSessionCreate={handleSessionCreate}
          onSessionClear={handleSessionClear}
        />
      </WizardErrorBoundary>
    </div>
  )
}
