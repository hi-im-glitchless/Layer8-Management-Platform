## Phase 2 Context (Compiled)

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
Remove the type-the-exact-project-name requirement from the admin archive flow. Keep a lightweight confirm (archive is destructive — deletes files), but drop the typed-name gate end to end (UI dialog + backend confirmProjectName requirement).

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
phase: 2
title: "Archive Without Typed Project-Name Confirmation"
type: research
confidence: high
date: 2026-06-03
---

## Findings

### Surface 1 — Frontend Dialog: `frontend/src/features/board/components/ArchiveCardDialog.tsx`

Full file read. 127 lines.

**What to remove:**

| Line(s) | Current code | Action |
|---------|-------------|--------|
| 2–3 | `import { Input } from '@/components/ui/input'` | Remove — `Input` unused after change |
| 2–3 | `import { Label } from '@/components/ui/label'` | Remove — `Label` unused after change |
| 42 | `const [typed, setTyped] = useState('')` | Remove |
| 43 | `const [error, setError] = useState<string \| null>(null)` | Remove the `error` state (only set in `onError` for `PROJECT_NAME_MISMATCH`). The generic `err.message` fallback branch shows non-mismatch errors; with no mismatch possible, the entire state can go. |
| 45 | `const helpId = useId()` | Remove — only used by the `<Label>`/`<Input>` block |
| 48–53 | The `useEffect` that resets `typed` and `error` on `open` | Remove entirely |
| 55 | `const matches = typed === projectName` | Remove |
| 62–63 | `if (!matches \|\| archive.isPending) return` in `handleConfirm` | Replace with `if (archive.isPending) return` |
| 66 | `{ cardId, confirmProjectName: typed }` passed to `archive.mutate(...)` | Change to `{ cardId }` |
| 73–76 | `onError` block: the `PROJECT_NAME_MISMATCH` branch that calls `setError(...)` | Remove the `if` branch entirely. Keep or remove the generic `setError(err.message \|\| 'Failed to archive card.')` branch — since `error` state is being removed, the whole `onError` callback can be dropped (hook-level `onError` in `useArchiveCard` already calls `toast.error`) |
| 95–112 | The `<form onSubmit={handleConfirm}>` block containing `<Label>`, `<Input>`, help text `<p>`, and `{error && ...}` | Remove the entire `<form>` block |
| 118 | `disabled={!matches \|\| archive.isPending}` on `<AlertDialogAction>` | Change to `disabled={archive.isPending}` |

**What to keep:**

- The `AlertDialog` shell (lines 85–126): `<AlertDialogContent>`, `<AlertDialogHeader>`, `<AlertDialogTitle>`, `<AlertDialogDescription>`, `<AlertDialogFooter>`, `<AlertDialogCancel>`, `<AlertDialogAction>` — unchanged.
- The `fileSummary` const (lines 56–59) — still displayed in `<AlertDialogDescription>`.
- The `formatBytes` utility (lines 26–31) — still needed for `fileSummary`.
- The `handleConfirm` function itself — stays but simplified (no `matches` guard, no `confirmProjectName` arg).
- `archive.isPending` disable on `<AlertDialogCancel>` (line 115) — keep.
- The `{archive.isPending ? 'Archiving…' : 'Archive card'}` label (line 121) — keep.

**`ArchiveCardDialogProps` interface (lines 16–24):**
`projectName: string` is currently used both for the typed-confirmation placeholder (`placeholder={projectName}`) and the `matches = typed === projectName` check. After the change, `projectName` will no longer be used inside the dialog component at all. The prop should be removed from the interface — and from the call site in `CardDetailModal.tsx` (see Surface 5 below). The `fileCount` and `totalBytes` props remain (used for `fileSummary`). `cardId`, `open`, `onOpenChange`, `onArchived` remain unchanged.

**`useId` import:**
`useId` is only used for `helpId` (the `<Label>`/`<Input>` aria linkage). After removing those elements, the `useId` import and the `helpId` const can both be removed. `useEffect` is only used for the reset effect, so its import can also be removed. Only `useState` remains from the React imports (for a brief window, then also removed when the last `useState` call goes).

After all removals, the only React import remaining is none from `'react'` — the component uses no hooks at all. The `import { ... } from 'react'` line can be dropped entirely.

---

### Surface 2 — Frontend API: `frontend/src/features/board/api.ts` (lines 125–136)

