---
phase: 3
plan_count: 1
status: complete
started: 2026-07-02
completed: 2026-07-02
total_tests: 3
passed: 3
skipped: 0
issues: 0
---

UAT for Phase 03 — board checklist open access + default "Report is on client's share" item.

## Tests

### P01-T01: Any authenticated user can check items on ANY project's card

- **Plan:** 03-01 -- Board checklist open access + default Report-share item
- **Scenario:** Log in as a NORMAL-role user (pentester) who is NOT assigned to a given project. Open that project's board card and tick (check) one of its checklist items.
- **Expected:** The item toggles and persists (no "Forbidden"/error toast) — previously a non-assigned user could not edit that card's checklist. Other clients viewing the board see the change (realtime).
- **Result:** pass

### P01-T02: "Report is on client's share" appears as a checklist item

- **Plan:** 03-01 -- Board checklist open access + default Report-share item
- **Scenario:** Create a new project card (or open one) and view its checklist. For EXISTING cards, this requires the one-time backfill to have been run (`npx tsx backend/scripts/backfill-checklist-report-share-item.ts`); new cards get it automatically.
- **Expected:** The checklist includes a "Report is on client's share" item (unchecked by default), appearing after "Delivery". No duplicates.
- **Result:** pass

### P01-T03: Manager-only restrictions are NOT loosened

- **Plan:** 03-01 -- Board checklist open access + default Report-share item
- **Scenario:** As the same non-assigned NORMAL user, attempt a manager-only action on a card: archive it (or drag it into the Archived column) and/or change its stage lock.
- **Expected:** These remain blocked (Forbidden / not permitted) — only checklist editing was opened up. Archiving stays ADMIN-only; stage-lock stays PM/ADMIN-only. No regression.
- **Result:** pass

## Summary

- Passed: 0
- Skipped: 0
- Issues: 0
- Total: 3
