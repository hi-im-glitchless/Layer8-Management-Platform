---
phase: 2
plan: "02"
title: Client-Notes Frontend Data Layer (api + hooks)
status: complete
completed: 2026-07-10
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - 3377d04
  - ef8e132
  - 63fb58e
deviations:
  - "DEVN-01 (minor, <5 lines): useUpdateClientNotes adds an onError handler wired to this file's existing handleMutationError helper, which the plan snippet omitted. Added for consistency — every other mutation in hooks.ts uses it; no behavior change to the documented success/unwrap/invalidate contract."
pre_existing_issues: []
ac_results:
  - criterion: "scheduleApi.getClientNotes(id) calls GET /api/schedule/clients/{id}/notes and is typed to the UNWRAPPED shape { notes; notesUpdatedAt; notesUpdatedBy }, returned directly (no .client unwrap)."
    verdict: pass
    evidence: "3377d04 — api.ts:220-224; test clientNotesApi.test.ts 'getClientNotes issues a GET and returns the UNWRAPPED notes object as-is'"
  - criterion: "scheduleApi.updateClientNotes(id, notes) PUTs body { notes } and is typed to the WRAPPED shape { client: {...} }; asymmetry handled in FE, backend untouched."
    verdict: pass
    evidence: "3377d04 — api.ts:227-232; test 'updateClientNotes issues a PUT with a JSON { notes } body and returns the WRAPPED { client } shape'"
  - criterion: "useClientNotes(id) is a useQuery keyed ['schedule','client-notes',id] with enabled: !!id."
    verdict: pass
    evidence: "ef8e132 — hooks.ts:327-333"
  - criterion: "useUpdateClientNotes() mutationFn calls updateClientNotes, returns unwrapped notes (reads r.client), invalidates ['schedule','client-notes',id] on success."
    verdict: pass
    evidence: "ef8e132 — hooks.ts:335-349"
  - criterion: "No backend/** modified and no existing schedule api/hook altered — additive exports only."
    verdict: pass
    evidence: "git diff d5be383..HEAD = 123 insertions, 0 deletions across 3 frontend files; 0 backend files"
---

Added the client-notes frontend data layer (two scheduleApi functions + two TanStack Query hooks) over the Phase-01 GET/PUT endpoints, handling the GET-unwrapped / PUT-wrapped response-shape asymmetry entirely in the frontend; full suite 73/73 green (71 baseline + 2 new), typecheck and ESLint clean.

## What Was Built

- `scheduleApi.getClientNotes(id)` — GET typed to the UNWRAPPED `{ notes, notesUpdatedAt, notesUpdatedBy }` shape, returned as-is.
- `scheduleApi.updateClientNotes(id, notes)` — PUT with `{ notes }` body, typed to the WRAPPED `{ client: {...} }` Phase-01 shape, with a comment noting the asymmetry is intentional.
- `useClientNotes(id)` — guarded `useQuery` keyed `['schedule','client-notes',id]`, `enabled: !!id` so it only fires when a client is selected.
- `useUpdateClientNotes()` — `useMutation` that unwraps `r.client` (so consumers see one clean shape) and invalidates the client-notes key on success, following the file's `queryClient.invalidateQueries` convention (no socket invalidation, matching Phase-01's deliberate choice).
- Fetch-stubbed test pinning both the GET-unwrapped and PUT-wrapped shapes plus the PUT URL/method/body.

## Files Modified

- `frontend/src/features/schedule/api.ts` -- added: `getClientNotes` + `updateClientNotes` in the client section (additive; no existing function changed).
- `frontend/src/features/schedule/hooks.ts` -- added: `useClientNotes` query + `useUpdateClientNotes` mutation (additive; no existing hook changed).
- `frontend/src/features/schedule/__tests__/clientNotesApi.test.ts` -- created: fetch-mocked coverage of the GET/PUT response-shape asymmetry.

## Deviations

DEVN-01 (minor, <5 lines): `useUpdateClientNotes` includes an `onError` handler wired to the existing `handleMutationError` helper in hooks.ts (the plan's snippet omitted it). Added purely for consistency with every other mutation in the file; the documented mutationFn/unwrap/invalidate contract is unchanged. No other deviations. Backend untouched (0 backend files), no projects/search fetch added (descoped), no socket invalidation added.
