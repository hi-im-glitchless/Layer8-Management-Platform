---
phase: 2
plan_count: 3
status: complete
started: 2026-07-14
completed: 2026-07-15
total_tests: 13
passed: 13
skipped: 0
issues: 0
---

Human acceptance testing for Phase 02 — Client Notes Tool Page (shared NotesEditor lift, frontend data layer, page/modal/sidebar/route-guard).

## Tests

### D01: Review summary deviation — Plan 01 git commit --amend bookkeeping

- **Source:** Summary deviation review
- **Deviation Signature:** 0e74385c106482aff693ba7fa348f9a359afccb00ccf1701eae1546dfd17c571
- **Source Plan:** 01
- **Source Summary:** 02-01-SUMMARY.md
- **Deviation:** None affecting scope. Bookkeeping note: the Task 2 commit was created with `git commit` then `git commit --amend` because a combined `git add` (deleted path + modal edit) aborted atomically on the already-`git rm`'d path; the final commit 04e59a2 correctly contains both the CardDetailModal edit and the old-file deletion. Still one atomic commit for the task.
- **Plan:** 01 -- Lift & Generalize the Shared NotesEditor
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D02: Review summary deviation — Plan 01 verification/amend restatement

- **Source:** Summary deviation review
- **Deviation Signature:** 0d575f7cdfe06f3088a431f2f59cc8ba69c80805608e36d923c68d23dc194e9d
- **Source Plan:** 01
- **Source Summary:** 02-01-SUMMARY.md
- **Deviation:** None affecting scope or behavior. Verification results: `cd frontend && npx tsc --noEmit` exit 0; `npx vitest run` full frontend suite 71/71 passing (incl. the new 7 NotesEditor cases and the 23 board cases); no `backend/` files modified. Bookkeeping only: the Task 2 commit was finalized via `git commit --amend` after a combined `git add` aborted on the already-`git rm`'d path — the resulting single commit 04e59a2 contains both the modal edit and the old-file deletion.
- **Plan:** 01 -- Lift & Generalize the Shared NotesEditor
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D03: Review summary deviation — Plan 02 DEVN-01 onError handler

- **Source:** Summary deviation review
- **Deviation Signature:** 725f2d686400617859f7e8d120f70ef09b0ae90c55a76af5013dca17a5910d2b
- **Source Plan:** 02
- **Source Summary:** 02-02-SUMMARY.md
- **Deviation:** DEVN-01 (minor, <5 lines): useUpdateClientNotes adds an onError handler wired to this file's existing handleMutationError helper, which the plan snippet omitted. Added for consistency — every other mutation in hooks.ts uses it; no behavior change to the documented success/unwrap/invalidate contract.
- **Plan:** 02 -- Client-Notes Frontend Data Layer (api + hooks)
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D04: Review summary deviation — Plan 02 DEVN-01 restatement