```ts
// CURRENT (line 125–136)
async archiveCard(cardId: string, confirmProjectName: string) {
  return apiClient<{
    success: boolean
    cardId: string
    projectName: string
    fileCount: number
    totalBytes: number
  }>(`/api/board/cards/${cardId}/admin/archive`, {
    method: 'POST',
    body: JSON.stringify({ confirmProjectName }),
  })
},
```

**Changes:**
- Drop `confirmProjectName: string` parameter from the function signature.
- Change `body: JSON.stringify({ confirmProjectName })` to `body: JSON.stringify({})`. Alternatively, the `body` field can be omitted entirely (the backend will accept an empty body since the Zod schema becomes `z.object({})` or is removed). Recommend keeping `body: JSON.stringify({})` to be explicit that this is a POST with a JSON-structured body (Content-Type header is likely set by `apiClient`), or dropping `body` entirely if `apiClient` handles no-body POSTs cleanly. Either is safe.
- The return type `{ success, cardId, projectName, fileCount, totalBytes }` is unchanged — backend still returns this.

---

### Surface 3 — Frontend Hook: `frontend/src/features/board/hooks.ts` (lines 361–387)

```ts
// CURRENT (lines 361–387)
export function useArchiveCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cardId,
      confirmProjectName,
    }: {
      cardId: string
      confirmProjectName: string
    }) => boardApi.archiveCard(cardId, confirmProjectName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
      toast.success('Card archived')
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 400) {
        const code = (error.message ?? '').toUpperCase()
        if (code.includes('PROJECT_NAME_MISMATCH')) {
          toast.error('Project name does not match')
          return
        }
      }
      handleMutationError(error, 'Failed to archive card')
    },
  })
}
```

**Changes:**
- Drop `confirmProjectName` from the `mutationFn` destructured parameter and its type annotation. New shape: `mutationFn: ({ cardId }: { cardId: string }) => boardApi.archiveCard(cardId)`.
- Remove the `PROJECT_NAME_MISMATCH` branch from `onError`. After removal the `onError` block simplifies to just `handleMutationError(error, 'Failed to archive card')`. The `ApiError` 400-status check can be removed since the only 400 the archive route could previously return was `PROJECT_NAME_MISMATCH` (a `ZodError` body-parse failure also returns 400, but that surfaces as an opaque message not a `PROJECT_NAME_MISMATCH` code — the generic `handleMutationError` handles it fine).
- The `toast.success('Card archived')` and `queryClient.invalidateQueries` in `onSuccess` remain unchanged.

---

### Surface 4 — Backend Route: `backend/src/routes/boardAdmin.ts`

**Line 57–58 — Zod body parse:**
```ts
// CURRENT
const { confirmProjectName } = z
  .object({ confirmProjectName: z.string().min(1) })
  .parse(req.body);
```
Remove this destructure entirely. The body schema becomes empty: `z.object({}).parse(req.body)` or just no body parse at all (the route currently has no other body fields). Recommend removing the Zod parse block entirely since it serves no purpose with an empty schema. If the parse block is kept for belt-and-suspenders validation hygiene, simplify to `z.object({}).strict().parse(req.body)` — but given the route is already behind `requireRole('ADMIN')` and `mutationRateLimiter`, removing the parse entirely is cleaner.

**Line 62 — `archiveCard()` call:**
```ts
// CURRENT
const details = await archiveCard(cardId, confirmProjectName, adminUserId);
```
Change to:
```ts
const details = await archiveCard(cardId, adminUserId);
```

**Line 75–76 — ZodError catch:**
```ts
if (error instanceof z.ZodError) {
  return res.status(400).json({ error: error.issues[0].message });
}
```
If the Zod body parse block is removed, this ZodError catch branch becomes dead code. Remove it. If the body parse is retained with `z.object({}).strict()`, keep the branch — but recommend removing both together.

**Line 78–81 — `PROJECT_NAME_MISMATCH` status mapping:**
```ts
// CURRENT
const status = error.code === 'NOT_FOUND' ? 404 : 400;
```
After removing `PROJECT_NAME_MISMATCH` from `ArchiveErrorCode`, the only remaining code is `NOT_FOUND`. The ternary simplifies to just `404`. Change to `res.status(404).json({ error: error.code })` directly, or keep the ternary as-is (it evaluates to 400 for any non-`NOT_FOUND` code, which is harmless since no other codes exist). Recommend simplifying for clarity.

