# Architecture

## System Overview

Layer8 is a monorepo with 3 independent services communicating via REST APIs:

```
[Browser/SPA] ──HTTP──> [Express Backend] ──HTTP──> [FastAPI Sanitizer]
                              │
                        [SQLite] [Redis]
```

## Service Communication
- **Frontend → Backend**: REST API via Vite dev proxy (`/api/*` → `localhost:3001`)
- **Backend → Sanitizer**: HTTP client calls to FastAPI service (`localhost:8000`)
- **No direct Frontend → Sanitizer** communication

## API Patterns
- REST endpoints with Express Router
- JSON request/response bodies
- Zod validation at route entry points
- CSRF double-submit cookie pattern
- Session cookie-based authentication

## Authentication Flow
1. `POST /api/auth/login` → validate credentials → set session (awaitingTOTP if 2FA)
2. `POST /api/auth/login/totp` → verify TOTP code → mark session verified
3. Session cookie sent automatically on subsequent requests
4. `requireAuth` middleware checks session on protected routes
5. `requireAdmin` middleware extends auth check for admin routes

## Data Flow - Sanitization
1. Frontend sends text + language + deny list terms
2. Backend fetches global deny list from SQLite, merges with request terms
3. Backend forwards to Python sanitizer service
4. Sanitizer: language detection → spaCy NLP → deny list matching → Presidio analysis → placeholder generation
5. Backend stores mappings in Redis (session-scoped, TTL-based)
6. Sanitized text returned to frontend (mappings never sent to LLM)

## Audit Trail
- Hash-chain audit log: each entry contains SHA256(previousHash + eventData + timestamp)
- Middleware automatically logs protected actions
- Tamper-evident: breaking the chain detects modification
- Exportable for compliance auditors

## Key Architectural Decisions
- **SQLite for dev, PostgreSQL for prod**: Prisma makes migration seamless
- **Redis for sessions + mappings**: Fast lookup, TTL-based cleanup, session isolation
- **Separate sanitizer service**: Isolates heavy NLP models (1.1GB spaCy), independent scaling
- **Feature-based frontend organization**: `features/` groups API + hooks by domain
- **Middleware chain**: Cross-cutting concerns (auth, CSRF, rate limiting, audit) as middleware
