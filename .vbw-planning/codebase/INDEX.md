# Codebase Index

**Layer8 Management Platform** — pentest/red-team team-management platform: scheduling/planner, a project kanban board, and an AI-assisted document sanitization + report pipeline. Three services (React SPA, Express/Prisma API, Python FastAPI sanitizer), SQLite + Redis, Socket.IO realtime.

## Map documents
| Doc | Contents |
|-----|----------|
| [STACK.md](STACK.md) | Languages, frameworks, runtime & infra deps per service |
| [DEPENDENCIES.md](DEPENDENCIES.md) | Service dependency graph, env config, external integrations |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Request lifecycle, route map, layering, domain model, realtime |
| [STRUCTURE.md](STRUCTURE.md) | Directory tree and where things live |
| [CONVENTIONS.md](CONVENTIONS.md) | Coding standards, import/naming rules, framework idioms |
| [TESTING.md](TESTING.md) | Test frameworks, commands, coverage and gaps |
| [CONCERNS.md](CONCERNS.md) | Security/data/operational risks and tech debt |
| [PATTERNS.md](PATTERNS.md) | Reusable patterns to imitate when extending |

## Orientation — where to start
- **API entry / middleware order / routes:** `backend/src/index.ts`
- **Env config (source of truth):** `backend/src/config.ts`
- **Data model:** `backend/prisma/schema.prisma` (+ `migrations/`)
- **AuthN/Z:** `backend/src/middleware/{auth,boardAuth,csrf,session}.ts`, `backend/src/services/auth.ts`
- **SPA shell + routing/guards:** `frontend/src/App.tsx`, `frontend/src/components/layout/AppShell.tsx`
- **HTTP client (CSRF/credentials):** `frontend/src/lib/api.ts`
- **Sanitizer entry:** `sanitization-service/app/main.py`
- **Run locally:** `./launch-local.sh install` then `./launch-local.sh start`

## Key facts
- 262 source files; ~21k backend TS, ~25k frontend TS/TSX, ~11k Python.
- Core relationship: **Assignment → Project → BoardCard** (Phase 24-R03 Project entity; one card per project; app-layer dedupe key `(name, clientId, sortedTags)`).
- Three domains share one SQLite DB: identity/security, scheduling/planner, kanban board (+ AI/templating models).
- Redis + SQLite are required; sanitizer/gotenberg/clamav are optional (degrade to 503).
- Feature-flagged surfaces (default off): template adapter, executive report, document processing.

## Validation Notes (contradictions / drift)
- **Planning state vs code drift:** VBW roadmap shows Phase 22 (Kanban UI) in-progress, but board features (KanbanCard/Column, CardDetailModal, files/notes, Project entity) are already merged to `master`. Session start flagged `roadmap_vs_summaries` drift. **Trust the code over the planning artifacts.**
- **Mapped at git `b782856`**, replacing the prior map at `994823d` (2026-02-12) which predated the entire board + Project-entity + sanitization-adapter work — hence full re-map.
- **Hardcoded `CLIPROXY_API_KEY` default** in `config.ts` and `DISABLE_VIRUS_SCAN` bypass are real findings, not artifacts — see CONCERNS.md #1/#2.
- **Two launchers** (`launch-local.sh`, `launcher.sh`) coexist; `launch-local.sh` is the actively-edited dev entrypoint.
- Tier note: 262 files → would be `duo`, but Agent Teams are not enabled, so this map was produced **solo** despite `prefer_teams=always`.
