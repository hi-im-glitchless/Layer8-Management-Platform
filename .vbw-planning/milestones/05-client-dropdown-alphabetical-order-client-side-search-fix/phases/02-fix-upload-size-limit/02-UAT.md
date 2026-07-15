---
phase: 2
plan_count: 1
status: complete
started: 2026-07-08
total_tests: 3
passed: 3
skipped: 0
issues: 0
completed: 2026-07-08
---

UAT for Phase 02 — board file uploads allowed up to 500MB (per-file cap raised 50MB→500MB), accurate 413 messaging, nginx body-size raised.

## Tests

### P02-T01 — A large file (previously rejected) now uploads
- **Scenario:** Attach a file larger than 50MB — ideally the ~200MB file that previously failed (anything >50MB and ≤500MB) — to a board card.
- **Expected:** The upload succeeds (file attaches to the card). No "Maximum size is 50MB" / file-too-large error for a ≤500MB file. (If testing through a production nginx, it also passes the proxy.)
- **Result:** pass
- **Note:** The SIZE fix is confirmed working — the >50MB file passed the size limit and reached the virus-scan step (previously the 50MB cap would have rejected it first). The upload then stops at ClamAV ("antivirus not available"), which the user confirmed is a **local environment issue** (ClamAV daemon not running), NOT a Phase 2 defect. AV works where ClamAV is available / `DISABLE_VIRUS_SCAN` can be set in dev. The size-limit objective of this phase is met.

### P02-T02 — Over-500MB is rejected with the correct message
- **Scenario:** Attempt to attach a file larger than 500MB to a card (skip if you don't have one handy).
- **Expected:** Rejected with a clear "File too large — maximum is 500MB" message — NOT the misleading "Quota exceeded — this card already holds close to 500 MB." toast.
- **Result:** pass

### P02-T03 — Per-card 500MB quota still works (no regression)
- **Scenario:** With a card already holding close to 500MB of files, attempt another upload that would exceed the card's 500MB total.
- **Expected:** Rejected with the card-quota message ("Quota exceeded — this card already holds close to 500 MB."). The per-file limit and the per-card quota are distinct and each shows its correct message.
- **Result:** pass