**JSDoc on the `POST /archive` handler (lines 40–48):** The existing JSDoc says "Body: `{confirmProjectName: string}`". Update to say the body is empty: "Body: `{}` (no confirmation required)". Also update the sub-router JSDoc on line 18 which says "wires the typed-confirmation archive endpoint" — update to reflect the confirmation-free flow.

**Imports:** The `z` import from `'zod'` is used only for the body parse. If the parse block is removed entirely, the `z` import becomes unused. However, `z` is imported on line 2 alongside `Router` and `Request` from `'express'`. Check if `z` is used elsewhere in the file — based on the full file read, `z.ZodError` and `z.object` are only in the archive handler block. Removing the parse and catch branch means `z` can be removed from the import on line 2.

---

### Surface 5 — Backend Service: `backend/src/services/boardArchiveService.ts`

**Line 20 — `ArchiveErrorCode` union:**
```ts
// CURRENT
export type ArchiveErrorCode = 'NOT_FOUND' | 'PROJECT_NAME_MISMATCH';
```
Change to:
```ts
export type ArchiveErrorCode = 'NOT_FOUND';
```
`'PROJECT_NAME_MISMATCH'` has no other callers outside this file and the route handler. Confirmed by reading all files that import from `boardArchiveService.ts`: only `boardAdmin.ts` and the schedule-isolation test file (`scheduleIsolation.phase23.test.ts`) import from it — neither references `PROJECT_NAME_MISMATCH` other than in the test call to `archiveCard()`.

**Lines 52–56 — `archiveCard()` signature:**
```ts
// CURRENT
export async function archiveCard(
  cardId: string,
  confirmProjectName: string,
  adminUserId: string,
): Promise<ArchiveAuditDetails> {
```
Change to:
```ts
export async function archiveCard(
  cardId: string,
  adminUserId: string,
): Promise<ArchiveAuditDetails> {
```

**Lines 65–67 — mismatch check:**
```ts
// CURRENT
if (card.project.name !== confirmProjectName) {
  throw new ArchiveError('PROJECT_NAME_MISMATCH');
}
```
Remove entirely. The `NOT_FOUND` check on line 64 (`if (!card) throw new ArchiveError('NOT_FOUND')`) stays unchanged.

**Lines 57–63 — Prisma query:**
```ts
const card = await prisma.boardCard.findUnique({
  where: { id: cardId },
  include: {
    project: { select: { name: true } },
    files: { select: { id: true, storedName: true, sizeBytes: true } },
  },
});
```
The `project: { select: { name: true } }` join stays — `card.project.name` is still used on line 97 for the `projectName` field in `ArchiveAuditDetails`. The SCHEDULE-ISOLATION INVARIANT is preserved: only a `select: { name: true }` read-only join, no write to any schedule table.

**Lines 95–101 — Return value:**
```ts
return {
  cardId,
  projectName: card.project.name,  // <-- still server-read, unchanged
  fileCount,
  totalBytes,
  adminId: adminUserId,
};
```
Unchanged. The audit `projectName` continues to derive from `card.project.name`.

**JSDoc block (lines 1–15 and lines 37–51):**
- Module-level JSDoc (lines 1–15): update the phrase "which fetches only the linked Project's `name` for typed-confirmation" → "which fetches only the linked Project's `name` for the audit log". The SCHEDULE-ISOLATION INVARIANT comment stays verbatim otherwise.
- Function-level JSDoc (lines 37–51): remove the "Validates the typed-confirmation project name" sentence and the `PROJECT_NAME_MISMATCH` bullet from the throws table. Keep the `NOT_FOUND` bullet and all other prose.

**SCHEDULE-ISOLATION INVARIANT:** Fully preserved. The `project: { select: { name: true } }` read-only join is the only project-relation read. No writes to Assignment / TeamMember / Absence / Holiday at any point. The invariant JSDoc must remain accurate and present.

---

### Surface 6 — Caller: `frontend/src/features/board/components/CardDetailModal.tsx`

This is the sole caller of `ArchiveCardDialog` in the codebase (confirmed by listing all files under `frontend/src/features/board/components/`).

**Lines 664–673:**
```tsx
// CURRENT
<ArchiveCardDialog
  cardId={card.id}
  projectName={project.name}   // <-- will become unused prop
  fileCount={(card.files ?? []).length}
  totalBytes={filesTotalBytes}
  open={archiveOpen}
  onOpenChange={setArchiveOpen}
  onArchived={() => onOpenChange(false)}
/>
```

