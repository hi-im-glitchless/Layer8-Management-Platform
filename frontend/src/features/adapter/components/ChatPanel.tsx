import { useState, useCallback, useEffect, useRef } from 'react'
import { Send, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAdapterChat } from '../hooks'
import type { MappingPlan } from '../types'

const DEFAULT_MAX_ITERATIONS = 5

interface ChatPanelProps {
  sessionId: string
  /** Called when the chat yields a mapping_update event */
  onMappingUpdate?: (plan: MappingPlan) => void
  /** Current iteration count (from server session) */
  iterationCount: number
  /** Soft limit for iteration warnings */
  maxIterations?: number
}

export function ChatPanel({
  sessionId,
  onMappingUpdate,
  iterationCount,
  maxIterations = DEFAULT_MAX_ITERATIONS,
}: ChatPanelProps) {
  const [chatInput, setChatInput] = useState('')
  const chat = useAdapterChat(sessionId)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const localIterations = iterationCount + chat.messages.filter((m) => m.role === 'user').length
  const showWarning = localIterations >= maxIterations

  // Propagate mapping updates to parent
  useEffect(() => {
    if (chat.latestMappingUpdate && onMappingUpdate) {
      onMappingUpdate(chat.latestMappingUpdate)
    }
  }, [chat.latestMappingUpdate, onMappingUpdate])

  // Auto-scroll
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
        <CardTitle className="text-base">Iterative Feedback</CardTitle>
        <Badge variant="secondary" className="text-[10px]">
          Iteration {localIterations}/{maxIterations}
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* Soft warning */}
        {showWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3 text-xs mb-3">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span className="text-yellow-800 dark:text-yellow-200">
              You have used {localIterations} iterations. Consider accepting the current result or restarting.
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[180px]">
          {chat.messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Describe changes you want to see in the adapted template.
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
          {chat.isStreaming && chat.messages[chat.messages.length - 1]?.role !== 'assistant' && (
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
