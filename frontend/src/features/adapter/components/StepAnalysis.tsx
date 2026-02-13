import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Send, ArrowRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAnalyzeTemplate, useAnalyzeFromSession, useAdapterChat, useWizardSession } from '../hooks'
import { MappingTable } from './MappingTable'
import type { TemplateType, TemplateLanguage, MappingPlan } from '../types'

interface StepAnalysisProps {
  sessionId: string
  file: File | null
  templateType: TemplateType
  language: TemplateLanguage
  initialMappingPlan: MappingPlan | null
  onMappingUpdate: (plan: MappingPlan) => void
  onProceed: () => void
}

/** Format seconds as "Xm Ys" or "Xs" */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function StepAnalysis({
  sessionId,
  file,
  templateType,
  language,
  initialMappingPlan,
  onMappingUpdate,
  onProceed,
}: StepAnalysisProps) {
  const [mappingPlan, setMappingPlan] = useState<MappingPlan | null>(initialMappingPlan)
  const [chatInput, setChatInput] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const analyzeMutation = useAnalyzeTemplate()
  const analyzeFromSessionMutation = useAnalyzeFromSession()
  const chat = useAdapterChat(sessionId)
  const hasTriggeredAnalysis = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // The active mutation (either file-based or session-based)
  const isAnalyzing = analyzeMutation.isPending || analyzeFromSessionMutation.isPending
  const analyzeError = analyzeMutation.error || analyzeFromSessionMutation.error
  const isError = analyzeMutation.isError || analyzeFromSessionMutation.isError

  // Elapsed timer while analyzing
  useEffect(() => {
    if (!isAnalyzing || mappingPlan) return
    setElapsed(0)
    const interval = setInterval(() => setElapsed((prev) => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [isAnalyzing, mappingPlan])

  // Poll session as fallback — if the HTTP response is lost (e.g. timeout),
  // the server-side session still has the mapping plan from the completed analysis.
  // Start polling after 30s, check every 10s.
  const sessionPoll = useWizardSession(
    isAnalyzing && !mappingPlan && elapsed >= 30 ? sessionId : null,
  )

  useEffect(() => {
    if (!isAnalyzing || mappingPlan) return
    if (elapsed >= 30 && elapsed % 10 === 0 && sessionPoll.data?.analysis?.mappingPlan) {
      const serverPlan = sessionPoll.data.analysis.mappingPlan as unknown as MappingPlan
      if (serverPlan?.entries?.length) {
        setMappingPlan(serverPlan)
        onMappingUpdate(serverPlan)
        toast.success('Template analysis complete')
      }
    }
  }, [elapsed, isAnalyzing, mappingPlan, sessionPoll.data, onMappingUpdate])

  // Also refetch session poll periodically
  useEffect(() => {
    if (!isAnalyzing || mappingPlan || elapsed < 30) return
    if (elapsed % 10 === 0) {
      sessionPoll.refetch()
    }
  }, [elapsed, isAnalyzing, mappingPlan, sessionPoll])

  // Auto-trigger analysis on mount if no mapping plan yet
  useEffect(() => {
    if (!mappingPlan && !hasTriggeredAnalysis.current && !isAnalyzing) {
      hasTriggeredAnalysis.current = true

      if (file) {
        // File available (same session) — use multipart upload
        analyzeMutation.mutate(
          { file, templateType, language },
          {
            onSuccess: (data) => {
              setMappingPlan(data.mappingPlan)
              onMappingUpdate(data.mappingPlan)
              toast.success('Template analysis complete')
            },
          },
        )
      } else if (sessionId) {
        // No file (page refresh) — use session-based analysis
        analyzeFromSessionMutation.mutate(sessionId, {
          onSuccess: (data) => {
            setMappingPlan(data.mappingPlan)
            onMappingUpdate(data.mappingPlan)
            toast.success('Template analysis complete')
          },
        })
      }
    }
  }, [mappingPlan, file, sessionId, templateType, language, analyzeMutation, analyzeFromSessionMutation, isAnalyzing, onMappingUpdate])

  // Watch for mapping updates from chat
  useEffect(() => {
    if (chat.latestMappingUpdate) {
      setMappingPlan(chat.latestMappingUpdate)
      onMappingUpdate(chat.latestMappingUpdate)
    }
  }, [chat.latestMappingUpdate, onMappingUpdate])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  const handleSendMessage = useCallback(() => {
    const trimmed = chatInput.trim()
    if (!trimmed) return
    chat.sendMessage(trimmed)
    setChatInput('')
  }, [chatInput, chat])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage()
      }
    },
    [handleSendMessage],
  )

  const handleReAnalyze = useCallback(() => {
    hasTriggeredAnalysis.current = true
    if (file) {
      analyzeMutation.mutate(
        { file, templateType, language },
        {
          onSuccess: (data) => {
            setMappingPlan(data.mappingPlan)
            onMappingUpdate(data.mappingPlan)
            toast.success('Re-analysis complete')
          },
        },
      )
    } else if (sessionId) {
      analyzeFromSessionMutation.mutate(sessionId, {
        onSuccess: (data) => {
          setMappingPlan(data.mappingPlan)
          onMappingUpdate(data.mappingPlan)
          toast.success('Re-analysis complete')
        },
      })
    }
  }, [file, sessionId, templateType, language, analyzeMutation, analyzeFromSessionMutation, onMappingUpdate])

  // Loading state
  if (isAnalyzing && !mappingPlan) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground mt-4">Analyzing template structure...</p>
          <p className="text-xs text-muted-foreground mt-1">
            The LLM is identifying sections and mapping them to Ghostwriter fields.
          </p>
          <p className="text-xs text-muted-foreground mt-3 tabular-nums">
            Elapsed: {formatElapsed(elapsed)}
          </p>
          {elapsed >= 60 && (
            <p className="text-xs text-muted-foreground mt-1">
              Large templates can take 2-3 minutes.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // Error state (no mapping plan loaded)
  if (isError && !mappingPlan) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-destructive font-medium">Analysis failed</p>
          <p className="text-sm text-muted-foreground mt-2">
            {(analyzeError as Error)?.message || 'Unknown error'}
          </p>
          <Button variant="outline" className="mt-4" onClick={handleReAnalyze}>
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Retry Analysis
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Left: Mapping Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Mapping Plan</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
              )}
              Re-analyze
            </Button>
            <Button variant="gradient" size="sm" onClick={onProceed} disabled={!mappingPlan}>
              Proceed
              <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mappingPlan ? (
            <MappingTable mappingPlan={mappingPlan} />
          ) : (
            <p className="text-sm text-muted-foreground">No mapping data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Right: Chat Panel */}
      <Card className="flex flex-col max-h-[600px]">
        <CardHeader>
          <CardTitle className="text-base">Refinement Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[200px]">
            {chat.messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Ask the AI to adjust mappings, add fields, or change confidence thresholds.
              </p>
            )}
            {chat.messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {chat.isStreaming && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <span className="inline-block w-1.5 h-4 bg-foreground/50 animate-pulse" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Refine the mapping..."
              disabled={chat.isStreaming}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSendMessage}
              disabled={chat.isStreaming || !chatInput.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
