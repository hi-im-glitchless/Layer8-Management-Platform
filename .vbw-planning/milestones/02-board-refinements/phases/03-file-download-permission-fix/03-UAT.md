---
phase: 3
plan_count: 1
status: complete
started: 2026-06-03
completed: 2026-06-03
total_tests: 2
passed: 2
skipped: 0
issues: 0
---

UAT for broadening board-file view/download to any authenticated team member (read-only relaxation; upload/delete stay restricted). Verify on the running app with demo data seeded. You'll need a regular (NORMAL-role) team member who is NOT assigned to the project of the card under test. A Selenium replay that parks you on the card's Files panel is at `ui-seed/uat_replay_03.py` (run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_03.py`).

## Tests

### P01-T01: Non-assigned member can download a card's file

- **Plan:** 03-01 -- File Download Permission Fix
- **Scenario:** Log in as a regular team member (NORMAL role) who is NOT assigned to a given card's project. Open that card, go to the Files panel, and click Download on a file that someone else uploaded.
- **Expected:** The file downloads successfully — no "Forbidden" / permission error. (Before this phase, a non-assigned user got a 403 here.)
- **Result:** pass

### P01-T02: Read-only broadening — mutations still restricted for that user

- **Plan:** 03-01 -- File Download Permission Fix
- **Scenario:** As that same non-assigned NORMAL user on the same card, try to add a file (upload) and look for a delete control on an existing file.
- **Expected:** Viewing/downloading works, but the upload is rejected (permission error/toast) and there is no delete control for this user — delete stays PM/ADMIN, and need-to-know is preserved on mutations. Only list+download were broadened.
- **Result:** pass
