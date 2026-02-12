# Phase 3: LLM Integration - Research

**Researched:** 2026-02-11
**Domain:** Multi-provider LLM client with SSE streaming, compliance-grade logging, and streaming UI components
**Confidence:** HIGH

## Summary

Phase 3 establishes production-grade LLM integration with streaming responses, provider fallback, and compliance-grade audit logging. The research confirms CLIProxyAPI (OpenAI-compatible) as the primary provider with Anthropic API fallback, using standard Node.js/TypeScript patterns for SSE streaming.

The backend uses OpenAI SDK (v4+) with custom baseURL configuration for CLIProxyAPI compatibility, Express.js SSE streaming patterns, and exponential backoff retry logic. The frontend uses Streamdown (drop-in react-markdown replacement) for streaming Markdown rendering with typewriter effects, EventSource API for SSE client connections, and AbortController for stream cancellation.

Critical patterns are well-established: Server-Sent Events for real-time streaming, OpenAI SDK compatibility for multi-provider switching, incremental Markdown parsing to prevent re-parsing entire document on every chunk, and audit logging integration with existing hash-chain infrastructure from Phase 1.

**Primary recommendation:** Use OpenAI SDK for both CLIProxyAPI (primary) and Anthropic API (fallback) with OpenAI-compatible endpoint. Use Streamdown for streaming Markdown rendering (designed specifically for AI streaming, handles incomplete blocks). Integrate LLM audit logging into existing Phase 1 audit infrastructure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Streaming UX:**
- Typewriter effect for streaming output — characters appear smoothly with a blinking cursor
- Pulsing dots ("...") animation while waiting for the first token to arrive
- Real-time Markdown rendering during streaming (bold, headers, lists render as they arrive)
- "Stop generating" button visible during active streaming so users can cancel

**Provider switching & fallback:**
- CLIProxyAPI is the primary provider and may be the only one initially (no Anthropic API key available at launch)
- CLIProxyAPI base URL is fixed — no endpoint configuration needed from the admin
- Admin settings page shows CLIProxyAPI status (running/not running)
- If not running, settings page offers a button to start it
- Only if CLIProxyAPI cannot start does the system prompt to configure Anthropic API fallback
- Auto-switch to fallback is seamless when configured — no user intervention needed per-request
- API keys configured via Admin settings UI (not environment variables)
- Single configured model — no per-request model selection

**Error & retry experience:**
- On mid-stream failure: keep partial output visible with error banner and retry button below
- Manual retry button only — no auto-retry (avoids burning credits on unresolvable issues)
- Technical, actionable error messages (e.g., "CLIProxyAPI connection refused. Check that the service is running, or switch to API fallback in Settings.")
- Show input/output token count after generation completes (not during streaming)

**Audit & compliance display:**
- Full sanitized prompt and full response stored in audit log (GDPR proof of what LLM saw)
- Admin can expand audit entries to view full prompt and response content
- System-wide token usage totals only — no per-user tracking (internal company tool, no billing)
- Provider used (CLIProxy vs API) not logged — not relevant for auditing

### Claude's Discretion

- Typewriter animation speed/smoothness tuning
- SSE chunking and buffering strategy
- Exact Markdown parser choice for streaming rendering
- Exponential backoff parameters for transient failures
- Audit log entry format and storage schema

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core Backend LLM

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | 4.x | OpenAI SDK for CLIProxyAPI | Official SDK, supports custom baseURL for CLIProxyAPI compatibility, streaming with async iterators, built-in retry logic |
| @anthropic-ai/sdk | 0.x | Anthropic SDK for API fallback | Official SDK, TypeScript-first, supports OpenAI-compatible endpoints via baseURL, streaming SSE support |
| exponential-backoff | 1.x | Retry logic utility | Bounded retries with jitter, prevents thundering herd, configurable backoff parameters |

**Installation (backend):**
```bash
npm install openai @anthropic-ai/sdk exponential-backoff
```

### Core Frontend Streaming UI

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| streamdown | latest | Streaming Markdown renderer | Drop-in react-markdown replacement, designed for AI streaming, handles incomplete/unterminated blocks, incremental O(n) parsing |
| lucide-react | latest | Icons (already installed) | Typewriter cursor, stop button, loading spinner icons |

