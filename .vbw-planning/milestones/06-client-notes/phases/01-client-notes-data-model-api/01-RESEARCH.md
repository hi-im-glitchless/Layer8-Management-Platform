---
phase: "01"
title: "Client Notes — Data Model + API"
type: research
confidence: high
date: 2026-07-10
---

## Summary

- **Correction to the phase brief:** the notes fields the brief calls the "Project notes pattern" do NOT live on `Project`. They live on `BoardCard` (`backend/prisma/schema.prisma:315-341`, fields at lines 324-329). `Project` (schema.prisma:296-313) has no `notes` column at all. The line numbers in the ROADMAP/context doc are correct — only the model name is wrong. The plan should mirror `BoardCard.notes` / `notesUpdatedAt` / `notesUpdatedBy`, not a nonexistent `Project.notes`.
- `notesUpdatedBy` is stamped with the editing user's **id** (`req.session.userId`), never a username or display name — confirmed in `boardNotesService.updateNotes` (`backend/src/services/boardNotesService.ts:18-33`).
- **No existing notes-write path calls the audit log.** `boardNotesService.updateNotes` (board card notes) and the existing `POST/PUT/DELETE /clients` routes in `schedule.ts` (client CRUD) both mutate data with zero `logAuditEvent` calls. Phase 1's requirement that client-notes writes MUST be audited is a **new** pattern for this codebase, not a copy of an existing call site — I found the nearest comparable real precedent instead: `boardAdmin.ts`'s `board.card.archive` handler (PM/ADMIN-gated mutation + explicit `logAuditEvent` call with an `extractIp` helper).
- Client routes already exist — there is **no** `backend/src/routes/clients.ts`. All client CRUD (`GET/POST/PUT/DELETE /clients`) lives inside `backend/src/routes/schedule.ts:565-645`, mounted under `/api/schedule`. The idiomatic extension point is a new nested route on that same router (e.g. `/clients/:id/notes`), not a new top-level file.
- The bulk client list (`GET /api/schedule/clients` → `{clients: Client[]}`) is consumed by at least 4 frontend components (`AssignmentModal`, `ClientManager`, `BoardFilters`, `client-combobox.tsx`) and its `Client` type has no `notes` field. Adding `notes` to that bulk payload would be wasteful — a separate per-client endpoint is warranted, matching the phase brief's plan.
- **Cross-phase finding relevant to Phase 3:** the board-card read path (`boardService.listCards` / `getCard`, `backend/src/services/boardService.ts:144-209`) already joins `Project.client` with `select: { id, name, color }`. Phase 3 will most likely NOT need a new fetch — it can extend this existing `client: { select: {...} }` to include `notes` (and possibly `notesUpdatedAt`/`notesUpdatedBy`) directly in `boardService.ts`. Flagging this now so Phase 1's "read endpoint" scope doesn't overlap/conflict with what Phase 3 actually ends up using.
- Datasource is confirmed SQLite (`better-sqlite3` adapter), single file, via `DATABASE_URL` (default `file:./dev.db`) — `backend/src/db/prisma.ts:8-38`.
- **Production deploy does not replay checked-in migrations.** `launcher.sh`'s update path runs `npx prisma db push` (not `migrate deploy`) against `prod.db` — see Migration Mechanics section. This is a real live-DB consideration the plan must account for.
- Tests for comparable routes run against the real dev SQLite DB (no Prisma mocking), with a hand-rolled Express app + session-injecting middleware and `fetch()`-based HTTP assertions. Two strong templates exist to copy: `boardAdminArchive.test.ts` and `boardPatchChecklistAccess.test.ts`.

## Project Notes Pattern (to mirror)

Correcting the brief: the pattern to mirror is `BoardCard.notes`, reached via `board.ts` → `boardNotes.ts` (sub-router) → `boardNotesService.ts`.

