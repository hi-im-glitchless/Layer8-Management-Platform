# Patterns

Recurring patterns to imitate when extending the codebase.

## Architectural
- **Thin route → service → prisma layering** (backend). Routers validate + authorize; services hold logic and own all Prisma calls; `db/prisma.js` is the single client. Add a new domain as `routes/<x>.ts` + `services/<x>Service.ts`.
- **Feature slices** (frontend). Each domain = `features/<x>/{api.ts, hooks.ts, types.ts, components/}`. `api.ts` calls `apiClient`; `hooks.ts` wraps it in TanStack Query; pages in `routes/` compose components.
- **Feature flags as middleware gates.** New optional surfaces mount behind `requireFeature('FEATURE_*')` and default off in `config.ts`.
- **Singletons for shared infra.** `prisma`, Redis, and Socket.IO `io` are module singletons (with dev hot-reload guard on prisma). Reuse, don't re-instantiate.
- **Provider fallback chain** (LLM): primary `CLIProxyProvider` → optional `AnthropicProvider`, with per-feature model resolution in `LLMClient.resolveModel`. Mirror this for any new external provider.

## Security
- **Defense-in-depth request pipeline**: helmet CSP/HSTS → CORS → session → CSRF → rate-limit, with health/csrf endpoints registered before gates. Order matters; preserve it.
- **Auth via session + TOTP flags**: `requireAuth` checks `userId && !awaitingTOTP && totpVerified`; `requireRole(min)` adds hierarchy. Socket.IO reuses the same session predicate.
- **Audit-on-deny**: middleware fires `logAuditEvent('access.denied', …)` fire-and-forget on every rejection.
- **Hash-chained audit log**: `previousHash → hash` SHA-256 per entry from a genesis seed; verifiable end-to-end (`/api/audit/verify`). Never write `AuditLog` directly — go through `services/audit.ts`.
- **Auth-gated downloads**: sensitive files (board) are *not* served by static middleware — `/uploads/board` is 403'd and downloads run through `requireCardAccess` + audit. Follow this for any private file surface.
- **Client RBAC mirrors server** (`lib/rbac.ts` ↔ `middleware/auth.ts` hierarchy) but server is authoritative.

## Naming
- Backend pairs: `<domain>.ts` route ↔ `<domain>Service.ts`. Board sub-resources fan out into many small routers/services (`boardComments`, `boardFiles`, `boardNotes`, `boardNotifications`, `boardMembers`, `boardAdmin`).
- ESM relative imports carry **`.js`** suffixes in backend `.ts` sources.
- `@/*` alias for `src/*` in both services.
- Frontend: PascalCase components, camelCase modules, kebab/lower feature dirs.

## Data
- **JSON-encoded TEXT columns** for arrays/structured data in SQLite (`tags`, `splitTags`, `checklist`, audit `details`) with `@default("[]")`/`"{}"`; serialize at the service boundary.
- **Application-layer identity keys**: `Project` dedupe `(name, clientId, sortedTags)` enforced in `projectService.upsertByKey`, not by a DB unique constraint. Canonical tag sort is a service responsibility.
- **Split-entity columns**: `Assignment` models split cells via parallel `split*` fields (name/color/status/client/tags/projectId) rather than a child table.
- **Soft delete + edit tracking**: `BoardComment.isDeleted/deletedAt/editedAt`; notes carry `notesUpdatedAt/notesUpdatedBy`. Prefer soft-delete + provenance over hard delete for user content.
- **Nullable FKs with `onDelete: SetNull`** for optional associations (client/project on assignments) so deletes don't cascade destructively.

## Realtime / collaboration
- **Session-shared Socket.IO** + per-feature sync hooks (`useBoardSync`, `useScheduleSync`); mutations broadcast so multiple clients converge. New collaborative surfaces should emit through `socketService` and a matching client hook.

## Config / validation
- **zod at boundaries**: env (`config.ts`, fail-fast `process.exit(1)`) and request bodies. Add new env vars to the schema with sane defaults (or required for secrets).

## Cross-phase rationale comments
- Code carries `Phase NN-RNN` provenance and "NON-NEGOTIABLE" guard comments documenting *why* an ordering/restriction exists. Keep and extend these when modifying guarded paths.
