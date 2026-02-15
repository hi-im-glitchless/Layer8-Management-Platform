import { useState, useCallback, useEffect, useRef } from 'react'
import { Send, AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useReportChat } from '../hooks'

const DEFAULT_MAX_ITERATIONS = 5

interface ReportChatPanelProps {
  sessionId: string
  /** Current iteration count (from server session) */
  iterationCount: number
  /** Soft limit for iteration warnings */
  maxIterations?: number
  /** Called when a section_update event arrives */
  onSectionUpdate?: (sectionKey: string, text: string) => void
}

export function ReportChatPanel({
  sessionId,
  iterationCount,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  onSectionUpdate,
}: ReportChatPanelProps) {
  const [chatInput, setChatInput] = useState('')
  const chat = useReportChat(sessionId)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const localIterations = iterationCount + chat.messages.filter((m) => m.role === 'user').length
  const showWarning = localIterations >= maxIterations

  // Propagate section updates to parent
  useEffect(() => {
    if (chat.latestSectionUpdate && onSectionUpdate) {
      onSectionUpdate(chat.latestSectionUpdate.sectionKey, chat.latestSectionUpdate.text)
    }
  }, [chat.latestSectionUpdate, onSectionUpdate])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  const handleSend = useCallback(() => {
    const trimmed = chatInput.trim()
    if (!trimmed) return
    chat.sendMessage(trimmed)
    setChatInput('')
  }, [chatInput, chat])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Report Corrections</CardTitle>
        <Badge variant="secondary" className="text-[10px]">
          Iteration {localIterations}/{maxIterations}
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* Soft warning after reaching iteration limit */}
        {showWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3 text-xs mb-3">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span className="text-yellow-800 dark:text-yellow-200">
              You have used {localIterations} iterations. Consider accepting the current result or regenerating.
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[180px]">
          {chat.messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">
                Describe what you'd like to change in the report.
                Reference specific sections by name.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                {['executive summary', 'recommendations', 'conclusion', 'risk score', 'compliance'].map(
                  (hint) => (
                    <Badge
                      key={hint}
                      variant="outline"
                      className="text-[10px] cursor-pointer hover:bg-muted"
                      onClick={() => setChatInput(`Make the ${hint} `)}
                    >
                      {hint}
                    </Badge>
                  ),
                )}
              </div>
            </div>
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
          {chat.isStreaming && chat.messages[chat.messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <span className="inline-block w-1.5 h-4 bg-foreground/50 animate-pulse" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Section update badge */}
        {chat.latestSectionUpdate && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 p-2 text-xs mb-3">
            <RefreshCw className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <span className="text-emerald-700 dark:text-emerald-300">
              Updated: {chat.latestSectionUpdate.sectionKey.replace(/_/g, ' ')} -- rebuilding PDF...
            </span>
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe changes..."
            disabled={chat.isStreaming}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSend}
            disabled={chat.isStreaming || !chatInput.trim()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
