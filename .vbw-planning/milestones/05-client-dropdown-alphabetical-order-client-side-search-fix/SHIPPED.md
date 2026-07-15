---
milestone: 05-client-dropdown-alphabetical-order-client-side-search-fix
shipped: 2026-07-08
phases: 2
tag: milestone/05-client-dropdown-alphabetical-order-client-side-search-fix
---

# Shipped: Client Dropdown UX + Upload Limit Fix

Two changes-and-fixes threads delivered on the Layer8 Management Platform.

## Phases

1. **Client Dropdown — Alphabetical Order + Client-Side Search** — a shared generic `ClientCombobox` (`frontend/src/components/client-combobox.tsx`) + `sortClientsByName` helper (`frontend/src/lib/sort.ts`, pt-PT accent-insensitive `localeCompare`), adopted by the schedule assignment picker (main + split) and the board "All clients" filter. Clients are sorted case/accent-insensitively and searchable. QA PASS + UAT PASS (after 3 UAT polish rounds: sentinel shown-unless-searching, trigger hover matched to the pentesters `SelectTrigger`, down-chevron caret added, trigger text un-muted).

2. **Fix 500MB Upload Size Limit** — board-file per-file cap raised 50MB→500MB (`MAX_FILE_BYTES` in `boardFileService.ts`, message derived from the constant); distinct `FILE_TOO_LARGE`/`QUOTA_EXCEEDED` 413 reasons + accurate frontend toasts (`FilesPanel.tsx`); nginx `client_max_body_size`→500M in `deploy/nginx-layer8.conf` and `launcher.sh`. Scoped to board files only (document/executive-report/template-adapter uploads left at 50MB; avatar at 2MB). QA PASS + UAT PASS (large file now passes the size gate; >500MB rejected with the correct message; per-card quota intact).

## Notable

- Phase 01 QA needed one remediation round (a benign plan-text amendment). Phase 02 QA needed one remediation round to fix a pre-existing, unrelated stale test (`DeleteCardDialog.test.tsx` assertion).
- The recurring VBW quote-escaping gate quirk was pre-empted by normalizing single quotes in carried known-issue strings.

## Operational follow-up (on deploy)

- The nginx `client_max_body_size` changes require a deploy to take effect in production.
- Board file uploads require ClamAV to be available in the target environment (uploads fail with "antivirus not available" when the ClamAV daemon is down; `DISABLE_VIRUS_SCAN` bypasses it in dev).
- Pre-existing test note: the repo test suite is green after this milestone (the previously-failing `DeleteCardDialog.test.tsx` was fixed as part of Phase 02 QA remediation).
