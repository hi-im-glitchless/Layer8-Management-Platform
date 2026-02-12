/**
 * LLM API client for triggering SSE-based generation via POST
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Read CSRF token from cookie (same pattern as lib/api.ts)
 */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )__csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Ensure a CSRF cookie exists by calling the token endpoint
 */
let csrfInitPromise: Promise<void> | null = null;

async function ensureCsrfToken(): Promise<void> {
  if (getCsrfToken()) return;

  if (!csrfInitPromise) {
    csrfInitPromise = fetch(`${API_BASE_URL}/api/csrf-token`, {
      credentials: 'include',
    }).then(() => {
      csrfInitPromise = null;
    }).catch(() => {
      csrfInitPromise = null;
    });
  }

  await csrfInitPromise;
}

export interface LLMStreamOptions {
  systemPrompt?: string;
  maxTokens?: number;
}

/**
 * Initiate a POST-based SSE stream to the LLM generate endpoint.
 * Returns the raw Response for the hook to consume via ReadableStream.
 */
export async function startLLMStream(
  prompt: string,
  options?: LLMStreamOptions & { signal?: AbortSignal }
): Promise<Response> {
  await ensureCsrfToken();

  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}/api/llm/generate`, {
    method: 'POST',
    headers,
    credentials: 'include',
    signal: options?.signal,
    body: JSON.stringify({
      prompt,
      systemPrompt: options?.systemPrompt,
      maxTokens: options?.maxTokens,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = `LLM request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) message = parsed.error;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  return response;
}
