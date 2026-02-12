import { useCallback, useRef, useState } from 'react';
import { startLLMStream, type LLMStreamOptions } from '@/lib/llm-api';

export interface StreamingState {
  content: string;
  isStreaming: boolean;
  isWaiting: boolean;
  error: string | null;
  usage?: { inputTokens: number; outputTokens: number };
}

const initialState: StreamingState = {
  content: '',
  isStreaming: false,
  isWaiting: false,
  error: null,
};

/**
 * Parse SSE lines from a text/event-stream response.
 * Handles `event:` and `data:` fields per the SSE spec.
 */
function parseSSELines(
  buffer: string,
  onEvent: (event: string, data: string) => void
): string {
  const lines = buffer.split('\n');
  // Keep the last potentially incomplete line in the buffer
  const remaining = lines.pop() ?? '';

  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      currentData = line.slice(5).trim();
    } else if (line === '') {
      // Empty line = event dispatch
      if (currentEvent && currentData) {
        onEvent(currentEvent, currentData);
      }
      currentEvent = '';
      currentData = '';
    }
  }

  return remaining;
}

export function useStreamingLLM() {
  const [state, setState] = useState<StreamingState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<string>('');
  const lastOptionsRef = useRef<LLMStreamOptions | undefined>(undefined);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      isWaiting: false,
    }));
  }, []);

  const startStream = useCallback(
    async (prompt: string, options?: LLMStreamOptions) => {
      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      lastPromptRef.current = prompt;
      lastOptionsRef.current = options;

      // Reset state, set waiting
      setState({
        content: '',
        isStreaming: false,
        isWaiting: true,
        error: null,
      });

      try {
        const response = await startLLMStream(prompt, {
          ...options,
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let sseBuffer = '';
        let accumulatedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          sseBuffer = parseSSELines(sseBuffer, (event, data) => {
            if (event === 'delta') {
              try {
                const parsed = JSON.parse(data) as { text: string };
                accumulatedContent += parsed.text;
                setState((prev) => ({
                  ...prev,
                  content: accumulatedContent,
                  isWaiting: false,
                  isStreaming: true,
                }));
              } catch {
                // Ignore malformed delta
              }
            } else if (event === 'done') {
              try {
                const parsed = JSON.parse(data) as {
                  usage?: { inputTokens: number; outputTokens: number };
                };
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  isWaiting: false,
                  usage: parsed.usage,
                }));
              } catch {
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  isWaiting: false,
                }));
              }
            } else if (event === 'error') {
              try {
                const parsed = JSON.parse(data) as { message: string };
                setState((prev) => ({
                  ...prev,
                  error: parsed.message,
                  isStreaming: false,
                  isWaiting: false,
                }));
              } catch {
                setState((prev) => ({
                  ...prev,
                  error: 'An unknown error occurred',
                  isStreaming: false,
                  isWaiting: false,
                }));
              }
            }
          });
        }

        // Stream ended naturally -- ensure final state
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          isWaiting: false,
        }));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled -- keep partial content, just stop streaming
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            isWaiting: false,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'An unknown error occurred',
          isStreaming: false,
          isWaiting: false,
        }));
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    []
  );

  const retry = useCallback(() => {
    if (lastPromptRef.current) {
      startStream(lastPromptRef.current, lastOptionsRef.current);
    }
  }, [startStream]);

  return { state, startStream, stopStream, retry };
}
