## Phase 3 Context (Compiled)

### Milestone Scope Context

Gathered: 2026-06-03
Calibration: builder

## Scope Boundary

**Board Refinements** — a set of post-ship tweaks and fixes to the Project Board
("Planner") shipped in the previous milestone. Four user-requested changes:
1. Archive a card without typing the project name (drop the type-to-confirm gate).
2. Add a new board column/stage: "Stopped".
3. Fix: any user with access to a card can download any file on it (not only files they uploaded).
4. Auto-scroll the board horizontally while dragging a card near the edge.

## Decomposition Decisions

### Phase Count & Grouping
Three phases. The two board-UI changes (Stopped column #2 + horizontal drag
auto-scroll #4) are grouped into Phase 1 because they share the same surface —
the Kanban board's stage list and drag context (`Board.tsx`, `KanbanColumn`,
stage types, and the backend stage enum/validation) — so doing them together
avoids file conflicts and lets them share one QA/UAT pass. The archive change (#1)
and the file-download fix (#3) are independent concerns touching disjoint files
(ArchiveCardDialog/admin-archive route vs. the file-download route/service), so
each is its own phase for clean, independent verification.

### Phase Ordering
1. **Stopped column + drag auto-scroll** — largest (spans frontend stage model +
   backend stage enum); do the structural board change first.
2. **Archive without typed confirmation** — small, self-contained frontend+backend.
3. **File download permission fix** — small backend access-control fix.
No hard dependencies between phases; ordered by size/risk (biggest first).

### Scope Coverage
**Covers:** the four changes above. **Excludes:** the carried follow-ups from the
prior milestone (schedule→board live-refresh on assignment create; SQLite
single-writer concurrency) — not requested in this batch. The empty-projectName
archive edge case is naturally resolved by Phase 2.

## Requirement Mapping

| Phase | Change(s) | Area |
|-------|-----------|------|
| 1 — Stopped Column & Drag Auto-Scroll | #2 Stopped column, #4 horizontal drag auto-scroll | Board stages, drag-and-drop UX |
| 2 — Archive Without Typed Confirmation | #1 archive without project name | Board archive UX, access control |
| 3 — File Download Permission Fix | #3 download any card file | Board files, access control |

## Key Decisions

- **Archive keeps a lightweight confirm.** Archive permanently deletes files, so
  Phase 2 drops only the typed-name gate, not the confirmation step itself
  (Archive/Cancel remains). To be confirmed in discussion.
- **"Stopped" is a manual stage.** Auto-move must not override a card the user
  manually placed in "Stopped". Exact column position in the stage order to be
  confirmed in discussion.
- **NON-NEGOTIABLE schedule isolation** continues for all board work: no writes
  to Assignment/TeamMember/Absence/Holiday (carried from the Project Board milestone).

## Deferred Ideas

- Schedule→board live-refresh when an assignment is created (carried follow-up).
- SQLite single-writer concurrency hardening at the product level (carried follow-up).


### Goal
Fix the bug where a user can only download files they personally uploaded. Any user with access to a board card should be able to download any file attached to that card.

### Success Criteria
Not available

### Requirements (Not available)
No matching requirements found

(34 other requirements exist for other phases -- not shown)

### Active Decisions
| Decision | Date | Rationale |
|----------|------|-----------|
| CLIProxyAPI as primary LLM provider (OpenAI SDK format) | | |
| Anthropic API as fallback (only if CLIProxy unavailable) | | |
| Per-feature model config: Sonnet 4.5 for templates, Opus 4.6 for reports | | |
| Manual retry only (no auto-retry to avoid burning credits) | | |
| Full sanitized prompts stored in audit log for GDPR compliance | | |
| python-docx in sanitization service for DOCX operations | | |
| Gotenberg Docker container for PDF generation (dev + prod) | | |
| Ghostwriter always reachable (no offline fallback) | | |
| react-pdf for PDF preview, strict upload validation | | |
| docxtpl for Jinja2 template rendering (native GW template syntax support) | | |

### Research Findings
---
phase: 3
title: "File Download Permission Fix"
type: research
confidence: high
date: 2026-06-03
---

## Findings

### Surface 1 — `requireCardAccess` in `backend/src/middleware/boardAuth.ts`

**Full signature (lines 31–100):**

```ts
export async function requireCardAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void>
```

**What it attaches:** Sets `req.boardCard: BoardCardContext` (lines 68–73):

```ts
export interface BoardCardContext {
  id: string;
  projectId: string;
  stage: string;
}
```

Declared as `boardCard?: BoardCardContext` on `Express.Request` via
`backend/src/types/express.d.ts` lines 27–29. All downstream handlers
consume only this three-field snapshot — no downstream code reads the
full card include that `requireCardAccess` fetches.

**Authorization logic (lines 75–95):**

1. Extracts `cardId` from `req.params.cardId ?? req.params.id` (line 36).
2. Checks `userId` (401 if missing), `cardId` (400 if missing).
3. `prisma.boardCard.findUnique` with a deep include (lines 51–61):
   - `project.primaryAssignments` → each `teamMember.userId`
   - `project.splitAssignments` → each `teamMember.userId`
   This reads the **Assignment** and **TeamMember** tables.
4. 404 if card not found (line 63–66).
5. Attaches `req.boardCard` (lines 68–73).
6. ADMIN / PM → `next()` immediately (lines 75–79).
7. NORMAL → builds `assignedUserIds` set from both Assignment join tables
   (lines 83–88); passes if `userId` is in set, else 403 (lines 90–95).

**`requireCardExists` design — drop-in compatible:**

The new sibling guard needs only to:
- Resolve `cardId` from `req.params.cardId ?? req.params.id`
- Check `userId` from session (401 if absent)
- `prisma.boardCard.findUnique({ where: { id: cardId } })` — no includes
- 404 if not found
- Attach identical `req.boardCard = { id, projectId, stage }` shape

No Assignment / TeamMember read. This is an isolation improvement: the
lighter guard reads only `BoardCard`. The exact `BoardCardContext` shape
is unchanged so the download/list handlers' reads of `req.params.cardId`
(which they re-read directly) are unaffected — neither handler uses
`req.boardCard` at all in its current implementation. Attaching it is
still correct so the express.d.ts contract remains consistent.

The new function should carry the same NON-NEGOTIABLE JSDoc note as
`requireCardAccess` about not writing to Assignment / TeamMember /
Absence / Holiday.

---

### Surface 2 — `backend/src/routes/boardFiles.ts` — route-by-route analysis

**File header (lines 36–40):** The file already carries the SCHEDULE-ISOLATION INVARIANT comment; that comment must remain intact after the edit.

**List route (line 159):**
```ts
router.get('/', requireAuth, requireCardAccess, readRateLimiter, async (req, res) => {
```
Middleware chain: `requireAuth` → `requireCardAccess` → `readRateLimiter` → handler.
Change: swap `requireCardAccess` → `requireCardExists`.

The handler reads `req.params.cardId ?? req.params.id` directly (line 161);
it does NOT use `req.boardCard`. The quarantined-file filter (line 165) stays:
```ts
const filtered = includeQuarantined ? all : all.filter((f) => !f.isQuarantined);
```
The `includeQuarantined` gate already checks `req.session.role === 'ADMIN'`
(line 163) independently of card access — no change needed there.

**Download route (lines 306–349):**
```ts
router.get('/:fileId/download', requireAuth, requireCardAccess, readRateLimiter, async (req, res) => {
```
Middleware chain: `requireAuth` → `requireCardAccess` → `readRateLimiter` → handler.
Change: swap `requireCardAccess` → `requireCardExists`.

Existing safeguards that MUST be preserved (verified all present):
- Cross-card 404: `if (!file || file.cardId !== cardId)` → 404 (lines 316–319)
- Quarantine 410: `if (file.isQuarantined)` → 410 (lines 320–322)
- Missing-on-disk 404: `if (!fs.existsSync(onDisk))` → 404 (lines 326–328)
- Audit event: `logAuditEvent(... action: 'board.file.download' ...)` records
  `userId` (lines 331–341). Audit traceability is preserved even under
  broadened access — the `userId` field records who downloaded.

**Upload route (lines 187–296):**
```ts
router.post('/', requireAuth, requireCardAccess, mutationRateLimiter, quotaGuard, ...)
```
Keeps `requireCardAccess`. No change.

**Delete route (lines 358–411):**
```ts
router.delete('/:fileId', requireAuth, requireCardAccess, mutationRateLimiter, ...)
```
Keeps `requireCardAccess`. The handler also has an explicit ADMIN/PM-only
check (line 365) as a second layer; no change.

**Import change needed:** `boardFiles.ts` currently imports only
`requireCardAccess` from `../middleware/boardAuth.js` (line 8). After
adding `requireCardExists` to that module, the import statement on
line 8 must be updated to named-import both:
```ts
import { requireCardAccess, requireCardExists } from '../middleware/boardAuth.js';
```

---

### Surface 3 — End-to-end reachability for non-assigned NORMAL users

**Finding: board/card listing is NOT assignment-gated — relaxing list+download alone IS sufficient for the API layer.**

`GET /cards` route (`board.ts` line 43):
```ts
router.get('/cards', requireAuth, readRateLimiter, async (req, res) => {
```
Only `requireAuth` + rate limiter. `boardService.listCards` (lines 91–131)
fetches all `BoardCard` rows with no per-user filter. Every authenticated
user already receives the complete board. No assignment check whatsoever.

`GET /cards/:id` route (`board.ts` line 76):
```ts
router.get('/cards/:id', requireAuth, readRateLimiter, async (req, res) => {
```
Same — only `requireAuth` + rate limiter. `boardService.getCard` fetches
the card unconditionally; 404 only if the id is not found.

`PATCH /cards/:id` (`board.ts` lines 98–169):
NORMAL user is checked: `ownerUserIds.has(req.session.userId)` (line 124)
→ 403 if not assigned. But that is a mutation — out of scope.

**Conclusion:** A non-assigned NORMAL user who is authenticated can already:
1. See all cards on `GET /cards` (board list view).
2. Open a specific card via `GET /cards/:id` (deep-link / board?card= modal).
3. Be blocked only when they hit `GET .../files` or `GET .../files/:fileId/download`
   because `requireCardAccess` 403s them.

Relaxing only the two file read routes is sufficient to resolve the
end-to-end symptom. No additional relaxation of board/card visibility is
needed — it is already open to all authenticated users.

**Frontend card-open path:** `CardDetailModal.tsx` calls `useBoardCard(cardId)` on mount
(line 395), which hits `GET /api/board/cards/:id`. That succeeds today for
any authenticated user. The `FilesPanel` is always rendered inside the modal
(line 629) — the only gate is whether the backend `GET .../files` returns 200
or 403. After swapping to `requireCardExists` it will return 200.

---

### Surface 4 — Tests

**Existing test files — none cover boardFiles or boardAuth directly.**

Current test inventory:
- `backend/src/routes/__tests__/boardAdminArchive.test.ts` — archive route,
  mounts `boardAdmin` router. Pattern reference: real-router, real-DB, vitest,
  `withDbRetry` for SQLite contention, session-injecting middleware.
- `backend/src/services/__tests__/scheduleIsolation.phase23.test.ts`
- `backend/src/services/__tests__/scheduleIsolation.phase24.test.ts`
  — service-level isolation proofs; use `withDbRetry` / `upsertAssignmentWithRetry`.
- `backend/src/routes/__tests__/templateAdapter*.test.ts` — unrelated.

**No existing test targets the 403 on file list/download, the cross-card
404, or `requireCardAccess` directly.** Dev starts from zero for this surface.

**Test harness conventions (from `boardAdminArchive.test.ts`):**

1. **Vitest** with `globals: true`, runs against `dev.db` (SQLite) per `vitest.config.ts`.
2. **Real router mounted in a minimal Express app** — no mocking of the router or
   Prisma; real DB reads/writes.
3. **Session-injecting middleware** replaces the session/CSRF stack:
   ```ts
   app.use((req, _res, next) => {
     (req as any).session = { userId, role: 'ADMIN', totpVerified: true };
     next();
   });
   ```
   For the new tests, three session shapes are needed:
   - `role: 'ADMIN'` (existing behavior baseline)
   - `role: 'NORMAL', userId: assignedUserId`
   - `role: 'NORMAL', userId: nonAssignedUserId`
4. **Rate limiter skipped under `NODE_ENV=test`** — already set in `vitest.config.ts`.
5. **`withDbRetry`** (5 attempts, jittered backoff) wraps all seed/teardown writes.
6. **Cleanup in `afterEach`** with `try/finally`-style catches, order:
   `BoardFile` → `BoardComment` → `BoardCard` → `Project` → `User`,
   plus `fs.rmSync` of the per-card upload dir.

**New test file location:** `backend/src/routes/__tests__/boardFiles.test.ts`

**Mount point:** The new test should mount `filesRouter` at
`/cards/:cardId/files` (with `mergeParams: true`), exactly as `board.ts` does.
To test `requireCardExists` on the read routes, the router from `boardFiles.ts`
is imported directly. No need to mount the full `board.ts` router.

For the download route test, the test must write a real file to disk under
`uploads/board/<cardId>/<storedName>` (same pattern as `boardAdminArchive.test.ts`
lines 143–145), because the handler calls `fs.existsSync` and `res.download`.

**Assertions the new tests must cover:**

**(a) Non-assigned NORMAL user CAN list files — 200:**
- Seed: User A (NORMAL, assigned), User B (NORMAL, NOT assigned), Project,
  BoardCard (linked to Project), Assignment (linking User A's TeamMember to Project),
  BoardFile.
- Mount router with User B's session.
- `GET /cards/<cardId>/files` → expect 200, `body.files` is an array.

**(b) Non-assigned NORMAL user CAN download a file — 200:**
- Same seed; write file to disk.
- `GET /cards/<cardId>/files/<fileId>/download` → expect 200 (binary response).

**(c) Upload still 403 for non-assigned NORMAL user:**
- `POST /cards/<cardId>/files` with User B's session → expect 403.

**(d) Delete still 403 for non-assigned NORMAL user:**
- `DELETE /cards/<cardId>/files/<fileId>` with User B's session → expect 403
  (first from `requireCardAccess` before the explicit role check).

**(e) Cross-card fileId still 404 on download:**
- Seed a second card + file; request download of second card's fileId on first
  card's URL → expect 404.

**(f) Quarantined file returns 410 on download:**
- Seed a `BoardFile` with `isQuarantined: true`; download → expect 410.

**(g) Assigned NORMAL user still passes (regression guard):**
- `GET .../files` and `GET .../files/:fileId/download` with User A's session
  → expect 200 (ensures `requireCardExists` didn't break the happy path).

**(h) Schedule-isolation invariant:**
- After the above test suite runs, confirm Assignment / TeamMember rows seeded
  are exactly the rows created during seed — no unexpected mutations. This
  mirrors `scheduleIsolation.phase24.test.ts`'s snapshot approach but is
  scoped to the new test's own seeded rows.

---

### Surface 5 — Frontend (`FilesPanel.tsx`)

**No frontend change is needed for the core fix.**

`FilesPanel.tsx` (line 172–179) renders the Download button for every file with
no ownership/uploader gate. It is disabled only when:
- `download.isPending` (in-flight request), or
- `f.isQuarantined` (backend-set flag).

The `canDelete` prop passed by `CardDetailModal.tsx` (line 629):
```ts
const canDelete = role === 'ADMIN' || role === 'PM'   // CardDetailModal.tsx line 470
```
This gates the Trash icon only — Download is always rendered.

The upload zone is rendered unconditionally (lines 122–149); there is no
frontend gate preventing a non-assigned user from attempting an upload.
Upload will still 403 at the backend after the phase change (the
`POST .../files` route retains `requireCardAccess`), and the
`uploadErrorToast` handler (line 35–55) catches 403 via `handleMutationError`
in the underlying hook (hooks.ts line 9). The user will see a
"Permission denied" toast, which is acceptable given the intended policy.

No frontend upload-zone hiding is in scope for this phase (the discussion
context confirms the blast radius is list+download only). This could be a
follow-up UX polish, but is not required for correctness.

**Card open path (confirming non-assigned user can reach the modal):**
`CardDetailModal` is opened from `KanbanCard.tsx` via an `onCardClick` callback.
The board list (`GET /cards`) has no assignment gate, so the card appears in
the UI and is clickable for all authenticated users. `useBoardCard(cardId)` in
`CardDetailModal` calls `GET /api/board/cards/:id`, which is also ungated.
Once the file routes are relaxed, the FilesPanel will successfully render and
allow downloads.

---

### Surface 6 — Schedule Isolation

**The lighter guard is an isolation improvement, not a regression.**

Current state: `requireCardAccess` reads `Assignment` and `TeamMember` via the
deep `project.primaryAssignments / splitAssignments` include (boardAuth.ts lines
54–59). This is a read, not a write, so it has not violated the invariant — but
it is schedule-table-adjacent.

Proposed `requireCardExists`: does only `prisma.boardCard.findUnique` with no
includes. Zero reads of Assignment / TeamMember / Absence / Holiday.

**SCHEDULE-ISOLATION INVARIANT JSDoc location:** `boardFiles.ts` lines 36–40
(the router-level comment). It must stay intact. The new middleware function
in `boardAuth.ts` should carry the same NON-NEGOTIABLE annotation.

The `boardAuth.ts` file already has the invariant on `requireCardAccess`
(lines 27–30). The new `requireCardExists` function must carry a matching
annotation.

Neither the list handler nor the download handler in `boardFiles.ts` touches
Assignment / TeamMember / Absence / Holiday — confirmed by reading the full
file. The audit log (`logAuditEvent`) only writes to the `AuditLog` table.
`boardService.listFiles` and `boardService.getFile` query only `BoardFile`.

---

## Relevant Patterns

1. **`withDbRetry` (5 attempts, jittered 50ms backoff)** is the established
   pattern for SQLite single-writer contention in test setup/teardown. It must
   be copied (not imported) into the new test file to keep suites independent —
   the same reasoning as in `scheduleIsolation.phase24.test.ts` (lines 56–74
   of that file).

2. **Real-router test pattern** (from `boardAdminArchive.test.ts`): build a
   minimal Express app, inject session via middleware, start on port 0, use
   `fetch()` against `http://127.0.0.1:<port>`. This is the established
   approach and should be followed for `boardFiles.test.ts`.

3. **`mergeParams: true`** is required when mounting `filesRouter` in the test
   app — `boardFiles.ts` line 41 declares `Router({ mergeParams: true })` and
   relies on `:cardId` being visible from the parent. The test app must mount
   it at `'/cards/:cardId/files'` with the same merge setup.

4. **Seed order for the new test:** User → Project → TeamMember → Assignment
   (for the "assigned" user path) → BoardCard → BoardFile. Teardown in reverse
   order, each wrapped in `.catch(() => undefined)`.

5. **`storedName` uniqueness:** `boardAdminArchive.test.ts` uses
   `uniqueSuffix()` for stored names; the new test must do the same to avoid
   file-path collisions across concurrent workers.

---

## Risks

**R1 — `req.boardCard` is not used by the handlers but must still be attached.**
Both the list and download handlers read `req.params.cardId` directly (not
`req.boardCard`), so the shape attached by `requireCardExists` is not
functionally load-bearing for those routes. However, `req.boardCard` is
declared as `optional` on `Express.Request`, and the type augmentation is
module-wide. Failing to attach it in `requireCardExists` is not a runtime
error but is an inconsistency — downstream code or future handlers that depend
on `req.boardCard` being populated after any `boardAuth` guard would break.
The new guard must attach it.

**R2 — Upload zone UX gap.**
After the fix, a non-assigned NORMAL user will see the upload drop zone in
the FilesPanel but receive a 403 toast when they try to use it. The discussion
context explicitly deems this acceptable (blast radius is list+download only),
but it is a rough UX edge. Flag for potential follow-up.

**R3 — SQLite concurrent test contention.**
The new `boardFiles.test.ts` will run in a parallel vitest worker alongside
`boardAdminArchive.test.ts` and the scheduleIsolation suites. Both `beforeEach`
seed and `afterEach` teardown must use `withDbRetry`. Without it, flaky
"database is locked" failures are likely in CI.

**R4 — Disk cleanup in test teardown.**
The download test writes a real file to `uploads/board/<cardId>/`. Teardown
must include `fs.rmSync(cardDir, { recursive: true, force: true })` —
identical to `boardAdminArchive.test.ts` lines 189–195. Missing cleanup
leaves orphaned bytes.

**R5 — `requireCardExists` naming collision risk.**
No existing exported symbol named `requireCardExists` in `boardAuth.ts`;
confirmed by reading the full file (101 lines). Safe to introduce.

**R6 — Rate limiter skipped in test only via `NODE_ENV=test`.**
`vitest.config.ts` sets `NODE_ENV: 'test'`. The `readRateLimiter` used on
both read routes is skipped under test. This is the established behavior and
poses no test-validity concern.

---

## Recommendations

1. **Add `requireCardExists` to `backend/src/middleware/boardAuth.ts`** immediately
   after `requireCardAccess` (after line 100). Shape:
   - Same auth checks (401/400) and cardId resolution logic.
   - `prisma.boardCard.findUnique({ where: { id: cardId } })` — NO includes.
   - 404 if not found.
   - Attach `req.boardCard = { id: card.id, projectId: card.projectId, stage: card.stage }`.
   - ADMIN/PM/NORMAL all pass (no role check — any authenticated user).
   - Carry the NON-NEGOTIABLE schedule-isolation annotation.

2. **Update `boardFiles.ts` line 8 import** to include `requireCardExists`.

3. **Swap middleware on line 159** (list route): `requireCardAccess` → `requireCardExists`.

4. **Swap middleware on line 308** (download route): `requireCardAccess` → `requireCardExists`.

5. **Leave lines 189, 360 unchanged** (upload/delete keep `requireCardAccess`).

6. **Keep all download safeguards intact** (lines 316–342): cross-card 404,
   quarantine 410, missing-on-disk 404, audit event with `userId`.

7. **Write `backend/src/routes/__tests__/boardFiles.test.ts`** using the
   `boardAdminArchive.test.ts` pattern: real router, real DB, `withDbRetry`,
   session injection, cleanup in `afterEach`. Cover assertions (a)–(h) above.
   The test file is the only new file; no existing test file requires modification
   (there are none covering these routes).

8. **No frontend change required** for the core fix. Optionally, a follow-up
   could hide the upload zone for non-PM/ADMIN users to avoid the 403 toast UX
   gap, but this is out of scope for Phase 3.

9. **Total changed files:** `backend/src/middleware/boardAuth.ts` (+1 function),
   `backend/src/routes/boardFiles.ts` (2 line changes + 1 import change),
   `backend/src/routes/__tests__/boardFiles.test.ts` (new file). Frontend: zero.

---

## Live Validation Evidence

No live-validation commands were run. All findings are derived from static
code reads of the following files:

- `backend/src/middleware/boardAuth.ts` (101 lines, read in full)
- `backend/src/routes/boardFiles.ts` (413 lines, read in full)
- `backend/src/routes/board.ts` (207 lines, read in full)
- `backend/src/services/boardService.ts` (lines 91–170, listCards + getCard)
- `backend/src/types/express.d.ts` (31 lines, read in full)
- `backend/src/routes/__tests__/boardAdminArchive.test.ts` (255 lines, read in full)
- `backend/src/services/__tests__/scheduleIsolation.phase24.test.ts` (lines 1–74)
- `backend/vitest.config.ts` (36 lines, read in full)
- `frontend/src/features/board/components/FilesPanel.tsx` (200 lines, read in full)
- `frontend/src/features/board/components/CardDetailModal.tsx` (675 lines, read in full)
- `frontend/src/features/board/hooks.ts` (397 lines, read in full)

| field | value |
|---|---|
| command_shape | static read only |
| exit_status | n/a |
| redacted_evidence | n/a |
| expected_shape | n/a |
| confidence | high — all relevant code paths read; no ambiguity in route middleware chains or DB query structure |
| limitations_or_deferred_reason | No authenticated HTTP check performed; `requireCardAccess` 403 behavior was confirmed by reading the middleware code, not by running a request |
