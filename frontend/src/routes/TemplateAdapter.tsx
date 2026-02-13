import { useState, useEffect, useCallback, Component, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useActiveSession } from '@/features/adapter/hooks'
import { WizardShell } from '@/features/adapter/components/WizardShell'

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

      {/* Wizard with error boundary */}
      <WizardErrorBoundary>
        <WizardShell
          sessionId={sessionId}
          onSessionCreate={handleSessionCreate}
          onSessionClear={handleSessionClear}
        />
      </WizardErrorBoundary>
    </div>
  )
}
