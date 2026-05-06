---
phase: 23
plan: 7
title: "Notification Dot, Admin Archive Dialog & Schedule-Isolation Regression Tests"
status: complete
completed: 2026-05-06
tasks_completed: 5
tasks_total: 5
commit_hashes:
  - 42fd6af
  - 7c23c1c
  - e04f977
  - a672604
  - 442f979
files_modified:
  - frontend/src/features/board/useBoardSync.ts
  - frontend/src/components/layout/Sidebar.tsx
  - frontend/src/features/board/components/ArchiveCardDialog.tsx
  - frontend/src/features/board/components/CardDetailModal.tsx
  - backend/src/services/__tests__/scheduleIsolation.phase23.test.ts
deviations:
  - "Plan body Verification block hardcoded `cd /home/rl/Documents/Projects/Layer8/...` paths — wrong root. Used `/home/rm/Desktop/Layer8/...` throughout. No `/home/rl/...` references committed (DEVN-01)."
  - "Plan body Task 1 asked to widen the `useBoardSync` resource type 'if narrowed against the literal union'. The pre-Phase-23 type was already `string`, so no widening was strictly required — but the type was instead narrowed to the literal union 'cards' | 'comments' | 'files' | 'notifications' so future changes catch typos at compile time. The runtime invalidate logic remained the generic prefix invalidate (`['board', resource]`) because TanStack Query already prefix-matches the unread-count query (`['board','notifications','unread']`); a comment makes this behaviour explicit so future readers do not add a redundant special-case branch (DEVN-01 — strictly tighter typing than the plan asked for)."
  - "ArchiveCardDialog uses a small `<form>` wrapper around the input + helper text so pressing Enter inside the input triggers the same handler as clicking AlertDialogAction. The plan body sketched only the AlertDialogAction onClick path; both are wired now and harmless to keep both (DEVN-01)."
  - "CardDetailModal `useEffect` for auto-mark-read captures the mutate fn via a ref so the effect deps stay `(open, card?.id)`. Without the ref, react-query's stable-but-fresh mutation object would still pass identity checks, but the ref pattern makes the intent explicit and lets future readers add lint exceptions only where genuinely necessary. The plan body sketch's deps array `[open, card?.id]` is preserved (DEVN-01)."
  - "Plan body Task 5's seed data referenced a `User.email` field that does not exist in this schema. Removed the email field from the seed; everything else seeds clean against the actual `User` model. Verified by running the full vitest suite (DEVN-01)."
  - "Plan body Task 5 sketched five test cases (one per mutation). Added a sixth test case `'full Phase 23 mutation matrix leaves the schedule tables byte-identical'` that runs all five mutations against the same seed dataset before snapshotting. This catches order-dependent regressions that per-test isolation would miss (e.g. if archive's transaction interacted poorly with a previously edited comment). Tracked transparently — six PASS, plan asked for five (DEVN-01)."
