# Conventions

## Language / module
- **TypeScript everywhere** (backend + frontend), `strict: true`.
- Backend is **ESM** (`"type": "module"`, `module: NodeNext`) — **relative imports use `.js` extensions** even for `.ts` sources (e.g. `import { config } from './config.js'`). Match this when adding backend imports.
- Path alias `@/*` → `src/*` in both services (backend `tsconfig.paths`, frontend vite+tsconfig). Frontend mixes `@/...` aliases and relative imports.
- Backend dev runs via `tsx` (no compile step); `npm run build` = `tsc` to `dist/`. Frontend build = `tsc -b && vite build`.

## File / symbol naming
- Backend routes: `routes/<domain>.ts` exporting a default Express router; paired logic in `services/<domain>Service.ts` (or `services/<domain>.ts`).
- Frontend: components `PascalCase.tsx`; hooks/api/types/util modules `camelCase.ts`; feature directories lowercase or kebab (`executive-report`).
- React component files export a named component (`export function Dashboard()`); `App` is default-exported.
- Tests: co-located in `__tests__/` dirs, `*.test.ts(x)` (TS) / `test_*.py` (Python).

## Backend patterns
- **Config:** all env access goes through the zod-validated `config` object (`src/config.ts`) — do not read `process.env` directly in app code (DB/redis bootstrap excepted).
- **Data access:** import the shared `prisma` singleton from `db/prisma.js`; routes delegate to services, services own Prisma queries.
- **Auth on routes:** apply `requireAuth` / `requireRole(min)` from `middleware/auth.ts`; board sub-resources use `requireCardAccess` from `middleware/boardAuth.ts`; feature routes wrapped with `requireFeature(FLAG)`.
- **Validation:** zod schemas for request bodies (mirrors config style).
- **Audit:** security-relevant actions call `logAuditEvent(...)` (fire-and-forget, `.catch` logged) — preserves the hash chain. Access denials auto-audited in `middleware/auth.ts`.
- **JSON-in-SQLite:** array/structured columns stored as JSON strings (`tags`, `splitTags`, `checklist`, audit `details`) with `@default("[]")` / `"{}"`; parse/stringify at the service boundary.
- **Async boot:** server start is wrapped in `startServer()` with try/catch → `process.exit(1)`; optional services probed non-blocking.

## Frontend patterns
- **Server state** via TanStack Query hooks in `features/<domain>/hooks.ts`; **all HTTP** through `lib/api.ts` `apiClient<T>` (never raw `fetch` in components) — it injects credentials + CSRF and handles 401 redirect.
- **Forms:** `react-hook-form` + zod resolver.
- **UI:** compose Radix-based primitives from `components/ui/*`; styling via Tailwind utility classes + `cn()` (`lib/utils.ts`, `clsx`+`tailwind-merge`); variants via `class-variance-authority`.
- **Routing/guards:** wrap protected pages in `ProtectedRoute`/`RoleProtectedRoute`; gate UI affordances with `hasRole()` (`lib/rbac.ts`) — but treat the server as the authority.
- **Realtime:** subscribe via the feature sync hooks (`useBoardSync`, `useScheduleSync`) rather than ad-hoc sockets.
- **Notifications:** `sonner` `toast`.

## Comment style
- Comments are used deliberately to record **why** + cross-phase rationale (frequent `Phase NN-RNN` references, "NON-NEGOTIABLE" guards, security notes like the `/uploads/board` 403 short-circuit). When touching guarded code, keep/extend these rationale comments rather than dropping them.

## Tooling
- Lint: frontend ESLint 9 flat config (`eslint.config.js`); backend has no eslint config checked in (relies on `tsc strict`).
- No Prettier config committed; follow surrounding formatting (2-space indent).
- `prisma.config.ts` defines schema + migrations path + datasource from `DATABASE_URL`.