**Schema** (`backend/prisma/schema.prisma:315-333`):
```prisma
model BoardCard {
  id             String    @id @default(cuid())
  projectId      String    @unique
  stage          String    @default("upcoming")
  checklist      String    @default("[]")
  notes          String    @default("")
  /// Timestamp of the most recent notes edit; drives "last edited by ... at ..." UI
  notesUpdatedAt DateTime?
  /// Free-form user ID of the last notes editor — intentionally not a relation to keep
  /// migrations trivial and avoid cascade noise when users are removed
  notesUpdatedBy String?
  ...
}
```
This is the exact shape the phase context wants replicated onto `Client`: a plain `String?` for the editor id (deliberately **not** a Prisma relation), matching the comment's stated rationale ("avoid cascade noise when users are removed").

**Route** (`backend/src/routes/boardNotes.ts:1-45`), mounted from `board.ts` at `/cards/:cardId/notes` with `mergeParams: true`:
```ts
router.patch('/', requireAuth, requireCardAccess, mutationRateLimiter, async (req, res) => {
  try {
    const { notes } = z.object({ notes: z.string() }).parse(req.body);
    const cardId = (req.params.cardId ?? req.params.id) as string;
    const updated = await updateNotes(cardId, notes, req.session.userId!);
    res.json({ card: updated });
    emitBoardInvalidate('cards');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[board routes] Error updating notes:', error);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});
```
Note the auth gate here is `requireCardAccess` (ownership/assignment-based), not `requireRole('PM')` — Phase 1's write gate is stricter/simpler (`requireRole('PM')` per the ROADMAP), so this route is a shape reference, not an auth reference.

**Service** (`backend/src/services/boardNotesService.ts:18-33`) — the exact attribution stamp to mirror:
```ts
export async function updateNotes(cardId: string, notes: string, editorUserId: string) {
  return prisma.boardCard.update({
    where: { id: cardId },
    data: {
      notes,
      notesUpdatedAt: new Date(),
      notesUpdatedBy: editorUserId,
    },
    select: {
      id: true,
      notes: true,
      notesUpdatedAt: true,
      notesUpdatedBy: true,
    },
  });
}
```
`editorUserId` is `req.session.userId!` — confirmed this is the raw user `id` (cuid), not `username` or `displayName`. Phase 2's "last edited by X" UI will need to resolve this id to a display name client-side or via a join, same as the board feature presumably does elsewhere (not investigated further — out of Phase 1 scope, but worth flagging: no `User` relation exists on `notesUpdatedBy` in `BoardCard` today, so resolving the display name means either a lookup or keeping the relation-less convention and resolving names client-side from an already-fetched users list).

## Audit Log Integration

**Helper signature** (`backend/src/services/audit.ts:4-9, 46`):
```ts
export interface AuditEvent {
  userId?: string | null;
  action: string;
  details: Record<string, unknown>;
  ipAddress: string;
}
export async function logAuditEvent(event: AuditEvent): Promise<void>
```
Internally it's a `prisma.$transaction` with `isolationLevel: 'Serializable'` that reads the last `AuditLog.hash`, computes `sha256(previousHash + JSON.stringify({userId, action, details, ipAddress, timestamp}))`, and inserts a new row with `previousHash`/`hash`. **A new caller does not need to do anything special for the hash chain** — just call `logAuditEvent(...)` and the chain-linking is handled internally and atomically. The only caller obligation is picking a stable, unique `action` string and a JSON-serializable `details` object.

**Action naming convention:** free-form dot-separated strings, no enum, pattern is `{domain}.{resource}.{verb}` or `{domain}.{verb}` (e.g. `board.card.archive`, `board.file.upload`, `adapter.upload`, `report.generate`, `admin.llm.settings.update`, `access.denied`). For Phase 1, `client.notes.update` (or `client.notes.write`) fits the established convention.

**No mutation of `Client` or `BoardCard.notes` currently calls `logAuditEvent`** — I verified this directly by reading both `clientService.ts` (no audit import at all) and `boardNotesService.ts`/`boardNotes.ts` (no audit import). So Phase 1 is not "matching an existing audited-notes-write example" — it is the first notes-write path in the app to carry an audit entry. The closest real precedent for "PM/ADMIN-gated single mutation + audit + attribution" is `boardAdmin.ts`'s archive handler:

