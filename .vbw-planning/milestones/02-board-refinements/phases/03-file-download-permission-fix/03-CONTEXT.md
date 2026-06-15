---
phase: 3
title: "File Download Permission Fix"
gathered: 2026-06-03
calibration: builder
---

# Phase 3 — Discussion Context

## Phase Boundary

Change #3: users couldn't download files they didn't upload. After grounding in
the code, the real issue is an **access-policy** one, not an uploader gate. This
phase broadens board-file **view + download** access to any authenticated team
member, while keeping all other card actions on the existing model.

## Code Findings (grounding — read during discussion)

- **There is NO uploader-identity gate anywhere.** `uploadedBy` is stored on
  upload (`boardService.addFile`) but never used for permissions. The
  reported "can't download files I didn't upload" symptom does not reproduce
  as an ownership check.
- **The real gate is `requireCardAccess`** (`backend/src/middleware/boardAuth.ts`):
  - ADMIN / PM → pass.
  - NORMAL → must be assigned (primary or split Assignment) to the card's
    project; otherwise **403 Forbidden**.
  - This middleware guards ALL card sub-resources: files (list/upload/download/
    delete), comments, notes, archive, notifications.
- **Download route** `GET /cards/:cardId/files/:fileId/download`
  (`backend/src/routes/boardFiles.ts:306`) and **list route** `GET …/files`
  are gated only by `requireCardAccess` (+ `requireAuth`, rate limit). No
  per-file/per-user check beyond card access. Already 404s on cross-card
  fileId, 410s on quarantined.
- **Frontend** `FilesPanel.tsx:172` shows the Download button for every file
  regardless of `uploadedBy` (disabled only while pending / if quarantined).
  No frontend uploader gate.

## Decisions Made

### Failing case (clarified by user)

- The user who couldn't download was **NOT assigned to the card's project** —
  `requireCardAccess` returned 403. This is the current model working as
  designed, not an ownership bug. So the fix is a **deliberate access-policy
  change**, not a regression hunt.

### Intended access policy

- **Any authenticated team member** should be able to **view (list) and
  download** a card's files — assignment to the project is NOT required for
  reads/downloads.

### Blast radius (what to relax)

- **Relax ONLY the file LIST + DOWNLOAD endpoints** to any authenticated user.
  Keep these on the existing assigned / ADMIN / PM model (NO change):
  - file **upload** (`POST …/files`)
  - file **delete** (`DELETE …/files/:fileId`, already ADMIN/PM-only)
  - **comments**, **notes**, **archive**, **notifications** sub-resources.
- Smallest change that satisfies the request; preserves need-to-know on
  mutations and non-file card data.

### Open (Claude's discretion — implementation)

- **Mechanism:** introduce a lighter guard for the two read routes — e.g.
  `requireCardExists` (auth + `boardCard.findUnique` for 404 + attach
  `req.boardCard`) used in place of `requireCardAccess` ONLY on
  `GET …/files` and `GET …/files/:fileId/download`. Keep `requireCardAccess`
  on every mutating/other route. Exact naming/factoring left to plan/exec.
- Keep existing download safeguards: 404 on cross-card fileId / missing card,
  410 on quarantined, `board.file.download` audit event (preserves traceability
  even under broadened access — note: the audit row already records `userId`).
- Quarantined-file list filtering for non-ADMINs stays as-is.
- Scout should confirm during planning HOW a non-assigned user reaches the card
  UI to attempt a download (board/card visibility), so the relaxed list+download
  endpoints actually resolve the end-to-end symptom; if board/card listing is
  also assignment-gated, flag whether that needs the same relaxation (but do
  NOT expand scope beyond list+download without surfacing it).

## NON-NEGOTIABLE

- **Schedule isolation**: the new/relaxed read guard and the file routes MUST
  NOT write Assignment / TeamMember / Absence / Holiday. Dropping the assignment
  check on the read path is actually an isolation improvement — the lighter
  guard need not read those tables at all. Keep the SCHEDULE-ISOLATION INVARIANT
  intact in `boardFiles.ts` and `boardAuth.ts`.

## Deferred Ideas

- None new. Broader access models (any-team-member for ALL card actions) were
  explicitly NOT chosen — out of scope.