- **Source:** Summary deviation review
- **Deviation Signature:** fc78e813057e3f9029fea2061ebff2112045cf81163c98580fd86e7964b9755f
- **Source Plan:** 02
- **Source Summary:** 02-02-SUMMARY.md
- **Deviation:** DEVN-01 (minor, <5 lines): `useUpdateClientNotes` includes an `onError` handler wired to the existing `handleMutationError` helper in hooks.ts (the plan's snippet omitted it). Added purely for consistency with every other mutation in the file; the documented mutationFn/unwrap/invalidate contract is unchanged. No other deviations. Backend untouched (0 backend files), no projects/search fetch added (descoped), no socket invalidation added.
- **Plan:** 02 -- Client-Notes Frontend Data Layer (api + hooks)
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D05: Review summary deviation — Plan 03 task-order forward reference

- **Source:** Summary deviation review
- **Deviation Signature:** 7419c90c2261ac552ed4fdd6cb3d5c9b5a1457c073f0faba9dcba30fcd5f9ff9
- **Source Plan:** 03
- **Source Summary:** 02-03-SUMMARY.md
- **Deviation:** Followed plan task order (Task 1 first): commit a9603b4 imports @/routes/ClientNotes before it exists, so that single commit does not typecheck in isolation. Explicitly sanctioned by the plan's Task 1 NOTE; resolved by commit 107b8dc. Whole-plan typecheck is clean (tsc --noEmit exit 0).
- **Plan:** 03 -- Client Notes Page, Modal, Sidebar Entry & Route Guard
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D06: Review summary deviation — Plan 03 dual clientId+client prop

- **Source:** Summary deviation review
- **Deviation Signature:** 46ac59f9540345c38014dd0d8eedb50be2226a8b0a2ad412af9a9ae64f7ac2e8
- **Source Plan:** 03
- **Source Summary:** 02-03-SUMMARY.md
- **Deviation:** ClientNotesModal takes both clientId and a client={id,name,color} prop (name+colour supplied by the page from the loaded useClients list). This is the 'clientId plus a lookup' option the plan's Task 2 action explicitly offered — not a scope change.
- **Plan:** 03 -- Client Notes Page, Modal, Sidebar Entry & Route Guard
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D07: Review summary deviation — Plan 03 task-order restatement

- **Source:** Summary deviation review
- **Deviation Signature:** b0a0493ac84422a6ccd49fe2699c8169fed21b35d837f13261433b076cdc3d75
- **Source Plan:** 03
- **Source Summary:** 02-03-SUMMARY.md
- **Deviation:** Followed plan Task order (Task 1 first): commit `a9603b4` references `@/routes/ClientNotes` before it exists, so that commit alone doesn't typecheck — explicitly sanctioned by the plan's Task 1 NOTE and resolved by `107b8dc`. Whole-plan `tsc --noEmit` is clean.
- **Plan:** 03 -- Client Notes Page, Modal, Sidebar Entry & Route Guard
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D08: Review summary deviation — Plan 03 dual-prop restatement

- **Source:** Summary deviation review
- **Deviation Signature:** 9cdd2aa78b8bacefda012f048880b1741cf786332e4e4af769da574176dea500
- **Source Plan:** 03
- **Source Summary:** 02-03-SUMMARY.md
- **Deviation:** `ClientNotesModal` takes both `clientId` and a `client={id,name,color}` prop supplied by the page from the loaded client list — the "clientId plus a lookup" option the plan's Task 2 action offered; not a scope change.
- **Plan:** 03 -- Client Notes Page, Modal, Sidebar Entry & Route Guard
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D09: Review summary deviation — Plan 03 pre-existing Sidebar ESLint (DEVN-05)

- **Source:** Summary deviation review
- **Deviation Signature:** cfe62f05967c8dddacbced92b45437379ea864b8361e07dc04d1911b304c0167
- **Source Plan:** 03
- **Source Summary:** 02-03-SUMMARY.md
- **Deviation:** Pre-existing (DEVN-05): `Sidebar.tsx` carries two `react-hooks` ESLint issues on lines untouched by this plan (localStorage `set-state-in-effect`; `visibleGroups` useMemo memoization/deps). Confirmed pre-existing via `git diff 98c406d..HEAD`; out of scope, not fixed. See `pre_existing_issues`. (Note: already dispositioned accepted-process-exception in QA remediation R01 under the DEVN-05 precedent.)
- **Plan:** 03 -- Client Notes Page, Modal, Sidebar Entry & Route Guard
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### P01-T01: Board card notes still work after the shared-editor lift

- **Plan:** 01 -- Lift & Generalize the Shared NotesEditor
- **Scenario:** Plan 01 deleted the board's local NotesEditor and rewired the board Card Detail modal to use the single shared `@/components/NotesEditor`. Open the Board, open any card's detail modal, edit the card's notes in the markdown editor (try an Edit → Preview toggle), and Save.
- **Expected:** The board card notes editor still works exactly as before — Edit/Preview tabs render markdown, Save persists and flips to Preview, and the card reflects the saved notes. No visual or behavioural regression from the editor move.
- **Result:** pass

### P02-T01: Saving client notes refreshes attribution with no page reload

- **Plan:** 02 -- Client-Notes Frontend Data Layer (api + hooks)
- **Scenario:** As a PM or Admin, open Tools > Client Notes, open a client, edit the notes and Save. Watch the "last edited" attribution line without refreshing the browser.
- **Expected:** The save succeeds and the refreshed "last edited by {name} at {time}" attribution updates in place with no manual page reload (the client-notes cache is invalidated on success). If the save fails, an error toast appears.
- **Result:** pass

### P03-T01: Sidebar entry + route guard enforce PM-only access

- **Plan:** 03 -- Client Notes Page, Modal, Sidebar Entry & Route Guard
- **Scenario:** Log in as a NORMAL (non-PM) user: confirm "Client Notes" is NOT in the Tools sidebar, then paste `/client-notes` directly into the URL. Then log in as a PM or Admin and look at the Tools sidebar.
- **Expected:** As NORMAL: no "Client Notes" sidebar entry, and direct navigation to `/client-notes` is refused — you're redirected to the home page and see an "Access denied: insufficient permissions" toast (not just a hidden link). As PM/Admin: "Client Notes" appears in the Tools group and opens the page.
- **Result:** pass

### P03-T02: Client list + notes modal show name, colour, and notes correctly

- **Plan:** 03 -- Client Notes Page, Modal, Sidebar Entry & Route Guard
- **Scenario:** As a PM/Admin on the Client Notes page, review the client list, then click a client to open the notes modal.
- **Expected:** The page lists every client with a colour swatch + name (no projects shown). Clicking a client opens a modal titled with that client's name + colour, seeded with the client's current notes. The "last edited by" line, when present, shows a real person's display name — never a raw user id — and unknown/deactivated editors show no "by" clause.
- **Result:** pass

## Summary

- Passed: 0
- Skipped: 0
- Issues: 0
- Total: 13
