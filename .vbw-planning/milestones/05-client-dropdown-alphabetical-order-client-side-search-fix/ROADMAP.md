# Template AI Engine (Layer8) Roadmap

**Goal:** Small changes-and-fixes batch: make the client selection dropdown alphabetical and searchable, and fix the file-upload size limit so uploads up to 500MB succeed (they currently fail well under the limit).

**Scope:** 2 phases

## Progress
| Phase | Status | Plans | Tasks | Commits |
|-------|--------|-------|-------|---------|
| 01 | ◐ Needs Verification |
| 02 | ◐ Needs Verification |

---

## Phase List
- [x] [Phase 1: Client Dropdown — Alphabetical Order + Client-Side Search](#phase-1-client-dropdown--alphabetical-order--client-side-search)
- [x] [Phase 2: Fix 500MB Upload Size Limit](#phase-2-fix-500mb-upload-size-limit)

---

## Phase 1: Client Dropdown — Alphabetical Order + Client-Side Search

**Goal:** The client selection dropdown lists clients ordered alphabetically (case-insensitive A→Z) and provides a client-side (in-browser) search/filter input so a user can quickly narrow the list by typing. Applies to the shared client dropdown wherever it is used (e.g. project/assignment creation in the scheduling/planner surface). Sorting + filtering happen client-side over the already-fetched client list; no new backend endpoint required (backend ordering may be added as reinforcement if cheap).

**Deps:** None (operates on the existing `Client` data + the frontend client dropdown component)

**Requirements:** UI/UX (dropdown usability), Scheduling/planner (Client entity)

**Success Criteria:**
- The client dropdown renders clients sorted case-insensitively alphabetically.
- A search input filters the list as the user types (case-insensitive substring, client-side); clearing it restores the full sorted list; "no matches" is handled gracefully.
- The dropdown remains keyboard-accessible and matches existing shadcn/ui dropdown styling.
- Selecting a client still works exactly as before (no regression to the create/assign flow).

## Phase 2: Fix 500MB Upload Size Limit

**Goal:** File uploads up to 500MB succeed. Today a ~200MB file is rejected with a file-size-limit error, meaning at least one size-limit layer is misconfigured below 500MB. Root-cause every layer in the affected upload path (frontend pre-validation, Express body/JSON limits, multer/upload middleware limits, and any reverse-proxy/`launcher` config) and align them all to a single 500MB limit, so files ≤500MB upload and only files >500MB are rejected with a clear message.

**Deps:** None (upload/file-handling surface — e.g. board files `/uploads/board` / document processing)

**Requirements:** Document Processing / Board file uploads, UI/UX (clear over-limit error)

**Success Criteria:**
- A ~200MB file (previously rejected) uploads successfully through the affected path(s).
- Files up to 500MB upload successfully; files over 500MB are rejected with a clear, correct message.
- The specific misconfigured limit layer(s) are identified and corrected; the 500MB value is consistent across frontend and backend (and documented if it lives in config/env).
- No regression to existing upload safeguards (e.g. virus scan, board file auth-gating).

## Progress
| Phase | Done | Status | Date |
|-------|------|--------|------|
| 1 - Client Dropdown Order + Search | 1/1 | needs verification | - |
| 2 - Fix 500MB Upload Size Limit | 1/1 | needs verification | - |
