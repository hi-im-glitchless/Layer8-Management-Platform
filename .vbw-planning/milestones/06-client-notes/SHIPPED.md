# Shipped: Client Notes

**Milestone slug:** `06-client-notes`
**Shipped:** 2026-07-15
**Git tag:** `milestone/06-client-notes`
**Project:** Template AI Engine (Layer8)

## Summary

Markdown notes attached to a `Client`, editable by PMs and Admins through a new Tools page, surfaced read-only on the planner cards of every project belonging to that client — plus a follow-on UX refinement flipping the planner-card project-notes editor to open Preview-first.

## Phases (4) — all QA-verified + UAT-accepted

| Phase | Name | QA (authoritative) | UAT |
|-------|------|--------------------|-----|
| 01 | Client Notes — Data Model + API | R01 PASS | complete (via UAT remediation R01) |
| 02 | Client Notes Tool Page | R01 PASS | complete — 13/13 |
| 03 | Read-Only Client Notes on the Planner Card | R02 PASS | complete — 3/3 |
| 04 | Project-Notes Preview-First Tabs | R01 PASS | complete — 6/6 |

## Key deliverables

- `Client.notes` + `notesUpdatedAt`/`notesUpdatedBy` (Prisma migration); PM/Admin-gated audited write endpoint; all-roles read path.
- PM-gated `Client Notes` Tools page + per-client modal reusing a single shared `frontend/src/components/NotesEditor.tsx` (hardened `rehype-sanitize` schema preserved).
- Read-only client-notes section above project notes on the planner card detail modal (widened `boardService` `Project.client` select; exported `NotesPreview` single render path). Kanban tile unchanged.
- Prop-driven `previewFirst` on `NotesEditor`: planner-card project notes open Preview-first; client-notes page editor stays Edit-first.

## Accepted deviations / process-exceptions

- Phase 02: `useUpdateClientNotes` `onError` handler (DEV-01) — resolved by plan-amendment.
- Phase 03: `templateAdapter` test-harness mock gap — accepted process-exception (pre-existing, out-of-scope backend test); re-affirmed across a `verified_at_commit` re-stamp.
- Phase 04: DEVN-01 (`fireEvent.mouseDown` activation) + DEVN-02 (`getByText` for cases a/b under Radix inactive-tab unmount) — resolved by plan-amendment; UAT-accepted.

## Notes

- Verification: authoritative QA per phase is the round-scoped `R{RR}-VERIFICATION.md` (phase-level files frozen at PARTIAL after deviations were recorded as FAIL checks, then resolved by remediation).
- Milestone slug chosen explicitly (`06-client-notes`); `derive-milestone-slug.sh` produced a degenerate concatenated slug.
