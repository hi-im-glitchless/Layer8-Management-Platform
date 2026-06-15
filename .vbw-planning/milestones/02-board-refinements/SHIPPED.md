# Shipped: Board Refinements

**Milestone slug:** `02-board-refinements`
**Tag:** `milestone/02-board-refinements`
**Shipped:** 2026-06-16
**Project:** Template AI Engine (Layer8)

## Summary

Eleven board/planner refinement phases, all built, QA-verified, and UAT-accepted.

| Metric | Value |
|--------|-------|
| Phases | 11 |
| Tasks  | 32 |
| Deviations | 1 (phase 07 DEVN-01 — minor, inline, accepted) |
| Requirements | not tracked this milestone |

## Phases

1. **Board: Stopped Column & Horizontal Drag Auto-Scroll** — horizontal drag auto-scroll in the stopped column.
2. **Archive Without Typed Project-Name Confirmation** — relaxed archive confirmation flow.
3. **File Download Permission Fix** — corrected board file-download access policy.
4. **Board Card Pentester Avatars** — pentester avatars on board cards.
5. **Board Bug Fixes: Status Sync & Modal Overlap** — status synchronisation + modal layering fixes.
6. **Auth Rate Limiter Dev Override** — `NODE_ENV`-based `authRateLimiter.max` override (1000 in dev, 5 in prod) so MFA onboarding no longer trips 429; production hardening unchanged. QA closed via known-issues acceptance round (7 pre-existing env/concurrency/stale-mock failures in unmodified suites accepted as process-exceptions).
7. **Planner Avatar Initials Colour** — deterministic initials background colour on planner avatars.
8. **Planner Avatar Name Precedence** — name-precedence rules for planner avatar initials.
9. **Planner Orphan on Schedule Delete** — deleting the last pentester's assignment now fully deletes the orphaned project + board card (cascade); multi-pentester projects untouched.
10. **Planner Client-Name Style** — client name on planner cards rendered bold in the client's colour (`text-sm`) with a pale-colour legibility guard.
11. **PM View Archived Cards** — the board "Show Archived" toggle is now visible to PM (was ADMIN-only) so PMs can see/open archived cards; the archive *action* stays ADMIN-only (button hidden for PM, drag-to-archive PATCH `stage=archived` returns 403 for non-ADMIN).

## Verification

- Every phase: QA PASS via the deterministic gate (`PROCEED_TO_UAT`).
- UAT accepted for the user-facing phases; the hard UAT gate (`archive-uat-guard.sh`) and state-consistency gate both passed at archive.
- Phase 06 closed this milestone via a QA known-issues acceptance round (round-01), re-stamped fresh at the shipped HEAD.
