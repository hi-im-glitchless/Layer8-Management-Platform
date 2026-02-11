# Phase 3: LLM Integration - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-provider LLM client with SSE streaming, compliance-grade interaction logging, and reusable streaming UI components. Connects to Claude via CLIProxyAPI (primary) with Anthropic API fallback. All downstream features (template adaptation, executive reports) consume this phase's client and UI components.

</domain>

<decisions>
## Implementation Decisions

### Streaming UX
- Typewriter effect for streaming output — characters appear smoothly with a blinking cursor
- Pulsing dots ("...") animation while waiting for the first token to arrive
- Real-time Markdown rendering during streaming (bold, headers, lists render as they arrive)
- "Stop generating" button visible during active streaming so users can cancel

### Provider switching & fallback
- CLIProxyAPI is the primary provider and may be the only one initially (no Anthropic API key available at launch)
- CLIProxyAPI base URL is fixed — no endpoint configuration needed from the admin
- Admin settings page shows CLIProxyAPI status (running/not running)
- If not running, settings page offers a button to start it
- Only if CLIProxyAPI cannot start does the system prompt to configure Anthropic API fallback
- Auto-switch to fallback is seamless when configured — no user intervention needed per-request
- API keys configured via Admin settings UI (not environment variables)
- Single configured model — no per-request model selection

### Error & retry experience
- On mid-stream failure: keep partial output visible with error banner and retry button below
- Manual retry button only — no auto-retry (avoids burning credits on unresolvable issues)
- Technical, actionable error messages (e.g., "CLIProxyAPI connection refused. Check that the service is running, or switch to API fallback in Settings.")
- Show input/output token count after generation completes (not during streaming)

### Audit & compliance display
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

</decisions>

<specifics>
## Specific Ideas

- CLIProxyAPI is installed on the server and authenticated with the subscription — the base URL never changes, so no URL configuration is needed
- The team may not have Anthropic API access for the first months of production, making CLIProxyAPI integration the priority
- Admin settings should have a dedicated section for LLM provider status and management
- Error messages should respect that the audience is pentesters (technical users) — be direct, not hand-holdy

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-llm-integration*
*Context gathered: 2026-02-11*
