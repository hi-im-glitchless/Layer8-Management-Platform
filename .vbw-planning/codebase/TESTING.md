# Testing

## Frameworks
| Service | Runner | Config | Env |
|---------|--------|--------|-----|
| Backend | Vitest 4 (node env) | `backend/vitest.config.ts` | injects `DATABASE_URL=file:<abs>/dev.db`, `NODE_ENV=test`, test `SESSION_SECRET`, `REDIS_URL` |
| Frontend | Vitest 4 (jsdom) | `frontend/vitest.config.ts` | `setupFiles: src/test-setup.ts`, globals, `@testing-library/*` |
| Sanitization | pytest (+pytest-asyncio) | `sanitization-service/pyproject.toml` | markers: `unit`, `requires_spacy` |

## Commands
- Backend: `npm test` (`vitest run`), `npm run test:watch`, `npm run test:coverage` (v8 provider, text/json/html).
- Frontend: no `test` script in `package.json` — run via `npx vitest run` (config present; `*.test.tsx` files exist).
- Sanitization: `pytest` (testpaths=`tests`, `-v --tb=short`).

## What is covered
- **Backend** (`src/**/__tests__`): concentrated on the AI/template + report pipelines and phase-isolation:
  - routes: `templateAdapter.test.ts`, `templateAdapterAnnotation.test.ts`, `templateAdapterDownload.test.ts`
  - services: `templateAdapter`, `templateMapping`, `ghostwriter`, `ghostwriterMapper`, `pdfQueue`, `wizardState`, and `scheduleIsolation.phase23.test.ts` (guards that board/phase work does not corrupt schedule data — scoped to seeded ids only)
  - fixtures: `services/__tests__/fixtures/gw-report-1.json`
- **Frontend:** sparse — `features/adapter/components/__tests__/MappingOverlayCard.test.tsx`. Most UI is untested.
- **Sanitization service:** the most thoroughly tested unit — ~30 pytest modules covering recognizers, docx parse/generate roundtrip, rules engine, gap detector, compliance matrix, prompt builders, report builder/narrative, template renderer, adapter pipeline/routes/e2e. Fixtures: `sample.docx`, `synthetic_reports.py`, `gw_fixture.py`.

## Patterns
- Tests are co-located in `__tests__/` (TS) and a top-level `tests/` (Python).
- Backend tests run against a **real SQLite file** (`dev.db`) and may expect Redis — they are integration-leaning, not pure unit. Seeded-id scoping is used to isolate phase-specific assertions.
- spaCy-dependent Python tests are marked `requires_spacy` so they can be skipped where models aren't installed.

## Gaps / risks
- **Core scheduling + board backend logic** (`scheduleService`, `assignmentService`, `boardService`, `projectService`) has little direct unit coverage relative to its complexity (split cells, dedupe key, stage locks).
- **Frontend** is effectively untested beyond one component; auth guards, RBAC, and the schedule/board DnD interactions rely on manual verification.
- No CI config detected in-repo; tests appear to be run locally/ad hoc.
- A known accepted lint issue exists in `KanbanCard` (DEVN-05) — non-blocking, do not re-open.
