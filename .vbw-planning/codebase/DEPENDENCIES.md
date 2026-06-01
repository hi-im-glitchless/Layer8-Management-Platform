# Dependencies

## Internal service dependency graph

```
Browser SPA (frontend, :5173 dev / static in prod)
   │  fetch /api/*  (credentials: include, X-CSRF-Token)
   │  socket.io     (session cookie shared)
   ▼
Backend API (Express, :3001)
   ├── Redis (:6379)              sessions, rate-limit, BullMQ queue   [REQUIRED]
   ├── SQLite (Prisma)            primary datastore                    [REQUIRED]
   ├── Sanitization svc (:8000)   PII detection / docx adapter / report [OPTIONAL — 503 if down]
   ├── Gotenberg (:3000)          PDF rendering via BullMQ             [OPTIONAL]
   ├── ClamAV (:3310)             upload virus scan                    [OPTIONAL — DISABLE_VIRUS_SCAN]
   └── LLM providers              CLIProxy (primary) → Anthropic (fallback)
```

The backend tolerates optional services being down at startup (logs a warning, routes return 503/feature-gated). Redis and SQLite are hard requirements.

## Backend → external services
- **Redis** (`db/redis.ts`): connection + `connect-redis` session store; also backs `rate-limit-redis` and BullMQ.
- **Prisma/SQLite** (`db/prisma.ts`): singleton client, driver adapter `PrismaBetterSqlite3`. Resolves relative `file:` URLs to an absolute path under backend root. Global singleton guard for dev hot-reload.
- **Sanitization service** (`services/sanitization.ts`): `SANITIZER_URL` (default `http://localhost:8000`); `waitForSanitizer()` polled at startup, non-blocking.
- **Gotenberg** (`services/documents.ts`, `services/pdfQueue.ts`): `GOTENBERG_URL`; health checked at startup; conversions run through a BullMQ queue.
- **ClamAV** (`services/clamService.ts`): `CLAMAV_HOST`/`CLAMAV_PORT`; gated by `DISABLE_VIRUS_SCAN`.
- **LLM** (`services/llm/`): `CLIProxyProvider` (primary, `CLIPROXY_*`) with `AnthropicProvider` fallback (enabled only when an Anthropic key + `fallbackEnabled` are set in `LlmSettings`). Per-feature model resolution (template-adapter / executive-report / default).
- **Ghostwriter** (`services/ghostwriter.ts`): external reporting API via `GHOSTWRITER_URL` + token (optional feature).

## Frontend → backend
- All HTTP through `src/lib/api.ts` (`apiClient<T>`) — base URL `VITE_API_URL` or `''` (prod, same-origin) / `http://localhost:3001` (dev). Vite dev server also proxies `/api` and `/uploads` to `:3001`.
- CSRF: cookie `__csrf` read client-side and echoed as `X-CSRF-Token` on POST/PUT/PATCH/DELETE; auto-bootstrapped via `GET /api/csrf-token`.
- 401 responses trigger a hard redirect to `/login`.
- Realtime: `socket.io-client` (board `useBoardSync.ts`, schedule `useScheduleSync.ts`).

## Configuration (env) — `backend/src/config.ts` (zod-validated)
Required: `SESSION_SECRET` (min 32 chars). Defaulted: `NODE_ENV`, `PORT=3001`, `DATABASE_URL=file:./dev.db`, `REDIS_URL`, `FRONTEND_URL=http://localhost:5173`, `SANITIZER_URL`, `GOTENBERG_URL`, `CLAMAV_HOST/PORT`, `CLIPROXY_BIN_PATH`, `CLIPROXY_API_KEY` (⚠ hardcoded default — see CONCERNS), `DISABLE_VIRUS_SCAN`.
Feature flags (default **false**): `FEATURE_TEMPLATE_ADAPTER`, `FEATURE_EXECUTIVE_REPORT`, `FEATURE_DOCUMENT_PROCESSING`. Optional: `GHOSTWRITER_URL/API_TOKEN/REPORT_ID`.
Env templates: root `.env.example` (production), `backend/.env.example` (dev), `sanitization-service/.env.example`.

## Notable package choices / constraints
- **Prisma 7 + driver adapters** is recent; the SQLite path is resolved differently by the app (backend root) vs prior conventions — keep `prisma.config.ts` (`datasource.url = env.DATABASE_URL`) and app resolution consistent.
- **Express 5** (not 4) — async error semantics differ; a global error handler is registered.
- **Tailwind v4** (config-light, Vite plugin) — not v3.
- **React 19 + react-router-dom 7** — current majors.
- No root-level `package.json` / workspace tooling: each service installs independently.