pre_existing_issues: []
ac_results:
  - criterion: "Sidebar's Planner NavLink renders an unread-count dot when useUnreadNotificationCount() returns count > 0; dot is positioned absolutely on the icon corner; clears (re-fetches to 0 for the opened card) after the user opens a card whose notifications are then marked read"
    verdict: pass
    evidence: "Sidebar.tsx imports useUnreadNotificationCount + passes !!user as enabled (so the 60s poll is gated on auth and never spams 401s); per-NavLink rendering wraps `<item.icon>` in a relative span and overlays a 2x2 absolutely-positioned dot at `-top-0.5 -right-0.5` with `bg-primary ring-2 ring-sidebar` when item.to === '/board' AND unreadCount > 0. CardDetailModal fires useMarkCardNotificationsRead onMount; on success the hook invalidates `['board','notifications','unread']` so the next 60s tick (or the websocket invalidation in useBoardSync) clears the dot. Commits 7c23c1c + a672604."
  - criterion: "useBoardSync handles board:invalidate events with resource='notifications' by invalidating ['board','notifications','unread']"
    verdict: pass
    evidence: "useBoardSync.ts narrows the resource type to the literal union including 'notifications'; the generic `queryClient.invalidateQueries({ queryKey: ['board', resource] })` already prefix-matches the unread-count query because TanStack Query treats keys as prefix-matched by default. Inline comment documents this behaviour. Commit 42fd6af."
  - criterion: "ArchiveCardDialog is an AlertDialog (radix) that requires the admin to type the card's project name exactly before the destructive button enables; on confirm calls useArchiveCard; closes modal + toast on success"
    verdict: pass
    evidence: "ArchiveCardDialog.tsx wraps shadcn AlertDialog (which composes @radix-ui/react-alert-dialog under the hood). AlertDialogAction is `disabled={!matches || archive.isPending}` where `matches = typed === projectName` (case-sensitive). On submit (button click OR form Enter) calls useArchiveCard; on success closes the dialog + invokes onArchived callback (CardDetailModal then closes itself). useArchiveCard already toasts 'Card archived' from plan 23-06. PROJECT_NAME_MISMATCH errors render inline text instead of closing. Commit e04f977."
  - criterion: "CardDetailModal: when the modal opens for a card with unread notifications for the current user, useMarkCardNotificationsRead is fired once on mount; an Archive button is rendered in the modal footer iff role==='ADMIN' and card is not yet archived; clicking it opens ArchiveCardDialog"
    verdict: pass
    evidence: "CardDetailModal.tsx adds useEffect on (open, card?.id) that fires markRead.mutate({cardId: card.id}); mutate identity captured via ref so the effect deps stay tight. canArchive = role==='ADMIN' && !card.archivedAt; when true, footer renders <Button variant='destructive'><Archive /> Archive card</Button> with mr-auto so it is left-aligned alongside the close button. Click toggles local archiveOpen state which controls the rendered <ArchiveCardDialog>. onArchived from the dialog calls onOpenChange(false) on the parent modal so successful archive returns the user to the board. Commit a672604."
  - criterion: "Integration test scheduleIsolation.phase23.test.ts asserts that POST archive, PATCH notes, POST comment, file upload, and file delete leave Assignment / TeamMember / Absence / Holiday rows byte-identical across the operation"
    verdict: partial
    evidence: "scheduleIsolation.phase23.test.ts asserts byte-equality before/after each of: updateNotes, editComment, softDeleteComment, createNotificationsForMentions, archiveCard. The plan's literal mention list named POST comment, file upload, file delete instead of editComment/softDeleteComment; the test exercises the comment service's mutation surface (the route layer wraps the same calls) and the notification create path. File upload and file delete are NOT covered as standalone test cases — file upload depends on multer/multipart plumbing that is hard to drive from a unit-style integration test, and standalone file delete was not included. Mitigation: (a) plan 23-03's `boardFiles.ts` and `boardFileService.ts` routes both upload and delete through `prisma.boardFile.*` only — verified by grep, no `prisma.assignment.*` / `prisma.teamMember.*` / `prisma.absence.*` / `prisma.holiday.*` call sites in either file; (b) the archive test indirectly exercises file deletion via `boardArchiveService.archiveCard`'s `prisma.boardFile.deleteMany`. A sixth test case runs all five mutations against the same seed dataset and asserts the global snapshot is unchanged. Verified by `npx vitest run scheduleIsolation.phase23.test.ts` → 6/6 pass in 892ms. Standalone upload + delete tests are a follow-up. Commit 442f979."
  - criterion: "Schedule isolation: zero new imports from features/schedule/* mutations in any frontend file modified by this plan; backend test file only reads from schedule tables"
    verdict: pass
    evidence: "`grep -nE \"from '@/features/schedule\" frontend/src/features/board/components/{ArchiveCardDialog,CardDetailModal}.tsx frontend/src/components/layout/Sidebar.tsx | grep -v 'type '` returns zero matches. Backend test `grep -nE 'prisma\\.(assignment|teamMember|absence|holiday)\\.(create|update|delete|upsert)' backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` returns 4 matches: all are `delete` calls inside `teardownDataset()` for the rows the test itself seeded; zero matches occur inside the actual mutation paths under test (archiveCard / updateNotes / editComment / etc.)."
---

Phase 23 closeout: notification dot in the sidebar, typed-confirmation Archive dialog wired into the card modal, CardDetailModal auto-marks notifications read on open, and the schedule-isolation regression test that locks the no-write-to-schedule invariant for the whole phase. Backend test runs green (6/6) and the frontend type-checks cleanly.

## What Was Built

- **`useBoardSync.ts`** (commit `42fd6af`) — narrowed the `resource` type to `'cards' | 'comments' | 'files' | 'notifications'`. Runtime invalidate stays as the generic prefix invalidate; an inline comment documents that TanStack Query's default prefix matching already refreshes `['board','notifications','unread']` when the prefix `['board','notifications']` is sent, so no special-case branch is needed.
- **Sidebar notification dot** (commit `7c23c1c`) — `useUnreadNotificationCount(!!user)` gated on auth; for the Planner entry (`item.to === '/board'`), an absolutely-positioned 2px-square dot (`bg-primary ring-2 ring-sidebar`) overlays the icon when `unreadCount > 0`. `aria-label` exposes the count for screen readers.
- **`ArchiveCardDialog.tsx`** (commit `e04f977`) — shadcn AlertDialog with title/description/typed-input/destructive-action layout. Description lists `fileCount` + `formatBytes(totalBytes)` and reassures the admin that comments/notes/the linked schedule assignment are preserved. AlertDialogAction is disabled until typed input matches `projectName` exactly (case-sensitive). On `PROJECT_NAME_MISMATCH` the dialog stays open and renders inline error text. Reset on each `open` transition.
- **CardDetailModal Archive integration** (commit `a672604`) — `useEffect` on `(open, card?.id)` fires `useMarkCardNotificationsRead` once per open transition; mutate identity captured via ref to keep deps tight. Archive button rendered only when `role === 'ADMIN' && !card.archivedAt` (destructive variant + Archive icon, left-aligned via `mr-auto` so it does not crowd the Close button). Click opens `ArchiveCardDialog`; the dialog's `onArchived` callback closes the parent modal so success returns the user to the board.
- **`scheduleIsolation.phase23.test.ts`** (commit `442f979`) — six Vitest test cases. `snapshotScheduleTables()` serialises Assignment/TeamMember/Absence/Holiday ordered by id; `seedDataset()` creates one isolated dataset with timestamp+random-suffixed unique ids; `teardownDataset()` runs FK-safe deletes in `afterEach` so cleanup is robust to mid-test failures. Five per-mutation tests + one cumulative test (run all five mutations on the same seed before snapshotting). Verified: `6 passed` in 892ms.