**Installation (frontend):**
```bash
npm install streamdown
```

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortController | Native | Stream cancellation | Built into Node.js 16+, cancel SSE streams, timeout handling |
| EventSource | Native | SSE client | Built into browsers, auto-reconnect on connection loss, Last-Event-ID support |
| @tanstack/react-query | 5.x (installed) | Server state management | Cache LLM responses, optimistic UI updates, refetch on error |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Streamdown | react-markdown | react-markdown re-parses entire document on every chunk (O(n²)), visual glitches with incomplete blocks. Streamdown handles AI streaming natively. |
| OpenAI SDK | Direct fetch + SSE parsing | OpenAI SDK handles SSE parsing, retries, errors, AbortController integration. Hand-rolling is error-prone. |
| Anthropic SDK | OpenAI SDK only | Anthropic SDK needed for native Anthropic API. OpenAI SDK works for CLIProxyAPI. Use both for fallback. |
| Native EventSource | @microsoft/fetch-event-source | Native EventSource simpler, auto-reconnect built-in. Microsoft library needed only if custom headers required per-request. |
| exponential-backoff npm | Custom retry logic | exponential-backoff handles jitter, max delay cap, bounded attempts. Custom logic prone to thundering herd problem. |

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── services/
│   ├── llm/
│   │   ├── client.ts          # LLM client factory (CLIProxy + Anthropic fallback)
│   │   ├── streaming.ts       # SSE streaming utilities
│   │   ├── retry.ts           # Exponential backoff wrapper
│   │   └── providers/
│   │       ├── cliproxy.ts    # CLIProxyAPI provider (OpenAI SDK)
│   │       └── anthropic.ts   # Anthropic API provider
│   ├── audit.ts               # Existing audit logging (extend for LLM)
│   └── settings.ts            # Admin settings storage (API keys, config)
├── routes/
│   ├── llm.ts                 # POST /llm/generate (SSE endpoint)
│   └── admin.ts               # Settings CRUD, provider status check
└── types/
    └── llm.ts                 # LLM request/response types

frontend/src/
├── components/
│   ├── llm/
│   │   ├── StreamingResponse.tsx  # Streamdown wrapper with typewriter
│   │   ├── LoadingIndicator.tsx   # Pulsing dots animation
│   │   ├── StopButton.tsx         # Cancel stream button
│   │   └── ErrorBanner.tsx        # Mid-stream error display
│   └── admin/
│       └── LLMSettings.tsx        # Provider config, status, API keys
├── hooks/
│   └── useStreamingLLM.ts         # EventSource SSE hook
└── lib/
    └── llm-api.ts                 # LLM API client (POST /llm/generate)
```

### Pattern 1: Multi-Provider LLM Client with Fallback

**What:** Factory pattern that tries CLIProxyAPI first, falls back to Anthropic API on failure

**When to use:** All LLM generation requests

**Example:**
```typescript
// backend/src/services/llm/client.ts
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getSettings } from '../settings.js';

export type LLMProvider = 'cliproxy' | 'anthropic';

export interface LLMClientConfig {
  provider: LLMProvider;
  cliproxyBaseUrl?: string;
  anthropicApiKey?: string;
  model: string;
}

export class LLMClient {
  private cliproxyClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = config;

    // Initialize CLIProxyAPI client (OpenAI SDK with custom base URL)
    if (config.cliproxyBaseUrl) {
      this.cliproxyClient = new OpenAI({
        baseURL: config.cliproxyBaseUrl,
        apiKey: 'not-needed', // CLIProxyAPI doesn't require API key
      });
    }

    // Initialize Anthropic fallback
    if (config.anthropicApiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: config.anthropicApiKey,
      });
    }
  }

  /**
   * Generate with automatic fallback
   */
  async *generateStream(prompt: string): AsyncGenerator<{
    text: string;
    provider: LLMProvider;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    // Try CLIProxyAPI first
    if (this.cliproxyClient) {
      try {
        yield* this.streamFromCLIProxy(prompt);
        return;
      } catch (error) {
        console.error('CLIProxyAPI failed, falling back to Anthropic:', error);
      }
    }

    // Fallback to Anthropic
    if (this.anthropicClient) {
      yield* this.streamFromAnthropic(prompt);
      return;
    }

    throw new Error('No LLM provider available');
  }

  private async *streamFromCLIProxy(prompt: string) {
    const stream = await this.cliproxyClient!.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    let totalTokens = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        yield { text, provider: 'cliproxy' as LLMProvider };
      }

      // Track usage (sent in last chunk)
      if (chunk.usage) {
        totalTokens = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }

    // Yield final usage
    yield { text: '', provider: 'cliproxy' as LLMProvider, usage: totalTokens };
  }

  private async *streamFromAnthropic(prompt: string) {
    const stream = this.anthropicClient!.messages.stream({
      model: this.config.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    let totalTokens = { inputTokens: 0, outputTokens: 0 };

    stream.on('text', (text) => {
      // Note: We can't yield from event handler, need to refactor to async iterator
    });

    const message = await stream.finalMessage();

    // For Anthropic, we'll use the simpler async iterator approach
    const streamIter = await this.anthropicClient!.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    for await (const event of streamIter) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { text: event.delta.text, provider: 'anthropic' as LLMProvider };
      }

      if (event.type === 'message_delta' && event.usage) {
        totalTokens = {
          inputTokens: event.usage.input_tokens || 0,
          outputTokens: event.usage.output_tokens || 0,
        };
      }
    }

    yield { text: '', provider: 'anthropic' as LLMProvider, usage: totalTokens };
  }
}

