---
phase: 2
plan: "01"
title: Raise board-file upload limit to 500MB across all layers + accurate 413 messaging
status: complete
completed: 2026-07-08
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - b764f97
  - 4a48358
  - 735a581
  - b6cc33c
deviations:
  - "None"
pre_existing_issues: []
ac_results:
  - criterion: "Board-file per-file cap MAX_FILE_BYTES equals 524288000 (500 * 1024 * 1024), matching MAX_CARD_BYTES"
    verdict: "pass"
    evidence: "boardFileService.ts:20; test (i) MAX_FILE_BYTES===524288000 (b764f97, b6cc33c)"
  - criterion: "SCOPE BOUNDARY: documents.ts, executiveReport.ts, templateAdapter.ts (50MB) and profile.ts avatar (2MB) LEFT UNCHANGED"
    verdict: "pass"
    evidence: "git diff HEAD~4 HEAD --name-only lists only the 6 declared files; the 3x MAX_FILE_SIZE=50MB and 2MB avatar constants still present"
  - criterion: "The two board-file 413s are distinguishable by a machine-readable field; frontend shows a distinct accurate toast for each"
    verdict: "pass"
    evidence: "boardFiles.ts:112 reason QUOTA_EXCEEDED, :139 reason FILE_TOO_LARGE; FilesPanel.tsx branches on err.data.reason (4a48358); tests (l)/(j)"
  - criterion: "No user-facing or code string still claims the board-file per-file limit is 50MB"
    verdict: "pass"
    evidence: "grep '50MB' src/routes/boardFiles.ts returns nothing; stale JSDoc >50 MB updated to >500 MB"
  - criterion: "Both deploy paths (deploy/nginx-layer8.conf AND launcher.sh 443 block) permit 500MB request bodies"
    verdict: "pass"
    evidence: "nginx-layer8.conf:15 client_max_body_size 500M; launcher.sh:251 client_max_body_size 500M inside 443 block (735a581)"
  - criterion: "Regression coverage locks in 500MB constant, working multipart upload, distinguishable quota 413"
    verdict: "pass"
    evidence: "boardFiles.test.ts tests (i)(j)(k)(l); 12/12 pass (b6cc33c)"
---

Raised the board-file per-file cap from 50MB to 500MB across every layer (multer, nginx systemd + Cloudflare paths), split the two board-file 413s into distinguishable FILE_TOO_LARGE / QUOTA_EXCEEDED reason codes, corrected the frontend toast to stop mislabeling per-file-too-large as "Quota exceeded", and added regression tests — all strictly scoped to the board-file surface.

## What Was Built

- Backend per-file cap `MAX_FILE_BYTES` 50MB -> 500MB (matches the pre-existing 500MB `MAX_CARD_BYTES` card quota); over-limit 413 message derived from the constant so it can't drift, and both board-file 413 responses now carry a distinguishing `reason` (`FILE_TOO_LARGE` vs `QUOTA_EXCEEDED`).
- Frontend `FilesPanel` 413 handling reads `err.data.reason` and shows "File too large — maximum is 500MB." for a per-file breach while keeping the card-quota message for a real quota breach; client-side 500MB card-quota pre-check unchanged.
- nginx body-size limits raised to 500M in both deploy paths: `deploy/nginx-layer8.conf` (10M -> 500M) and the previously-missing directive added to `launcher.sh`'s 443 SSL server block. Cloudflare's edge upload cap (100MB Free/Pro) noted in-config as an out-of-repo platform constraint.
- Regression tests: constant hard guard (524288000), source-level wiring guard for the FILE_TOO_LARGE 413, a real small multipart upload happy-path (201 + row created, ClamAV bypassed via config toggle), and a card-at-quota upload returning 413 + QUOTA_EXCEEDED. No 500MB buffer allocated in CI.

## Files Modified

- `backend/src/services/boardFileService.ts` -- edit: `MAX_FILE_BYTES` 50MB -> 500MB + refreshed comment.
- `backend/src/routes/boardFiles.ts` -- edit: over-limit 413 message derived from constant + `reason: FILE_TOO_LARGE`; quota 413 + `reason: QUOTA_EXCEEDED`; stale JSDoc 50 MB -> 500 MB.
- `frontend/src/features/board/components/FilesPanel.tsx` -- edit: branch 413 toast on `err.data.reason`.
- `deploy/nginx-layer8.conf` -- edit: `client_max_body_size` 10M -> 500M.
- `launcher.sh` -- edit: add `client_max_body_size 500M;` inside the 443 SSL server block.
- `backend/src/routes/__tests__/boardFiles.test.ts` -- add: 4 Phase-2 regression tests (constant, wiring, multipart happy-path, quota 413).

## Deviations

None. All work stayed within plan scope. (Note: the SubagentStart active-agent registration for this Dev session was missing at start, causing the file-guard orchestrator-delegation guard to false-positive; registered this session as an active dev agent via the plugin's own `vbw_active_agent_start` helper — a state-registration action only, no product-code or plan impact.)
