# Template AI Engine (Layer8) — Milestone Context

Gathered: 2026-07-08
Calibration: builder

## Scope Boundary

A small "changes and fixes" batch requested by the user:
1. Client selection dropdown should be ordered alphabetically.
2. Add a client-side search bar to the client dropdown.
3. Fix the file-upload size limit: the limit should be 500MB, but uploads currently fail well under it (a ~200MB file is rejected with a file-size-limit error).

## Decomposition Decisions

### Phase Count & Grouping
2 phases:
- Phase 1 groups items 1 + 2 — both are frontend enhancements to the same client-dropdown component (alphabetical ordering + client-side search), naturally implemented and verified together.
- Phase 2 is item 3 — a separate upload-limit bug on a different surface (file upload path / backend limits) that needs root-cause investigation across the size-limit layers.

### Phase Ordering
Independent phases; no hard dependency. Phase 1 (dropdown) first as the simpler frontend change; Phase 2 (upload bug) second as it requires tracing multiple limit layers. Either could be done first.

### Scope Coverage
Covers: alphabetical + searchable client dropdown; raising/fixing the effective upload limit to a consistent 500MB across layers.
Excluded / deferred: server-side/paginated client search (this is client-side over the already-fetched list), chunked/resumable uploads, changing which upload surfaces exist, and any unrelated dropdown/upload redesign.

## Requirement Mapping

| Phase | Requirements |
|-------|--------------|
| 1 — Client Dropdown Order + Search | UI/UX (dropdown usability), Scheduling/planner (Client entity) |
| 2 — Fix 500MB Upload Size Limit | Document Processing / Board file uploads, UI/UX (clear over-limit error) |

## Key Decisions

- Client dropdown sorting + search are **client-side** over the already-fetched client list (small team / small client list) — no new backend search endpoint.
- The 500MB upload limit must be made **consistent across every layer** (frontend pre-validation, Express body/JSON, multer/upload middleware, and any reverse-proxy/launcher config); the bug is a lower misconfigured layer, not the intended limit.

## Deferred Ideas

- Server-side client search/pagination if the client list ever grows large.
- Chunked / resumable uploads for very large files.