// Factory function
export async function createLLMClient(): Promise<LLMClient> {
  const settings = await getSettings();

  return new LLMClient({
    provider: 'cliproxy', // Primary
    cliproxyBaseUrl: settings.cliproxyBaseUrl || 'http://localhost:8080',
    anthropicApiKey: settings.anthropicApiKey,
    model: settings.llmModel || 'claude-sonnet-4-5-20250929',
  });
}
```

**Why this pattern:**
- Automatic fallback without user intervention
- OpenAI SDK works for CLIProxyAPI (OpenAI-compatible endpoint)
- Both SDKs support streaming with async iterators
- Single interface for consuming code (doesn't care about provider)

### Pattern 2: Express SSE Streaming Endpoint

**What:** Server-Sent Events endpoint that streams LLM responses to frontend

**When to use:** LLM generation requests requiring real-time display

**Example:**
```typescript
// backend/src/routes/llm.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createLLMClient } from '../services/llm/client.js';
import { logAuditEvent } from '../services/audit.js';

const router = Router();

router.post('/generate', requireAuth, async (req, res) => {
  const { prompt } = req.body;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  const client = await createLLMClient();
  let fullResponse = '';
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  let provider: string = 'unknown';

  try {
    for await (const chunk of client.generateStream(prompt)) {
      if (chunk.text) {
        fullResponse += chunk.text;

        // Send text delta as SSE event
        res.write(`event: delta\n`);
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }

      if (chunk.usage) {
        usage = chunk.usage;
      }

      provider = chunk.provider;
    }

    // Send completion event with usage
    res.write(`event: done\n`);
    res.write(`data: ${JSON.stringify({ usage })}\n\n`);
    res.end();

    // Log to audit trail (GDPR compliance)
    await logAuditEvent({
      userId: req.session.user!.id,
      action: 'llm.generate',
      details: {
        promptLength: prompt.length,
        responseLength: fullResponse.length,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        // NOTE: Store full sanitized prompt and response in separate audit field
        // for GDPR compliance (omitted here for brevity)
      },
      ipAddress: req.ip,
    });
  } catch (error) {
    // Send error event
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({
      message: error instanceof Error ? error.message : 'Unknown error',
      retryable: true,
    })}\n\n`);
    res.end();
  }
});

export default router;
```

**Why this pattern:**
- `text/event-stream` enables EventSource client
- `X-Accel-Buffering: no` prevents nginx from buffering (critical for streaming)
- Named events (`delta`, `done`, `error`) allow client-side event handling
- `res.flushHeaders()` sends headers immediately (starts stream)
- Audit logging after completion (full prompt/response for GDPR)

### Pattern 3: React Streaming UI with Streamdown

**What:** EventSource SSE hook + Streamdown component for typewriter effect with Markdown

**When to use:** Display LLM responses in real-time with formatting

**Example:**
```typescript
// frontend/src/hooks/useStreamingLLM.ts
import { useState, useEffect, useRef } from 'react';

export interface StreamingState {
  content: string;
  isStreaming: boolean;
  error: string | null;
  usage?: { inputTokens: number; outputTokens: number };
}

export function useStreamingLLM(endpoint: string, prompt: string, enabled: boolean) {
  const [state, setState] = useState<StreamingState>({
    content: '',
    isStreaming: false,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = async () => {
    setState({ content: '', isStreaming: true, error: null });

    // Create EventSource connection
    const es = new EventSource(endpoint);
    eventSourceRef.current = es;

    es.addEventListener('delta', (event) => {
      const { text } = JSON.parse(event.data);
      setState((prev) => ({ ...prev, content: prev.content + text }));
    });

    es.addEventListener('done', (event) => {
      const { usage } = JSON.parse(event.data);
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        usage,
      }));
      es.close();
    });

    es.addEventListener('error', (event) => {
      const { message } = JSON.parse(event.data);
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: message,
      }));
      es.close();
    });

    es.onerror = () => {
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: 'Connection lost. Click retry to continue.',
      }));
      es.close();
    };
  };

  const stopStream = () => {
    eventSourceRef.current?.close();
    setState((prev) => ({ ...prev, isStreaming: false }));
  };

  useEffect(() => {
    if (enabled) {
      startStream();
    }

    return () => {
      eventSourceRef.current?.close();
    };
  }, [enabled, endpoint]);

  return { ...state, stopStream, retry: startStream };
}
```

```typescript
// frontend/src/components/llm/StreamingResponse.tsx
import Streamdown from 'streamdown';
import { Loader2, StopCircle } from 'lucide-react';
import { useStreamingLLM } from '../../hooks/useStreamingLLM';

export function StreamingResponse({ prompt }: { prompt: string }) {
  const { content, isStreaming, error, usage, stopStream, retry } = useStreamingLLM(
    '/api/llm/generate',
    prompt,
    true
  );

  return (
    <div className="space-y-4">
      {/* Loading indicator (pulsing dots) */}
      {isStreaming && content === '' && (
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-gray-500">Thinking...</span>
        </div>
      )}

      {/* Streaming Markdown with typewriter effect */}
      {content && (
        <div className="prose dark:prose-invert">
          <Streamdown>{content}</Streamdown>
          {isStreaming && <span className="animate-pulse">▊</span>}
        </div>
      )}

      {/* Stop button (visible during streaming) */}
      {isStreaming && content && (
        <button
          onClick={stopStream}
          className="flex items-center space-x-2 px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
        >
          <StopCircle className="h-4 w-4" />
          <span>Stop generating</span>
        </button>
      )}

      {/* Error banner with retry */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          <button
            onClick={retry}
            className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Token usage (shown after completion) */}
      {usage && !isStreaming && (
        <div className="text-xs text-gray-500">
          {usage.inputTokens} input tokens · {usage.outputTokens} output tokens
        </div>
      )}
    </div>
  );
}
```

**Why this pattern:**
- Streamdown handles incomplete Markdown blocks (e.g., `**bol` renders as partial bold)
- Blinking cursor (`▊`) with `animate-pulse` provides typewriter feel
- EventSource auto-reconnects on network failure (Last-Event-ID header)
- Error state keeps partial content visible (per user requirements)
- Stop button calls `eventSource.close()` to cancel stream

### Pattern 4: Exponential Backoff for Transient Failures

**What:** Retry LLM requests with exponential delay on transient errors (rate limits, timeouts)

**When to use:** LLM client initialization, provider health checks

**Example:**
```typescript
// backend/src/services/llm/retry.ts
import { backOff } from 'exponential-backoff';

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  jitter: 'full' | 'none';
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 500, // 500ms
  maxDelay: 10000,   // 10s
  jitter: 'full',    // Randomize delay to prevent thundering herd
};

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return backOff(fn, {
    numOfAttempts: finalConfig.maxAttempts,
    startingDelay: finalConfig.initialDelay,
    maxDelay: finalConfig.maxDelay,
    jitter: finalConfig.jitter,
    retry: (error, attemptNumber) => {
      // Only retry transient errors (5xx, rate limit, timeout)
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        const isTransient =
          message.includes('503') ||
          message.includes('429') ||
          message.includes('timeout') ||
          message.includes('econnrefused');

        console.log(`Retry attempt ${attemptNumber}/${finalConfig.maxAttempts} for error: ${error.message}`);

        return isTransient;
      }
      return false;
    },
  });
}

// Usage in LLM client
export async function healthCheckProvider(baseUrl: string): Promise<boolean> {
  try {
    await retryWithBackoff(async () => {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return response.json();
    });
    return true;
  } catch (error) {
    console.error('Provider health check failed after retries:', error);
    return false;
  }
}
```

**Why this pattern:**
- Jitter prevents thundering herd (all clients retry at same time)
- Max delay cap prevents infinite backoff
- Selective retry (only transient errors, not 4xx client errors)
- Bounded attempts prevent infinite loops

### Pattern 5: LLM Audit Logging with Full Prompt/Response

**What:** Extend Phase 1 audit logging to store full LLM interactions for GDPR compliance

**When to use:** All LLM generation requests

**Example:**
```typescript
// backend/src/services/llm/audit.ts
import { logAuditEvent } from '../audit.js';

export interface LLMAuditData {
  promptSanitized: string;  // Full prompt after PII sanitization
  responseFull: string;     // Full LLM response
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export async function logLLMInteraction(
  userId: string,
  ipAddress: string,
  data: LLMAuditData
): Promise<void> {
  await logAuditEvent({
    userId,
    action: 'llm.generate',
    details: {
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      promptLength: data.promptSanitized.length,
      responseLength: data.responseFull.length,
      // Store full content in separate fields for GDPR audit trail
      promptSanitized: data.promptSanitized,
      responseFull: data.responseFull,
    },
    ipAddress,
  });
}

// Admin audit viewer can expand to see full prompt/response
// Regular audit viewer shows token counts and lengths only
```

**Why this pattern:**
- Builds on existing Phase 1 audit infrastructure (hash chain, transaction locking)
- Stores sanitized prompt (GDPR proof of what LLM saw after PII removal)
- Full response stored (compliance requirement to show what LLM generated)
- Token counts for system-wide usage tracking (no per-user billing)

### Anti-Patterns to Avoid

- **Re-parsing Markdown on every chunk:** Use Streamdown or incremental parser. react-markdown re-parses entire document (O(n²) complexity, visual glitches).
- **Auto-retry on errors:** Manual retry only per user requirements. Auto-retry burns credits on permanent failures (e.g., invalid API key).
- **Storing API keys in environment variables:** User requirements specify Admin UI configuration. Store in database, encrypt at rest.
- **Buffering SSE responses:** Always set `X-Accel-Buffering: no` header. Nginx/proxies buffer by default, breaking real-time streaming.
- **Not handling stream cancellation:** User can click "Stop generating". Listen for EventSource close and abort backend stream.
- **Logging provider choice:** User requirements state provider (CLIProxy vs API) not logged. Only log prompt, response, token usage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Manual event parsing with fetch | OpenAI/Anthropic SDKs | SDKs handle event-stream parsing, reconnection, error recovery, AbortController integration. Edge cases are complex. |
| Exponential backoff | Custom setTimeout loop | `exponential-backoff` npm | Package handles jitter (prevents thundering herd), max delay cap, bounded attempts. Easy to get wrong. |
| Streaming Markdown | Custom Markdown parser | `streamdown` | Designed for AI streaming, handles incomplete blocks, incremental parsing (O(n) not O(n²)). react-markdown re-parses entire doc. |
| EventSource reconnect | Manual WebSocket fallback | Native EventSource API | Auto-reconnect built-in, Last-Event-ID header for resumption, standard browser API. WebSocket is overkill. |
| LLM provider abstraction | Custom wrapper | OpenAI SDK with baseURL | OpenAI-compatible endpoints are industry standard. CLIProxyAPI, Anthropic, Azure OpenAI all support it. |
| Token counting | Manual tokenization | LLM SDK usage fields | SDKs return accurate token counts from API. Manual counting is approximate and model-dependent. |

**Key insight:** LLM streaming has hidden complexity in partial JSON parsing (tool use), reconnection after network failure, and incremental Markdown rendering. Use battle-tested libraries designed specifically for AI streaming (Streamdown, OpenAI SDK).

## Common Pitfalls

### Pitfall 1: Buffering Breaks Real-Time Streaming

**What goes wrong:** Characters appear in bursts instead of smoothly, defeating typewriter effect.

**Why it happens:** Nginx, proxies, and Express middleware buffer responses by default. SSE requires immediate flushing.

**How to avoid:**
- Set `X-Accel-Buffering: no` header to disable nginx buffering
- Call `res.flushHeaders()` immediately after setting headers
- Don't use Express `res.json()` or middleware that buffers
- Use `res.write()` for each chunk, not `res.send()`

**Warning signs:**
- Text appears in chunks of 1KB or more (proxy buffer size)
- Long delay before first character appears
- Entire response arrives at once despite streaming code

### Pitfall 2: EventSource Memory Leak from Not Closing

**What goes wrong:** Memory usage grows over time, browser slows down, server connections accumulate.

**Why it happens:** EventSource keeps connection open indefinitely. React re-renders can create new EventSource without closing old one.

**How to avoid:**
- Store EventSource in useRef, not useState (prevent re-creation on re-render)
- Always close in cleanup function: `return () => eventSource.close()`
- Close on unmount, error, and completion
- Monitor open connections in browser DevTools Network tab

**Example:**
```typescript
useEffect(() => {
  const es = new EventSource('/api/stream');
  eventSourceRef.current = es;

  // ... event listeners ...

  return () => {
    es.close(); // Critical cleanup
  };
}, []);
```

**Warning signs:**
- Browser DevTools shows many pending EventSource requests
- Server logs show increasing connection count
- Memory usage grows continuously

### Pitfall 3: Incomplete Markdown Blocks Cause Visual Glitches

**What goes wrong:** Markdown renders as plain text mid-stream, then suddenly changes to formatted (e.g., `**bold` shows as literal text, then becomes bold when `**` completes).

**Why it happens:** react-markdown re-parses entire document on every chunk. Incomplete syntax isn't recognized as Markdown.

**How to avoid:**
- Use Streamdown (handles incomplete blocks gracefully)
- Alternative: buffer chunks until Markdown syntax completes (complex)
- Don't use react-markdown for streaming (designed for static content)

**Example issue:**
```typescript
// ❌ BAD: react-markdown re-parses on every chunk
<ReactMarkdown>{streamingContent}</ReactMarkdown>

// ✅ GOOD: Streamdown handles incomplete blocks
<Streamdown>{streamingContent}</Streamdown>
```

**Warning signs:**
- Bold text appears as `**bold` then snaps to formatted
- Lists render as plain text until `\n` arrives
- Code blocks flicker between raw and formatted

### Pitfall 4: Not Handling Provider Fallback Errors

**What goes wrong:** CLIProxyAPI fails (not running), Anthropic fallback also fails (no API key), app crashes with unclear error.

**Why it happens:** Multi-provider fallback requires checking provider availability before attempting requests.

**How to avoid:**
- Health check CLIProxyAPI on startup (or on-demand from Admin settings)
- Show clear error in Admin UI if no provider available
- Don't attempt LLM requests if no provider configured
- Log fallback transitions (CLIProxy → Anthropic) for debugging

**Example:**
```typescript
// Health check before creating client
const cliproxyAvailable = await healthCheckProvider(cliproxyUrl);
const anthropicAvailable = !!anthropicApiKey;

if (!cliproxyAvailable && !anthropicAvailable) {
  throw new Error('No LLM provider available. Configure CLIProxyAPI or Anthropic API in Settings.');
}
```

**Warning signs:**
- "No LLM provider available" errors in production
- Users report intermittent failures (CLIProxy down, no fallback)
- Admin can't determine provider status

### Pitfall 5: Token Count Mismatch Between Streaming and Final

**What goes wrong:** Token count shown during streaming doesn't match final count after completion.

**Why it happens:** Streaming APIs send cumulative token counts in each event. Displaying intermediate counts confuses users.

**How to avoid:**
- Only show token count after streaming completes (per user requirements)
- Store token count from final event (`message_delta` for Anthropic, last chunk for OpenAI)
- Don't display cumulative counts during streaming

**Example:**
```typescript
// ❌ BAD: Shows changing token count during streaming
{usage && <div>{usage.outputTokens} tokens</div>}

// ✅ GOOD: Only show after completion
{!isStreaming && usage && <div>{usage.outputTokens} tokens</div>}
```

**Warning signs:**
- Token count updates every second during streaming
- Final count differs from what was shown mid-stream
- User confusion about "why did token count change?"

### Pitfall 6: Race Condition in Audit Logging (Inherited from Phase 1)

**What goes wrong:** Two concurrent LLM requests create audit log entries with duplicate `previousHash`, breaking hash chain.

**Why it happens:** Phase 1 audit logging uses transaction locking. Must be applied to LLM audit logging too.

**How to avoid:**
- Use existing `logAuditEvent()` function (already has transaction locking)
- Don't create custom audit logging for LLM (reuse Phase 1 infrastructure)
- Verify hash chain integrity on startup

**Warning signs:**
- Audit chain verification fails after concurrent LLM requests
- Duplicate `previousHash` values in audit log

## Code Examples

Verified patterns from official sources:

### OpenAI SDK Streaming

```typescript
// Source: https://github.com/openai/openai-node
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:8080', // CLIProxyAPI endpoint
  apiKey: 'not-needed',
});

const stream = await openai.chat.completions.create({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});

for await (const chunk of stream) {
  const text = chunk.choices[0]?.delta?.content || '';
  process.stdout.write(text);
}
```

### Anthropic SDK Streaming

```typescript
// Source: https://platform.claude.com/docs/en/api/messages-streaming
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const stream = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

### Express SSE Endpoint

```typescript
// Source: https://masteringjs.io/tutorials/express/server-sent-events
import express from 'express';

app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const interval = setInterval(() => {
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify({ text: 'chunk' })}\n\n`);
  }, 100);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});
```

### React EventSource Hook

```typescript
// Source: https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view
import { useEffect, useState, useRef } from 'react';

function useSSE(url: string) {
  const [data, setData] = useState<string>('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      setData((prev) => prev + event.data);
    };

    eventSource.onerror = () => {
      console.error('EventSource error');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [url]);

  return data;
}
```

### Streamdown Usage

```typescript
// Source: https://streamdown.ai/docs
import Streamdown from 'streamdown';

function StreamingMarkdown({ content }: { content: string }) {
  return (
    <Streamdown>
      {content}
    </Streamdown>
  );
}

// Handles incomplete blocks:
// "**bol" renders as partial bold
// "# Head" renders as incomplete heading
// "```py\nprint(" renders as incomplete code block
```

### Exponential Backoff

```typescript
// Source: https://www.npmjs.com/package/exponential-backoff
import { backOff } from 'exponential-backoff';

const result = await backOff(
  async () => {
    const response = await fetch('/api/llm');
    if (!response.ok) throw new Error('Failed');
    return response.json();
  },
  {
    numOfAttempts: 3,
    startingDelay: 500,
    maxDelay: 10000,
    jitter: 'full',
  }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-markdown for streaming | Streamdown | 2025 | Streamdown handles incomplete Markdown blocks (O(n) parsing vs O(n²)), designed for AI streaming |
| Manual SSE parsing | OpenAI/Anthropic SDKs | 2023+ | SDKs handle event parsing, retries, AbortController integration. Less error-prone. |
| WebSocket for streaming | Server-Sent Events | Ongoing | SSE is one-way (sufficient for LLM), auto-reconnect, works over HTTP. WebSocket is bidirectional (overkill). |
| Custom retry logic | exponential-backoff npm | Ongoing | Package handles jitter, max delay, bounded attempts. Prevents thundering herd. |
| Environment variables for secrets | Database storage + Admin UI | Security best practice | User-configurable, encrypted at rest, audit trail for changes. Env vars require redeployment. |
| OpenAI API only | Multi-provider abstraction | 2024+ | CLIProxyAPI, Anthropic, Azure OpenAI all support OpenAI-compatible endpoints. Single SDK works for all. |

**Deprecated/outdated:**
- **Manual fetch + SSE parsing**: OpenAI SDK v4+ handles streaming with async iterators. No need for manual `text/event-stream` parsing.
- **react-markdown for streaming**: Causes O(n²) re-parsing and visual glitches with incomplete blocks. Use Streamdown instead.
- **WebSocket for LLM streaming**: SSE is simpler (one-way, HTTP-based). WebSocket needed only for bidirectional chat.
- **Storing API keys in .env**: User requirements specify Admin UI configuration. Database storage allows runtime changes without redeployment.

## Open Questions

1. **What is the exact CLIProxyAPI base URL?**
   - What we know: CLIProxyAPI is installed on server, exposes OpenAI-compatible endpoint
   - What's unclear: Default port, URL format (http://localhost:8080 or different?)
   - Recommendation: Check CLIProxyAPI documentation or default to localhost:8080. Allow Admin to override in settings if needed.

2. **How to start CLIProxyAPI from Admin UI?**
   - What we know: Settings page should offer "Start CLIProxyAPI" button if not running
   - What's unclear: Is CLIProxyAPI a system service (systemctl) or manual process? Does app have permissions to start it?
   - Recommendation: Use child_process.spawn() to start CLIProxyAPI subprocess. Alternatively, show instructions to start manually via systemctl.

3. **Should we cache LLM responses?**
   - What we know: TanStack Query is already installed for caching. LLM responses are deterministic for identical prompts.
   - What's unclear: Are prompts identical often enough to justify caching? Cache invalidation strategy?
   - Recommendation: Don't cache initially (LLM responses are expensive but prompts vary). Add caching later if identical prompts are common (e.g., template adaptation).

4. **What model name to use for CLIProxyAPI?**
   - What we know: OpenAI SDK requires `model` parameter. CLIProxyAPI is OpenAI-compatible.
   - What's unclear: Does CLIProxyAPI accept Claude model names (claude-sonnet-4-5-20250929) or expects OpenAI names (gpt-4)?
   - Recommendation: Check CLIProxyAPI docs. Default to `claude-sonnet-4-5-20250929` (Anthropic naming). Allow Admin to override.

## Sources

### Primary (HIGH confidence)

- [OpenAI Node.js SDK](https://github.com/openai/openai-node) - Streaming patterns, custom baseURL, error handling
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Streaming API, custom baseURL, event types
- [Anthropic Streaming Messages Docs](https://platform.claude.com/docs/en/api/messages-streaming) - SSE event types, content block deltas, error recovery
- [Streamdown Documentation](https://streamdown.ai/docs) - AI streaming, incomplete block handling, react-markdown replacement
- [Express Server-Sent Events](https://masteringjs.io/tutorials/express/server-sent-events) - SSE headers, flushHeaders, X-Accel-Buffering
- [CLIProxyAPI GitHub](https://github.com/router-for-me/CLIProxyAPI) - OpenAI-compatible proxy for Claude Code CLI
- [exponential-backoff npm](https://www.npmjs.com/package/exponential-backoff) - Jitter, max delay, retry logic

### Secondary (MEDIUM confidence)

- [How to Implement SSE in React (Jan 2026)](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view) - EventSource hook patterns, error handling
- [Node.js AbortController Guide (Feb 2026)](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html) - Stream cancellation, SSE abort
- [How to Stream Updates with SSE in Node.js (Jan 2026)](https://oneuptime.com/blog/post/2026-01-24-nodejs-server-sent-events/view) - Express SSE implementation
- [OpenAI SDK vs Vercel AI SDK (2026)](https://strapi.io/blog/openai-sdk-vs-vercel-ai-sdk-comparison) - SDK comparison for streaming
- [Exponential Backoff for LLM APIs (Jan 2026)](https://oneuptime.com/blog/post/2026-01-06-nodejs-retry-exponential-backoff/view) - Retry patterns, jitter, max delay
- [Claude Code Proxy Usage](https://www.scriptbyai.com/claude-code-cli-proxy/) - CLIProxyAPI setup, OpenAI compatibility

### Tertiary (LOW confidence - marked for validation)

- [Incremark](https://www.incremark.com/) - Alternative streaming Markdown parser (O(n) incremental, needs validation against Streamdown)
- [react-eventsource npm](https://www.npmjs.com/package/react-eventsource) - Declarative EventSource wrapper (evaluate if needed vs custom hook)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - OpenAI/Anthropic SDKs officially documented, Streamdown designed for AI streaming, all libraries actively maintained
- Architecture: HIGH - Patterns from official OpenAI/Anthropic docs, Express SSE best practices, React EventSource patterns
- Streaming UI: HIGH - Streamdown specifically designed for AI streaming (vs react-markdown), verified incomplete block handling
- Provider fallback: MEDIUM - CLIProxyAPI integration pattern verified via GitHub docs, Anthropic fallback standard, needs production validation
- Pitfalls: MEDIUM - Based on official docs (buffering, EventSource cleanup) and community best practices (Markdown glitches, token counts)

**Research date:** 2026-02-11
**Valid until:** 2026-02-18 (7 days - fast-moving AI SDK ecosystem)

**Libraries confirmed current:**
- openai npm: 4.x (released 2023, stable API)
- @anthropic-ai/sdk: Latest (TypeScript-first, actively maintained)
- streamdown: Latest (released 2025 by Vercel, AI streaming focus)
- exponential-backoff: 1.x (stable, widely used)
- EventSource: Native browser API (stable)
- AbortController: Node.js 16+ native (stable)

**Areas needing validation during planning:**
1. CLIProxyAPI exact base URL and startup mechanism (system service vs subprocess)
2. Model name format for CLIProxyAPI (Claude naming vs OpenAI naming)
3. LLM response caching strategy (identical prompts frequency unknown)
4. Admin settings storage schema (API keys, provider config, model selection)
5. Typewriter animation speed tuning (Claude's discretion, needs UX testing)