If `projectName` is removed from `ArchiveCardDialogProps`, this call site must drop the `projectName={project.name}` prop. All other props remain.

`project.name` itself is still used elsewhere in `CardDetailModal` (e.g., line 489 `{project.name || '(No project)'}`) so the `project` object itself does not become unused — only the specific `projectName` prop on `ArchiveCardDialog` is removed.

---

### Surface 7 — Tests

#### Backend unit/integration tests

**`backend/src/services/__tests__/scheduleIsolation.phase23.test.ts`**

This file imports and calls `archiveCard()` directly (not through the route). It is the only test that exercises the archive service.

**Line 245:**
```ts
// CURRENT
await archiveCard(ids!.cardId, beforeAssignment!.projectName, ids!.userId);
```
After removing `confirmProjectName` from the signature, change to:
```ts
await archiveCard(ids!.cardId, ids!.userId);
```

**Lines 243–244:** The `beforeAssignment` variable is fetched only to supply `projectName` as the confirmation arg:
```ts
const beforeAssignment = await prisma.assignment.findUnique({
  where: { id: ids!.assignmentId },
});
await archiveCard(ids!.cardId, beforeAssignment!.projectName, ids!.userId);
```
After removing the `confirmProjectName` arg, `beforeAssignment` is still used on lines 254–256 for the "defence in depth" assertion that the linked Assignment row is byte-identical after archive:
```ts
const afterAssignment = await prisma.assignment.findUnique({
  where: { id: ids!.assignmentId },
});
expect(JSON.stringify(afterAssignment)).toEqual(JSON.stringify(beforeAssignment));
```
So `beforeAssignment` must be kept — only the `beforeAssignment!.projectName` arg to `archiveCard()` is removed.

**Line 271 (in the matrix test):**
```ts
// CURRENT
const assignment = await prisma.assignment.findUnique({ where: { id: ids!.assignmentId } });
await archiveCard(ids!.cardId, assignment!.projectName, ids!.userId);
```
Change to:
```ts
await archiveCard(ids!.cardId, ids!.userId);
```
The `assignment` variable fetch before `archiveCard` (line 268–270 in the matrix test) serves no purpose other than supplying the project name arg. It can be removed from the matrix test since the matrix test does NOT have the `afterAssignment` defence-in-depth check (that check is only in the dedicated `archiveCard` isolation test). Remove the `prisma.assignment.findUnique` call + `assignment` variable from the matrix test.

**No other test files** reference `confirmProjectName`, `PROJECT_NAME_MISMATCH`, `archiveCard`, or `ArchiveCard` — confirmed by reviewing all tracked test files.

#### E2E tests

**`e2e/tests/deferred.spec.ts` line 51:**
```ts
test.fixme('archive card via dialog removes it from default view', async () => {});
```
This is a `test.fixme` stub. No changes required to the stub text itself, but the implementation when it is eventually written should NOT attempt to fill in a project name input (it no longer exists). Add a comment in the stub noting this when implementing it. No immediate change needed.

**`e2e/tests/board.spec.ts`:** No archive-related tests. No changes needed.

#### Regression test recommendation

A new backend integration test should assert:
1. `POST /cards/:cardId/admin/archive` with an empty body and a valid admin session returns 200 and archives the card (files deleted, stage = 'archived').
2. `POST /cards/:cardId/admin/archive` for a non-existent card returns 404 with `{ error: 'NOT_FOUND' }`.
3. The schedule-isolation invariant test in `scheduleIsolation.phase23.test.ts` already covers the no-write boundary; its updated call is sufficient regression coverage for that concern.

---

## Relevant Patterns

- **Convention match:** The route follows the established pattern of delegating to a service layer with no business logic in the handler (`boardAdmin.ts` → `archiveCard()`). Removing the Zod parse block does not break this pattern since the body was the only non-param input.
- **TanStack Query mutation shape:** The `useArchiveCard` hook follows the `{ cardId, ... }` object-arg mutationFn pattern used throughout `hooks.ts`. Dropping `confirmProjectName` from the object arg is a minimal, consistent change.
- **`apiClient` POST body:** Other fire-and-forget POSTs with no meaningful body (e.g., `auto-move`) send `{ method: 'POST' }` with no `body`. The archive call could match that pattern after removing the body. However, since `apiClient` sets Content-Type for JSON bodies, either approach (empty `{}` body or no body) should work — verify against `apiClient` implementation if there is any concern.
- **Zod import cleanup:** `boardAdmin.ts` currently imports `z` from `'zod'` solely for the body parse. Removing the parse removes the only `z` usage, so the import goes too. The TS compiler / linter will catch this if missed.

