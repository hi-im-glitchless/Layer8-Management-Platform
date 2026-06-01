# Architecture

## Shape
Three-tier, three-service monorepo: a React SPA, an Express/Prisma API, and a Python FastAPI sanitization microservice. SQLite is the system of record; Redis backs sessions, rate-limiting, and a BullMQ job queue. Realtime collaboration runs over Socket.IO sharing the HTTP session.

## Request lifecycle (backend `src/index.ts`)
Middleware order is significant and intentional:
1. `express.json()` + `cookieParser()`
2. `Cache-Control: no-store` on `/api` (defeats proxy caching)
3. `helmet` CSP/HSTS + custom `Permissions-Policy`
4. `cors` (origin = `FRONTEND_URL`, credentials)
5. `/api/health` and `/api/csrf-token` (registered **before** rate limiting / session)
6. `/uploads/board` → hard **403** (board files are auth-gated downloads only), then `/uploads` static
7. `startServer()` async boot: ensure upload dirs → `connectRedis()` → build session middleware (Redis store, `rolling`, 8h, httpOnly, `secure` in prod, `sameSite=lax`)
8. `validateSession` → activity tracker (lastActivity/ip) → `csrfProtection` → `generalRateLimiter` on `/api`
9. Route mounting (see below)
10. Optional service health probes (sanitizer, gotenberg) — non-blocking
11. Global error handler → HTTP server + Socket.IO attach → `listen(PORT)`

## Route map (all under `/api`)
Always-on: `/auth`, `/profile`, `/audit`, `/users`, `/admin`, `/llm`, `/schedule`, `/board`, `/projects`, `/board/members`.
Feature-gated via `requireFeature(...)`:
- `/deny-list`, `/adapter`, `/sanitize` → `FEATURE_TEMPLATE_ADAPTER`
- `/documents` → `FEATURE_DOCUMENT_PROCESSING`
- `/ghostwriter`, `/report` → `FEATURE_EXECUTIVE_REPORT`

## Layering (backend)
`routes/*` (HTTP, validation, auth middleware) → `services/*` (business logic, Prisma access) → `db/{prisma,redis}` (clients). Middleware in `middleware/*`. Cross-cutting types in `types/*`. This separation is consistent: routes stay thin, services own data access and rules.

## Realtime (Socket.IO)
`services/socketService.ts` holds a singleton `io`. Session middleware is shared into the engine (`io.engine.use(sessionMiddleware)`); a connection is rejected unless `session.userId && session.totpVerified && !awaitingTOTP`. Board and schedule mutations broadcast to keep multiple clients in sync (`useBoardSync`, `useScheduleSync`, `boardService`/`scheduleService`).

## Domain model (Prisma) — `backend/prisma/schema.prisma`
Three loosely-coupled domains share one DB:
- **Identity/security:** `User` (role NORMAL/PM/ADMIN, argon2 hash, TOTP fields, lockout), `TrustedDevice`, `AuditLog` (hash-chained), `DenyListTerm`.
- **Scheduling/planner:** `TeamMember` (optionally linked to a User; supports "backlog" placeholders), `Assignment` (one per member-week, supports split cells via `split*` fields), `Absence`, `Holiday`, `ProjectColor`, `Client`, and the **`Project`** entity (Phase 24-R03 — the unit of work in the Planner; dedupe key `(name, clientId, sortedTags)` enforced in `projectService.upsertByKey`).
- **Board (kanban):** `BoardCard` (1:1 with `Project` via unique `projectId`; `stage`, `checklist`, `notes`), `BoardComment` (soft-delete + edit tracking), `BoardFile`, `BoardNotification`.
- **AI/templating:** `LlmSettings`, `TemplateMapping` + `BlueprintPattern` + `StyleHint` + `TemplateMappingSnapshot`.

Key relationship: **Assignment → Project → BoardCard**. Many assignments (multi-pentester / multi-week) link to one Project, which has exactly one board card. `projectId`/`splitProjectId` are nullable — pre-R03 assignments and those missing name/client/tag stay in the schedule UI but not the Planner.

## Frontend architecture (`frontend/src`)
- **Entry:** `main.tsx` → `App.tsx` (providers: `ThemeProvider`, `TooltipProvider`, `BrowserRouter`, `Toaster`; React Query provider wired in `main.tsx`).
- **Routing/guards:** `App.tsx` defines `PublicRoute` / `ProtectedRoute` (auth) / `RoleProtectedRoute` (min role). Authenticated pages render inside `AppShell`. Routes: `/` Dashboard, `/profile`, `/schedule`, `/board`, and admin-only `/admin`, `/audit-log`.
- **Feature-sliced:** `features/<domain>/` each own `api.ts`, `hooks.ts` (React Query), `types.ts`, and `components/`. Domains: adapter, admin, audit, auth, board, dashboard, documents, executive-report, profile, schedule.
- **Shared:** `components/ui/*` (shadcn primitives), `components/{layout,admin,auth,llm}`, `lib/{api,llm-api,rbac,utils}`, `hooks/`, page wrappers in `routes/`.
- RBAC mirrored client-side in `lib/rbac.ts` (`hasRole`, hierarchy NORMAL<PM<ADMIN) for UI gating — server is authoritative.

## Sanitization service (`sanitization-service/app`)
FastAPI app (`main.py`) loads spaCy models at startup (lifespan). Layered: `routes/` (sanitize, docx, adapter, report) → `services/` (sanitizer, docx parser/generator, prompt builders, rules engine, report builder, template renderer) → `recognizers/` (custom Presidio recognizers: IPs, domains, hostnames, AD objects, network paths) + `operators/` + `models/` (pydantic). Produces sanitized docx, gap detection, compliance matrices, and AI-assisted report narratives.

## Cross-cutting concerns
- **Audit chain:** `services/audit.ts` SHA-256 hash-chains every audit entry (`previousHash`→`hash`, genesis seed); `GET /api/audit/verify` validates integrity and reports `brokenAt`.
- **Security:** session+TOTP+CSRF+rate-limit+helmet; access-denied events audited (`middleware/auth.ts`).
- **Board authz:** `middleware/boardAuth.ts` `requireCardAccess` — ADMIN/PM pass; NORMAL must be assigned to the card's project. Explicitly forbidden from writing schedule tables.
