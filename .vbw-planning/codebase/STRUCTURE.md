# Structure

262 source files. Monorepo, 3 services, no root workspace manifest.

## Top level
```
.
├── backend/                # Express + Prisma API (TypeScript ESM)
├── frontend/               # React 19 + Vite SPA (TypeScript)
├── sanitization-service/   # FastAPI PII/docx/report microservice (Python)
├── deploy/                 # nginx-layer8.conf, layer8.service (systemd)
├── docker-compose.yml      # gotenberg + clamav sidecars only
├── launch-local.sh         # dev orchestration (start/stop/install/rebuild/reset-password/...)
├── launcher.sh             # full launcher
├── DEPLOYMENT-GUIDE.md     # ~55KB ops guide
├── .env.example            # production env template
└── .vbw-planning/          # VBW planning artifacts (this map lives in codebase/)
```

## backend/src
```
index.ts            # app bootstrap, middleware order, route mounting, socket.io init
config.ts           # zod-validated env → `config`
db/                 # prisma.ts (singleton, driver adapter), redis.ts
middleware/         # auth, boardAuth, audit, csrf, features, rateLimit, session
routes/             # one router per domain (auth, admin, users, schedule, board,
                    #   board{Admin,Comments,Files,Members,Notes,Notifications},
                    #   projects, profile, audit, denyList, documents, llm,
                    #   ghostwriter, templateAdapter, executiveReport, sanitization)
  __tests__/        # route-level tests (templateAdapter*)
services/           # business logic + Prisma access (see below)
  llm/              # client.ts, retry.ts, audit.ts, providers/{anthropic,cliproxy}.ts
  __tests__/        # service tests + fixtures
scripts/            # seed-admin.ts, seed-holidays.ts
types/              # express.d.ts (session augmentation), ghostwriter.ts, llm.ts, mammoth.d.ts
```
Notable services: `auth`, `audit`, `session`, `socketService`, `scheduleService`, `assignmentService`, `absenceService`, `holidayService`, `clientService`, `projectService`, `boardService` + `board{Archive,Comment,File,Notes,Notification}Service`, `clamService`, `htmlSanitizer`, `docxToHtml`, `documents`, `pdfQueue`, `reportService`, `reportWizardState`/`wizardState`, `templateAdapter`/`templateMapping`/`templateScan`, `ghostwriter`/`ghostwriterMapper`, `denyList`, `settings`, `sanitization`.

## backend/prisma
```
schema.prisma                 # 4 enums/models groups (~21 models)
migrations/                   # 11 timestamped migrations (init_with_rbac → board_card_side → project_entity)
backfill-zones.ts             # data backfill
```
Plus `backend/scripts/` one-offs: `clamav-eicar-check.ts`, `dryrun-project-dedupe.ts`.

## frontend/src
```
main.tsx, App.tsx, index.css, test-setup.ts
routes/             # page wrappers: Dashboard, Schedule, Board, Admin, AuditLog,
                    #   Profile, Login, Documents, ExecutiveReport, TemplateAdapter, NotFound
features/<domain>/  # api.ts + hooks.ts + types.ts + components/  (feature-sliced)
  adapter/  admin/  audit/  auth/  board/  dashboard/
  documents/  executive-report/  profile/  schedule/
components/
  ui/               # shadcn primitives (~30 files: button, dialog, table, select, ...)
  layout/           # AppShell, Header, Sidebar, ThemeToggle
  admin/  auth/  llm/
hooks/              # useStreamingLLM.ts
lib/                # api.ts (fetch+CSRF), llm-api.ts, rbac.ts, utils.ts
```
Two largest feature slices: `schedule/` (grid, assignment cells/modal, clients, holidays, team mgmt, export) and `executive-report/` + `adapter/` (multi-step wizards for the AI report/template pipelines). `board/` holds the kanban (KanbanColumn, KanbanCard, CardDetailModal, FilesPanel, NotesEditor, BoardFilters, ArchiveCardDialog, useBoardSync).

## sanitization-service/app
```
main.py, config.py, health.py
routes/        # sanitize, docx, adapter, report
services/      # sanitizer, docx_parser/generator, *_prompt builders, rules_engine,
               #   report_builder, template_renderer, blueprint_detector, gap_detector, ...
recognizers/   # ip_address, domain, hostname, ad_objects, network_paths
operators/     # mapping_replace
models/        # pydantic: request, response, docx, adapter, report, gap_detection
tests/         # ~30 pytest modules + fixtures (sample.docx, synthetic_reports, gw_fixture)
```

## Naming geography
- Backend: one `<domain>.ts` route ↔ `<domain>Service.ts`. Board sub-resources split into many small routers/services. camelCase files.
- Frontend: feature dirs lowercase/kebab; React components PascalCase `.tsx`; non-component modules camelCase `.ts`.
- Path aliases: `@/*` → `src/*` in both backend (tsconfig) and frontend (vite + tsconfig).