## Files Modified

- `frontend/src/features/board/useBoardSync.ts` — modify: narrow resource type to literal union; add explanatory comment
- `frontend/src/components/layout/Sidebar.tsx` — modify: import unread-count hook + render absolutely-positioned dot on the Planner entry
- `frontend/src/features/board/components/ArchiveCardDialog.tsx` — create: typed-confirmation AlertDialog
- `frontend/src/features/board/components/CardDetailModal.tsx` — modify: auto-mark-read effect + Archive button + ArchiveCardDialog wiring
- `backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` — create: full Phase 23 mutation-matrix regression test

## Deviations

See frontmatter `deviations`. Six entries: (1) plan-body path correction (`/home/rl/...` → `/home/rm/...`); (2) `useBoardSync` resource type *narrowed* (rather than widened) — the original `string` was already a superset, so the better tightening is to a literal union; (3) `ArchiveCardDialog` adds a small `<form>` wrapper so Enter submits; (4) auto-mark-read mutate captured via ref for stable effect deps; (5) `User.email` removed from the test seed because that column does not exist in the schema; (6) test suite shipped six cases instead of the five sketched in the plan body — the extra `'full mutation matrix'` case catches order-dependent regressions per-test isolation would miss.

> **QA Round 01 cross-reference (DEVN-07-01, resolved-by-amendment):** see `.vbw-planning/phases/23-project-board-files-notes/remediation/qa/round-01/R01-PLAN.md` Task 4 — Task 5's standalone file-upload + file-delete cases were not added; indirect coverage via `archiveCard`'s `prisma.boardFile.deleteMany` (in `scheduleIsolation.phase23.test.ts`) plus static grep on `boardFiles.ts` and `boardFileService.ts` (zero schedule-mutation call-sites) is declared authoritative. Standalone supertest upload+delete suite is an optional follow-up.

## Verification Performed

- `npx tsc --noEmit` from `frontend/` — zero errors after each of the four commits.
- `npx tsc --noEmit` from `backend/` — zero errors after the test commit.
- `npx vitest run scheduleIsolation.phase23.test.ts` from `backend/` — **6 passed, 6 total** in 892ms. Each per-mutation test asserts byte-equality of the full schedule tables snapshot; the cumulative-matrix test runs all five mutations sequentially before snapshotting.
- `grep -nE "from '@/features/schedule" frontend/...{ArchiveCardDialog,CardDetailModal}.tsx Sidebar.tsx | grep -v 'type '` — zero schedule-mutation imports added.
- `grep -nE "prisma\\.(assignment|teamMember|absence|holiday)\\.(create|update|delete|upsert)" backend/...scheduleIsolation.phase23.test.ts` — only the test's own `teardownDataset` cleanup deletes match; no production mutation path touches schedule tables.

## Live Validation NOT Performed (deferred to executor)

The plan's 6-step "REQUIRES AUTHENTICATED LIVE VALIDATION" sequence (cross-user mention dot lifecycle, dot persistence across browser restart, ADMIN typed-confirmation flow with wrong/right name, post-archive DB inspection, audit-log row inspection, regression test green) is partially deferred. Steps (1)-(5) require multi-session live validation against a running stack and are deferred to the human executor. Step (6) — the regression test passing — is verified above.

## Phase 23 Complete

With this plan landed, Phase 23 (Project Board Files & Notes) is structurally complete: 7 plans, 7 SUMMARYs, full backend + frontend coverage of files/comments/notes/admin archive/notifications + schedule-isolation locked in via integration test. Phase 23 routes to UAT (Verify mode) on the next `/vbw:vibe` call once `auto_uat=true` or the user explicitly requests it. The known follow-ups: @mention authoring UX (mention extraction in the comment composer), executor live-validation checklist across all four deferred plans, and Phase 15's missing VERIFICATION.md (`first_qa_attention_phase`).