---

## Risks

1. **`scheduleIsolation.phase23.test.ts` test breakage if not updated:** The test calls `archiveCard()` with three args. Removing the second param from the service signature makes the existing test call a TypeScript compile error. This is a hard blocker — the test file must be updated in the same commit as the service change.

2. **`boardAdmin.ts` `z` import leftover:** If the Zod parse block is removed but the `z` import is not cleaned up, TypeScript will warn on unused import (depending on `tsconfig.json` `noUnusedLocals` setting). Confirm the project's TS strict settings; the `z` import should be removed along with the parse block.

3. **Empty POST body handling in `apiClient`:** If `boardApi.archiveCard` sends `body: JSON.stringify({})`, the browser sends `Content-Type: application/json` with `{}`. Express's `json()` middleware parses this fine. If the `body` is omitted entirely, `Content-Type` may not be set, which could cause Express to not populate `req.body`. This is safe as long as no Zod body parse remains; but if the parse block is kept as `z.object({})`, an absent `Content-Type` could cause `req.body` to be `undefined`, and `z.object({}).parse(undefined)` throws a ZodError. Safest approach: keep `body: JSON.stringify({})` in the frontend, and remove the Zod parse entirely on the backend.

4. **`ArchiveCardDialogProps.projectName` removal:** `CardDetailModal` currently passes `project.name` as the `projectName` prop. After removing the prop from the interface, TypeScript will error at the call site if `projectName={project.name}` is not also removed. This is caught at compile time — no silent runtime risk.

5. **No new auth or file-deletion risk:** The archive endpoint remains behind `requireAuth` + `requireRole('ADMIN')` + `mutationRateLimiter`. Removing the typed-name gate does not broaden who can call it, only simplifies what they must send.

---

## Recommendations

1. **Make all changes in a single atomic commit.** The five files touched are: `ArchiveCardDialog.tsx`, `api.ts`, `hooks.ts`, `boardAdmin.ts`, `boardArchiveService.ts`, plus `scheduleIsolation.phase23.test.ts`. All must land together — a partial commit (e.g., service updated but test not) will fail TypeScript compilation.

2. **Remove the Zod parse block entirely** from `boardAdmin.ts` rather than replacing it with `z.object({})`. This also removes the `z` import, the ZodError catch branch, and the dead 400-status path in `ArchiveError` handling. Simpler and cleaner.

3. **Update service JSDoc accurately.** The SCHEDULE-ISOLATION INVARIANT comment says "for typed-confirmation" — update to "for the audit log". This keeps the comment truthful and avoids confusion in future code review.

4. **Remove `projectName` prop from `ArchiveCardDialogProps` and its call site.** Even though `project.name` is still readily available in `CardDetailModal`, passing it into `ArchiveCardDialog` when the dialog does nothing with it is dead prop surface.

5. **New regression test (route-level):** The existing schedule-isolation test covers the service but not the HTTP contract. A new vitest test (or a supertest-based route test) asserting the endpoint accepts an empty body and archives successfully would provide belt-and-suspenders coverage. Not blocking for the phase, but recommended as part of the same PR.

## Live Validation Evidence

No Bash commands were run for live validation. All findings are based on direct file reads of the exact source files. No mutations, no external HTTP calls.

- `command_shape`: N/A
- `exit_status`: N/A
- `redacted_evidence`: N/A
- `expected_shape`: N/A
- `confidence`: high — all five core files read in full; sole call site (`CardDetailModal.tsx`) read in full; both schedule-isolation test files read in full; e2e test files read in full. No indirect imports or hidden callers found.
- `limitations_or_deferred_reason`: Could not run `grep -r confirmProjectName` across the entire repo due to Scout Bash read-only restriction on piped commands. Mitigated by reading all tracked files under `frontend/src/features/board/` and `backend/src/` that plausibly reference archive functionality, and by checking the full git-tracked file list for test files. The only tracked files that call `archiveCard()` by name are `boardAdmin.ts` and `scheduleIsolation.phase23.test.ts` — both covered above.