**Real call site** (`backend/src/routes/boardAdmin.ts:28-35, 46-67`):
```ts
function extractIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

router.post('/archive', requireAuth, requireRole('ADMIN'), mutationRateLimiter, async (req, res) => {
  try {
    const cardId = (req.params.cardId ?? req.params.id) as string;
    const adminUserId = req.session.userId!;
    const details = await archiveCard(cardId, adminUserId);
    await logAuditEvent({
      userId: adminUserId,
      action: 'board.card.archive',
      ipAddress: extractIp(req),
      details: { ...details },
    });
    res.json({ success: true, ...details });
    emitBoardInvalidate('cards');
    emitBoardInvalidate('files');
  } catch (error) { ... }
});
```
The `extractIp` helper is duplicated verbatim across `boardAdmin.ts`, `boardFiles.ts`, and `auth.ts` (`backend/src/middleware/auth.ts:7-13`, same x-forwarded-for → req.ip → socket.remoteAddress → `'unknown'` precedence) — comments in `boardAdmin.ts:24-27` explicitly note it's "co-located until a shared `lib/requestIp.ts` is introduced." Phase 1's write route should copy this exact 5-line helper (or add a shared one, at the plan's discretion) rather than inventing a different IP-extraction strategy.

**Suggested Phase 1 shape**, following this precedent:
```ts
await logAuditEvent({
  userId: req.session.userId!,
  action: 'client.notes.update',
  ipAddress: extractIp(req),
  details: { clientId, clientName: client.name },
});
```
`logAuditEvent` is called **after** the DB write succeeds (matches the archive pattern — write first, then audit, then respond), not wrapped into the same Prisma transaction as the `Client` update (the two services already establish that audit logging is a separate call, not transactionally joined to the resource mutation).

## Client Routes & Recommended Endpoint Shape

**No dedicated `clients.ts` route file exists.** All client CRUD lives in `backend/src/routes/schedule.ts:565-645`, mounted under `/api/schedule` (confirmed via frontend's `apiClient<...>('/api/schedule/clients')` calls). Current endpoints:

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/clients` | `requireAuth` (all roles) | Lists all clients, `{clients: Client[]}` |
| POST | `/clients` | `requireRole('PM')` | Create, body `{name, color}` |
| PUT | `/clients/:id` | `requireRole('PM')` | Update, body `{name?, color?}` |
| DELETE | `/clients/:id` | `requireRole('PM')` | Delete |

Backing service: `backend/src/services/clientService.ts` — thin wrappers around `prisma.client.*` with a `P2002`-to-friendly-error mapper for the unique `name` constraint. No audit calls, no socket-invalidation emits (unlike `team-members` which does call `emitScheduleInvalidate('team-members')` on create).

**Recommendation (convention-derived, not just preference):** extend this same `schedule.ts` router with two new nested routes rather than creating a new `clients.ts` file or a new top-level router:
- `GET /api/schedule/clients/:id/notes` — `requireAuth` only (all roles, per the ROADMAP's explicit requirement that Phase 3 needs all-role read access).
- `PUT /api/schedule/clients/:id/notes` (or `PATCH`, matching `boardNotes.ts`'s verb choice for a notes-blob update) — `requireRole('PM')`.

Reasoning: every other client operation is already namespaced under `/api/schedule/clients` in this one file; the codebase's convention for "notes as a sub-resource of a parent entity" is exactly the `board.ts` → `/cards/:cardId/notes` sub-router pattern, but that pattern exists because `board.ts` itself is a large router being decomposed into sub-routers (`boardNotes.ts`, `boardAdmin.ts`, `boardFiles.ts`, etc. — all `mergeParams: true` sub-routers mounted from `board.ts`). `schedule.ts` has **not** been decomposed this way — team-members, assignments, absences, holidays, project-colors, clients, and project-tags are all inline in the one file. Following that established convention, client-notes routes belong inline in `schedule.ts` next to the existing `// ── Clients ──` section, not as a new sub-router file. If `schedule.ts` were later split (it is not currently), notes would be the natural first sub-router to extract — but Phase 1 should not do that split unprompted.

Placing `:id/notes` under `/clients/:id/notes` (rather than putting notes fields directly on the existing `PUT /clients/:id`) is justified by: (a) the ROADMAP's explicit split of read-all-roles vs write-PM-only auth, which the existing `PUT /clients/:id` (PM-only, no read variant) cannot express without splitting; (b) mirroring `boardNotes.ts`'s precedent of notes-as-its-own-endpoint even though `BoardCard` also has a general PATCH.

## Frontend Client Fetch (Phase 2/3 forward-look)

**Bulk fetch** — `frontend/src/features/schedule/api.ts:189-191`:
```ts
async getClients() {
  return apiClient<{ clients: Client[] }>('/api/schedule/clients')
},
```
Backed by `useQuery({ queryKey: ['schedule', 'clients'], ... })` in `frontend/src/features/schedule/hooks.ts:282`. `Client` type (`frontend/src/features/schedule/types.ts:120-126`):
```ts
export interface Client {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}
```
No `notes` field. Consumers of this bulk list: `AssignmentModal.tsx`, `ClientManager.tsx`, `BoardFilters.tsx`, `client-combobox.tsx` (via `ClientCombobox`). None of these need notes content — they render name/color for selection/filtering. **Adding `notes` (an unbounded markdown blob) to this bulk list would bloat every one of those fetches for no benefit.** A separate per-client fetch, as the ROADMAP already plans (Phase 2's modal, Phase 1's read endpoint), is correct.

**Card-level client join (relevant to Phase 3):** `backend/src/services/boardService.ts:144-209` (`listCards` / `getCard`) already does:
```ts
project: {
  include: {
    client: { select: { id: true, name: true, color: true } },
    ...
  },
},
```
This means the planner card's data-fetch path *already* carries the owning client through to the frontend, just without `notes`. Phase 3's "the card's data source must carry the owning client's notes" (ROADMAP) is most naturally satisfied by widening this `select` to add `notes` (and optionally `notesUpdatedAt`/`notesUpdatedBy` if Phase 3 wants an attribution string on the read-only section) rather than issuing a second network call from `CardDetailModal`. Phase 1 should decide whether its "read endpoint" is meant for this join-based use case too, or purely for Phase 2's standalone per-client fetch — recommend Phase 1's success criteria stay scoped to the standalone endpoint, and note in the plan that Phase 3 may satisfy its own read requirement via `boardService.ts`'s existing include rather than calling Phase 1's endpoint at all. This isn't a Phase 1 blocker but avoids the plan asserting Phase 3 "reuses the Phase 1 endpoint" when it more likely reuses the existing card-fetch join.

## Migration Mechanics

- Migrations are checked in under `backend/prisma/migrations/` (11 existing migration folders, most recent: `20260514130000_project_entity`). Dev workflow is `npm run db:migrate` → `prisma migrate dev` (`backend/package.json:11`), which both creates the SQL file and applies it to the dev DB, updating `_prisma_migrations`.
- **Datasource confirmed SQLite**: `backend/prisma/schema.prisma:8-10` (`provider = "sqlite"`), backed by `@prisma/adapter-better-sqlite3` in `backend/src/db/prisma.ts:12-13, 38`. Single-file DB, path from `DATABASE_URL` (default `file:./dev.db` relative to `backend/`), resolved to absolute path at startup.
- **Precedent for an additive-columns-only migration**: `backend/prisma/migrations/20260506151736_phase_23_files_notes/migration.sql` starts with exactly this shape —
  ```sql
  -- AlterTable
  ALTER TABLE "BoardCard" ADD COLUMN "notesUpdatedAt" DATETIME;
  ALTER TABLE "BoardCard" ADD COLUMN "notesUpdatedBy" TEXT;
  ```
  (that same migration also does an unrelated `RedefineTables` block for `BoardComment`/`BoardFile` because of an added FK-bearing column elsewhere in the same migration — Phase 1's migration, if it touches only `Client` and adds 3 nullable/defaulted columns, should be a much simpler pure-`AlterTable` migration with no table redefinition needed, since none of the 3 new columns need a FK or NOT NULL-without-default.)
- ⚠ **Live-DB consideration — production does NOT use `prisma migrate deploy`.** `launcher.sh` (the production install/update script) runs, for both fresh installs (`launcher.sh:136-137`) and in-place updates (`launcher.sh:699-703`):
  ```bash
  sudo -u "$APP_USER" npx prisma generate
  sudo -u "$APP_USER" npx prisma db push
  ```
  `db push` diffs the current `schema.prisma` against the live DB and applies the delta directly — it does **not** consult or replay the checked-in `migrations/` folder, and does not write to `_prisma_migrations`. This means: (1) the migration SQL file the plan creates via `prisma migrate dev` is only actually *exercised* in local dev / CI, not in the documented production update path; (2) `db push` will still correctly apply the net new columns to `prod.db` on next deploy since `db push` reads `schema.prisma`, not migration history — so there's no functional risk for this specific additive change (3 new columns, all nullable or defaulted, no data transformation needed); (3) but this is a **pre-existing inconsistency in this repo's deploy tooling**, not something Phase 1 should try to fix — flag it in the plan as a known-open item if the user wants `launcher.sh` switched to `migrate deploy` at some point, but do not scope that change into this phase.
  - By contrast, `launch-local.sh:259, 322` (a different, apparently more recent script) DOES run `npx prisma migrate deploy` for its equivalent steps. Two deploy scripts in this repo disagree on migration strategy — worth surfacing to the user/Lead, not silently picking one.
- **No seed script needs updating.** Neither `backend/src/scripts/seed-admin.ts` (`npm run seed`) nor `backend/src/scripts/seed-e2e.ts` (`npm run seed:e2e`) references `client` at all — grep for `client` in `seed-e2e.ts` returned zero matches. Existing/newly-created clients will pick up `notes: ""` (schema default) automatically; no seed changes required.
- Migration is purely additive (`ADD COLUMN` with `@default("")` for `notes`, nullable for the two `DateTime?`/`String?` attribution fields) — safe against SQLite's `ALTER TABLE ADD COLUMN` semantics, no backfill needed, no risk to the 274-row-ish `Client` table's existing rows (they'll read back `notes: ""`, `notesUpdatedAt: null`, `notesUpdatedBy: null`).

## Testing Conventions

Representative files: `backend/src/routes/__tests__/boardAdminArchive.test.ts` and `backend/src/routes/__tests__/boardPatchChecklistAccess.test.ts`.

- **Real test DB, no Prisma mocking.** `backend/vitest.config.ts:8-19` points `DATABASE_URL` at an absolute path to `backend/dev.db` and sets `NODE_ENV: 'test'`. Tests import the real `prisma` client (`backend/src/db/prisma.ts`) and do real `create`/`update`/`delete` calls, wrapped in a `withDbRetry` helper (5 attempts, jittered backoff) to absorb SQLite single-writer lock contention when vitest workers run in parallel.
- **Auth/roles are mocked via a session-injecting Express middleware**, not by mocking `requireAuth`/`requireRole` themselves — the real middleware runs, but a preceding middleware stuffs `req.session` directly:
  ```ts
  app.use((req, _res, next) => {
    (req as unknown as { session: Record<string, unknown> }).session = {
      userId: adminUserId,
      role: 'ADMIN',
      totpVerified: true,
    };
    next();
  });
  ```
  The multi-role variant (`boardPatchChecklistAccess.test.ts:96-109`) keys off an `x-test-user` request header to pick from a `sessions` map (`assigned`/`unassigned`/`pm`/`admin`), letting one Express app + one HTTP server serve every role in the same test file.
- Tests spin up a real `http.Server` via `app.listen(0, '127.0.0.1', ...)` and issue plain `fetch()` calls against it (not supertest) — `startServer` helper is duplicated verbatim across both files.
- `mutationRateLimiter`/`readRateLimiter` are skipped automatically when `NODE_ENV === 'test'` (`backend/src/middleware/rateLimit.ts:42`, `skipInTest`), so tests don't need to work around rate limits.
- Cleanup: `afterEach` deletes seeded rows in reverse-FK order, each wrapped in `withDbRetry(...).catch(() => undefined)` so a partially-failed seed doesn't abort the rest of teardown. **Audit rows are explicitly never deleted** in teardown (comment: "the hash chain is append-only") — a Phase 1 test that triggers `logAuditEvent` should NOT try to clean up `AuditLog` rows; either don't assert on them across test runs, or query by a unique `action`+`details` marker instead of expecting a clean table.

**Sketch of the RBAC test structurally required by Phase 1** (NORMAL 403 write / 200 read):
```ts
// backend/src/routes/__tests__/clientNotesAccess.test.ts
// - buildApp(sessions) with x-test-user header → {normal, pm, admin} sessions
// - seedDataset(): creates 1 Client row (+ users normal/pm/admin)
// - GET /clients/:id/notes as 'normal' → 200, body has {notes, notesUpdatedAt, notesUpdatedBy}
// - GET /clients/:id/notes as 'pm'/'admin' → 200 (regression)
// - PUT /clients/:id/notes as 'normal' → 403
// - PUT /clients/:id/notes as 'pm' → 200, DB row's notes/notesUpdatedAt/notesUpdatedBy updated,
//     notesUpdatedBy === pm user's id (not username)
// - PUT /clients/:id/notes as 'admin' → 200 (regression, since requireRole('PM') admits ADMIN)
// - after a successful PUT, assert an AuditLog row exists with action 'client.notes.update'
//     (query by details.clientId marker rather than assuming table is empty at test start)
// - schedule-isolation snapshot: seed nothing in Assignment/TeamMember/Absence/Holiday,
//     assert none of those tables gain rows as a side effect of the notes write
```
This directly follows the `boardPatchChecklistAccess.test.ts` 8-case-matrix style (numbered `it()` blocks, before/after snapshots for the isolation assertion, `x-test-user` header dispatch).

## Schedule-Isolation Assessment

`Client` does have schedule-domain relations — `assignments: Assignment[] @relation("AssignmentClient")` and `splitAssignments: Assignment[] @relation("AssignmentSplitClient")` (`schema.prisma:281-282`) — but these are **inbound** relations only (Assignment has the FK `clientId`/`splitClientId` pointing at Client; Client itself carries no FK into Assignment). A `Client.notes` write is a single-column-scoped `prisma.client.update({ where: { id }, data: { notes, notesUpdatedAt, notesUpdatedBy } })` — it touches only the `Client` table's own row and cannot cascade into or read `Assignment`/`TeamMember`/`Absence`/`Holiday` unless the implementation explicitly does so.

**Plain statement: a Client.notes write, implemented as a plain `prisma.client.update` scoped to the notes columns, cannot violate the no-write boundary.** It also is not the same code path as the client CRUD (`updateClient` in `clientService.ts`) which itself only touches `name`/`color` — so even reusing that pattern doesn't risk drift into schedule tables.

What the plan must assert (as an explicit, checkable claim, following the precedent set by `boardPatchChecklistAccess.test.ts`'s case-8 isolation snapshot): the notes-write service function must be implemented with a `prisma.client.update({ where, data: { notes, notesUpdatedAt, notesUpdatedBy }, select: {...} })` call that references no other model, and a test should snapshot `Assignment`/`TeamMember`/`Absence`/`Holiday` row counts (or specific seeded rows) before and after the write to prove no incidental mutation. This mirrors exactly what `boardNotesService.ts`'s own header comment and `boardPatchChecklistAccess.test.ts` case 8 already do for the board-notes precedent — Phase 1 should add the same style of header comment to its new `clientNotesService.ts` (or wherever the function lands) stating the invariant, per the codebase's established convention of documenting this boundary at the top of every module that touches board/client data (`boardNotesService.ts:4-9`, `boardFileService.ts:2-8`, `boardNotes.ts:14-18`, `boardAdmin.ts:16-19`, `boardCard.ts` equivalents).

## Open Questions / Risks

1. **Which router file gets the new routes — confirm with the Lead/plan, not just this research.** Recommendation above is to extend `schedule.ts` inline (matching that file's own un-split convention), but the Lead may prefer a new `clientNotes.ts` sub-router mounted from `schedule.ts` with `mergeParams: true`, matching the `board.ts`/`boardNotes.ts` split pattern instead. Both are internally consistent with different parts of the codebase; this is a real judgment call, not a fact I can resolve by reading more code.
2. **Endpoint verb for the write (`PUT` vs `PATCH`).** Existing client CRUD in `schedule.ts` uses `PUT /clients/:id` for partial updates (`{name?, color?}` both optional). `boardNotes.ts` uses `PATCH /cards/:cardId/notes`. Phase 1 should pick one and state why — I'd lean `PUT` for consistency with the rest of `schedule.ts`'s client routes, but `PATCH` is arguably more semantically correct for a full-blob-replace-of-one-field operation like `boardNotes.ts` uses. Not resolved by codebase convention alone since the two nearby precedents disagree.
3. **Does the read endpoint response need to include `id`/`name`/`color` alongside notes, or just the notes+attribution fields?** Phase 2's modal already has client info from the bulk list before opening the modal — the ROADMAP's Phase 2 goal says the modal shows "the client's info ... alongside a notes editor," which the bulk-list fetch can already supply. Recommend the Phase 1 read endpoint return only `{ notes, notesUpdatedAt, notesUpdatedBy }` (thin, matching `boardNotesService.updateNotes`'s own `select`), letting Phase 2 combine it with the already-fetched bulk client record — but flag this as a decision for the plan, not a settled fact.
4. **`notesUpdatedBy` → display-name resolution is unsolved for both the existing `BoardCard` pattern and the new `Client` one.** `notesUpdatedBy` is a bare user id with no Prisma relation (by design, per the schema comment). Whatever component renders "last edited by X" (Phase 2) will need a way to turn that id into a display name — check whether `CardDetailModal.tsx` (the board equivalent) already solves this client-side (e.g. via a users-list already loaded in that context) before Phase 2 invents a new mechanism. Out of Phase 1's scope to solve, but Phase 1's API response shape (returning `notesUpdatedBy` as a raw id, matching `BoardCard`'s own convention) is the right call for consistency even though the *consumer* problem is unresolved.
5. **Two deploy scripts disagree on migration strategy** (`launcher.sh` → `db push`; `launch-local.sh` → `migrate deploy`) — surfaced above under Migration Mechanics. Not blocking for Phase 1 (the additive migration works fine under either strategy), but worth a one-line callout in the plan so the user isn't surprised if `_prisma_migrations` doesn't show the new row in production.
6. **No socket/query invalidation currently fires for client mutations** (`emitScheduleInvalidate` is called for `team-members` but not for any of the three existing `/clients` mutation handlers in `schedule.ts`). Phase 1 should decide whether the new notes-write route should emit an invalidation event (e.g. `emitScheduleInvalidate('clients')`) for consistency with `team-members`, or continue the existing clients-routes' pattern of relying purely on the frontend mutation's own `queryClient.invalidateQueries` (as `hooks.ts` already does for create/update/delete client). Recommend following the existing `/clients` mutations' own convention (no socket emit) since that's the more directly analogous precedent, over `team-members`' convention.

## Live Validation Evidence

Not applicable — this phase has no external/live data sources to probe. All findings above are static code reads (schema, routes, services, tests, deploy scripts) with no network or live-DB calls executed.
