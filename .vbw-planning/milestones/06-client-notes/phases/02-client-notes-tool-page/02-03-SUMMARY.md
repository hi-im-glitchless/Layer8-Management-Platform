---
phase: 2
plan: "03"
title: Client Notes Page, Modal, Sidebar Entry & Route Guard
status: complete
completed: 2026-07-10
tasks_completed: 5
tasks_total: 5
commit_hashes:
  - a9603b4
  - d038775
  - 107b8dc
  - fa855a2
  - 2ba8340
deviations:
  - "Followed plan task order (Task 1 first): commit a9603b4 imports @/routes/ClientNotes before it exists, so that single commit does not typecheck in isolation. Explicitly sanctioned by the plan's Task 1 NOTE; resolved by commit 107b8dc. Whole-plan typecheck is clean (tsc --noEmit exit 0)."
  - "ClientNotesModal takes both clientId and a client={id,name,color} prop (name+colour supplied by the page from the loaded useClients list). This is the 'clientId plus a lookup' option the plan's Task 2 action explicitly offered — not a scope change."
pre_existing_issues:
  - '{"test": "eslint react-hooks/set-state-in-effect", "file": "frontend/src/components/layout/Sidebar.tsx", "error": "Line 94: Avoid calling setState() directly within an effect (localStorage collapsed-state load). Pre-existing on code untouched by this plan — git diff 98c406d..HEAD shows my only Sidebar edits are the NotebookPen import and the nav item. Out of scope; not fixed."}'
  - '{"test": "eslint react-hooks/preserve-manual-memoization + exhaustive-deps", "file": "frontend/src/components/layout/Sidebar.tsx", "error": "Lines 84-87: visibleGroups useMemo flagged for manual-memoization + missing userHasRole dep. Pre-existing on untouched lines; newer react-hooks ruleset flagging long-standing code. Out of scope; not fixed."}'
ac_results:
  - criterion: "truths[0]: NavItem { to:'/client-notes', icon: NotebookPen, label:'Client Notes', minRole:'PM' } added to Tools group, filtered out for NORMAL by existing item.minRole filter (no filter-logic change)"
    verdict: "pass"
    evidence: "Sidebar.tsx:52 + import :7 (a9603b4); ClientNotesAccess.test cases 4a/4b (absent NORMAL, present PM)"
  - criterion: "truths[1]: App.tsx registers /client-notes INSIDE <RoleProtectedRoute minRole='PM'> within ProtectedRoute; NORMAL redirected to '/' + 'Access denied' toast (not just hidden)"
    verdict: "pass"
    evidence: "App.tsx:104-107 reuses existing guard (a9603b4); ClientNotesAccess.test case 1 (redirect+toast), cases 2/3 (PM/ADMIN admitted)"
  - criterion: "truths[2]: ClientNotes lists every client via useClients in a ui/table (colour+name), Board.tsx-style isLoading skeleton + isError/Retry, ?client= modal open/close"
    verdict: "pass"
    evidence: "ClientNotes.tsx (107b8dc): useClients table, Skeleton rows, AlertCircle+Retry, useSearchParams ?client handler"
  - criterion: "truths[3]: ClientNotesModal fetches via useClientNotes, renders shared NotesEditor, name+colour (no projects), saves via useUpdateClientNotes onSave={mutateAsync({id,notes})} isSaving={isPending}; refreshed attribution no reload"
    verdict: "pass"
    evidence: "ClientNotesModal.tsx (d038775); ClientNotesModal.test case 3 (mutateAsync called once with {id,notes})"
  - criterion: "truths[4]: modal resolves notesUpdatedBy to a name via useBoardMembers (find id then displayName??username else null), passes resolved NAME/null to NotesEditor, commented intentional cross-feature reuse"
    verdict: "pass"
    evidence: "ClientNotesModal.tsx:9-40 (comment + resolver); ClientNotesModal.test case 2 (shows 'Alice' not 'u1'), case 4 (unknown id -> null, no 'by' clause)"
  - criterion: "truths[5]: no backend/** modified; no projects/search fetch, hook, or features/projects/ directory introduced (name + colour only)"
    verdict: "pass"
    evidence: "git diff shows only frontend/ files; grep for project/search in modal + page returns nothing"
  - criterion: "artifacts: ClientNotesModal.tsx, ClientNotes.tsx, Sidebar.tsx, App.tsx, ClientNotesAccess.test.tsx, ClientNotesModal.test.tsx all present with required 'contains' tokens"
    verdict: "pass"
    evidence: "All six files exist; grep confirms NotesEditor / useClients / 'Client Notes' / client-notes / NORMAL / ClientNotesModal tokens"
  - criterion: "key_links: page->modal via ?client=; modal->NotesEditor via onSave mutateAsync; modal->schedule hooks; App->ClientNotes route under PM guard"
    verdict: "pass"
    evidence: "ClientNotes.tsx renders <ClientNotesModal clientId={selectedClientId}...>; modal onSave wired; App.tsx import + guarded <Route>"
---

Built the user-facing Client Notes tool (PM/ADMIN-only): sidebar entry, PM-guarded route reusing the existing RoleProtectedRoute, a client-list page, and a per-client modal reusing the shared NotesEditor and the 02-02 client-notes hooks — frontend-only, backend untouched, name+colour only.

## What Was Built

- PM-gated `/client-notes` route registered under the existing `RoleProtectedRoute minRole="PM"` (no new guard) and a `NotebookPen` "Client Notes" entry in the Tools sidebar group (minRole PM), hidden from NORMAL by the existing item.minRole filter.
- `ClientNotes` page: lists every client via `useClients()` in a `ui/table` (colour swatch + name), with a loading skeleton and an isError + Retry state; a row click opens the modal via a `?client=<id>` URL search param (Board.tsx pattern), clearing it closes the modal.
- `ClientNotesModal`: shows the client's name + colour only (no projects), fetches notes via `useClientNotes`, seeds the shared `NotesEditor`, saves via `useUpdateClientNotes` (`mutateAsync({ id, notes })`, `isSaving={isPending}`), and resolves `notesUpdatedBy` to a display name via `useBoardMembers` (intentional cross-feature reuse, commented) — never a raw id; unknown/deactivated editor → null.
- New route-guard test infrastructure (`ClientNotesAccess.test.tsx`): proves NORMAL is refused at the route (redirect to `/` + access-denied toast) AND absent from the sidebar, while PM/ADMIN are admitted/visible.
- `ClientNotesModal.test.tsx`: proves the modal opens with name+colour+seeded notes, shows the resolved editor name (not the raw id), and Save calls the update mutation once with `{ id, notes }`.

Verification: `tsc --noEmit` clean (exit 0); full frontend suite 82/82 green (73 baseline + 9 new); new/created files ESLint-clean.

## Files Modified

- `frontend/src/components/layout/Sidebar.tsx` -- modified: add NotebookPen import + Client Notes NavItem (minRole PM) to the Tools group.
- `frontend/src/App.tsx` -- modified: import ClientNotes; register /client-notes under a PM-gated RoleProtectedRoute inside ProtectedRoute.
- `frontend/src/features/schedule/components/ClientNotesModal.tsx` -- created: per-client notes modal (name+colour, useClientNotes, shared NotesEditor, useUpdateClientNotes save, useBoardMembers name resolution).
- `frontend/src/routes/ClientNotes.tsx` -- created: client-list page (table + ?client= modal open/close, loading/error states).
- `frontend/src/routes/__tests__/ClientNotesAccess.test.tsx` -- created: route-guard (NORMAL refused + toast; PM/ADMIN admitted) and sidebar-visibility coverage.
- `frontend/src/features/schedule/components/__tests__/ClientNotesModal.test.tsx` -- created: modal open/attribution/save coverage.

## Deviations

- Followed plan Task order (Task 1 first): commit `a9603b4` references `@/routes/ClientNotes` before it exists, so that commit alone doesn't typecheck — explicitly sanctioned by the plan's Task 1 NOTE and resolved by `107b8dc`. Whole-plan `tsc --noEmit` is clean.
- `ClientNotesModal` takes both `clientId` and a `client={id,name,color}` prop supplied by the page from the loaded client list — the "clientId plus a lookup" option the plan's Task 2 action offered; not a scope change.
- Pre-existing (DEVN-05): `Sidebar.tsx` carries two `react-hooks` ESLint issues on lines untouched by this plan (localStorage `set-state-in-effect`; `visibleGroups` useMemo memoization/deps). Confirmed pre-existing via `git diff 98c406d..HEAD`; out of scope, not fixed. See `pre_existing_issues`.
