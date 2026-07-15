---
phase: 1
title: Client Dropdown Order + Search — Research
type: research
confidence: high
date: 2026-07-08
---

# Phase 1 Research — Client Dropdown Order + Search

## Client Selectors Inventory

Full sweep of `frontend/src` confirms the milestone's "known instances" are the complete set — no other client-selection UI exists (`ClientManager` is a CRUD table, not a selector; `CardDetailModal` only displays the client name read-only; no card-creation flow has a client picker).

| File:Line | Primitive | Has search? | Data source | Current order |
|---|---|---|---|---|
| `frontend/src/features/schedule/components/AssignmentModal.tsx:396` — main `ClientSelect` (component defined at :43-116) | Popover + `Input` combobox (custom, hand-rolled buttons list, not shadcn `Command`) | Yes — case-insensitive substring `name.toLowerCase().includes(search.toLowerCase())` at :58-60 | `clients` prop, passed from `AssignmentModal`'s own `useClients()` call (:188-189: `clientsQuery.data?.clients ?? []`) | Raw array order from `GET /api/schedule/clients` (backend `orderBy: { name: 'asc' }`, case-sensitive ASCII) — no client-side sort |
| `frontend/src/features/schedule/components/AssignmentModal.tsx:481` — split `ClientSelect` (same component, second instance) | Same as above (identical component, reused) | Same as above | Same `clients` array (same `useClients()` call, shared local var at :189) | Same as above |
| `frontend/src/features/board/components/BoardFilters.tsx:62-77` — "All clients" filter | Radix/shadcn `<Select>` (`components/ui/select.tsx`) — no native text-search input | No | `clients` **prop** (`{ id: string; name: string }[]`, no `color` field — see Gotchas) passed down from `frontend/src/routes/Board.tsx:264` | **Not from `useClients()` at all.** Board.tsx:131-140 derives it by scanning currently-loaded `cards` and de-duping via a `Map<id,name>`, in card-iteration order (whatever order cards arrived in) — effectively arbitrary, and **scoped only to clients that have a card on the board**, not the full client roster |
| `frontend/src/features/schedule/components/ClientManager.tsx:140` (`clients.map`) | Plain `<Table>` rows (CRUD list: add/edit/delete client), **not a selection control** | N/A | `useClients()` directly (:49, :54) | Raw array order (backend order), no sort. Out of scope as a "selector" per the phase's decision (it's a management table, not something a user picks-a-client-then-does-something-else with), but worth a one-line mention to the planner in case they want sort applied there too for consistency — no search needed since it's a short admin list with inline add. |

No other matches for `clients.map`, `useClients(`, or `clientId` selection UI were found outside these files (`ScheduleGrid.tsx` and `CardDetailModal.tsx` only reference `clientId`/`client.name` for display/drag-drop payloads, not selection).

## Client Data Source & Type

- **Type** — `frontend/src/features/schedule/types.ts:120-126`:
  ```ts
  export interface Client {
    id: string
    name: string
    color: string
    createdAt: string
    updatedAt: string
  }
  ```
- **API fetch** — `frontend/src/features/schedule/api.ts:189-191`: `scheduleApi.getClients()` → `apiClient<{ clients: Client[] }>('/api/schedule/clients')`.
- **React Query hook** — `frontend/src/features/schedule/hooks.ts:280-285`:
  ```ts
  export function useClients() {
    return useQuery({ queryKey: ['schedule', 'clients'], queryFn: () => scheduleApi.getClients() })
  }
  ```
  No `select` transform, so no sorting happens at the hook layer today.
- **Backend** — `backend/src/services/clientService.ts:8` — `listClients()` does `prisma.client.findMany({ orderBy: { name: 'asc' } })`. Confirmed case-sensitive/ASCII on SQLite (already flagged in CONTEXT.md); left as-is per phase scope (client-side fix is the target, backend order is "reasonable default" reinforcement only, not required to change).
- **Board's client list is a different derivation entirely** (see inventory table) — it is NOT the same `Client[]` shape (no `color`), NOT fetched via `useClients()`, and is scoped to "clients with at least one card currently loaded on the board," not the full client roster. Any shared component/helper must accept a generic `{ id: string; name: string; color?: string }`-shaped array (or be generic over `<T extends { name: string }>`) rather than being hard-coded to the `Client` type, since Board.tsx's derived list won't have `color`.

## Recommended Approach

**Two-part fix, matching the CONTEXT.md's stated preference for extraction over duplication:**

1. **Extract a shared sort helper** (small, pure function) — e.g. `sortClientsByName<T extends { name: string }>(items: T[]): T[]` — that does:
   ```ts
   [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-PT', { sensitivity: 'base' }))
   ```
   Explicitly passing `'pt-PT'` (rather than `undefined`) makes the PT-PT-aware collation deterministic regardless of the browser/OS locale, matching the CONTEXT.md decision language ("PT-PT aware"). No existing locale-aware sort exists anywhere in the frontend today (`grep` for `localeCompare`/`Intl` found only unrelated date-string comparisons in `board/types.ts:149` and `dashboard/utils.ts:125,209` — none pass a locale or sensitivity option). No existing generic sort/collection helper exists in `frontend/src/lib/utils.ts` (currently only exports `cn()`).
   - **Recommended location: `frontend/src/lib/utils.ts`** (or a new small `frontend/src/lib/sort.ts` if the team prefers not to grow `utils.ts`). Reasoning: this helper is needed by both the `schedule` feature (`AssignmentModal`) and the `board` feature (`BoardFilters`/`Board.tsx`), and there is currently **no cross-feature import between `board` and `schedule`** (`grep` confirms zero `from '@/features/schedule'` imports inside `features/board`) — putting it in `features/schedule/` would be the first such coupling. `lib/` is the established shared/cross-feature location per `CONVENTIONS.md`.
   - Keep it generic (`<T extends { name: string }>`) so it works for the `Client` type (with `color`) and Board's derived `{id,name}` list without a type mismatch.

2. **Extract the existing `ClientSelect` (Popover + Input combobox) out of `AssignmentModal.tsx` into a reusable component**, and adopt it at the board filter site instead of the current Radix `<Select>`. This directly matches CONTEXT.md decision #3 ("Prefer extracting the existing `ClientSelect` search+sort behavior into a reusable searchable client-select/combobox component and reusing it").
   - **Why not "shared helper + add search per-site" instead:** the board filter's current primitive is Radix `<Select>` (`components/ui/select.tsx`), which has no built-in text-filter/search slot — bolting a search box onto it means either (a) rendering an `<Input>` above/inside the `SelectContent` and manually filtering `SelectItem`s (awkward with Radix's built-in typeahead/keyboard-nav, which would fight with a custom filter), or (b) replacing it with the same Popover+Input pattern `ClientSelect` already uses. Since (b) is needed anyway, and the codebase has **no `cmdk`/`Command` dependency** (`grep` of `package.json` confirms only `@radix-ui/react-select`, `-popover` is present via `components/ui/popover.tsx`, no `cmdk`), reusing the hand-rolled Popover+Input+button-list pattern already proven in `ClientSelect` is the lowest-risk, dependency-free path — no new library to add.
   - **Suggested component shape:** `ClientCombobox` (or similar), living in a shared location — either `frontend/src/components/ui/` (if the team wants it treated as a generic reusable UI primitive) or a new `frontend/src/features/schedule/components/ClientSelect.tsx` file imported by both features (schedule already owns the `Client` concept/CRUD via `ClientManager`). Given `board` doesn't otherwise import from `schedule`, and the component needs to work with Board's `{id,name}`-only shape (no `color`), **recommend a generic prop-driven component** (accepts `clients: {id,string,name:string,color?:string}[]`, `value`, `onChange`, optional `pinnedOptions` for sentinels) placed under `frontend/src/components/ui/` or a new `frontend/src/components/client-select.tsx`, so both features import it without creating a schedule→board or board→schedule coupling.
   - Component should internally apply `sortClientsByName` to the (non-sentinel) list before rendering, and keep the existing case-insensitive substring search behavior verbatim (already correct, per CONTEXT.md decision #4).
   - **Sentinel handling:** the component must accept sentinel/pinned entries ("No client" in `AssignmentModal`, "All clients" in `BoardFilters`) as an explicit prop/render-slot rendered above the sorted+filtered client list, and — per CONTEXT.md decision #5 — sentinels must NOT be included in the alphabetization or be filterable-away by the search box in a way that hides them (current `ClientSelect` already renders "No client" as a static button above the search-filtered list — replicate this pattern for "All clients").
   - `BoardFilters`'s trigger styling differs from `AssignmentModal`'s (`w-[160px] h-8 text-xs` vs `w-full justify-start font-normal`) — the extracted component needs a way to customize trigger classes/size (e.g. a `triggerClassName` or `size` prop) to preserve each site's existing visual footprint without regression.

**If time/risk pressure favors the smaller change:** a fallback (not recommended, but viable) is option (a) from CONTEXT.md's open question — apply `sortClientsByName` everywhere, keep `AssignmentModal`'s `ClientSelect` as-is, and only add a search `<Input>` + manual filtered-list rendering to `BoardFilters` without extracting a shared component (i.e., duplicate the Popover+Input pattern once more, since it's only 2 sites total). This avoids a refactor of `AssignmentModal.tsx` but leaves search logic duplicated in two places, which is what CONTEXT.md explicitly says to avoid ("rather than duplicating the filter logic"). Recommend the planner choose the extraction path (option 1+2 above) unless time-boxing strongly favors the smaller diff.

## Test Conventions

- Frontend tests are co-located in `__tests__/` dirs, `*.test.tsx`, run via Vitest 4 + jsdom (`frontend/vitest.config.ts`, `setupFiles: src/test-setup.ts`). No `test` script in `frontend/package.json` — run via `npx vitest run`.
- Existing relevant tests: `frontend/src/features/schedule/components/__tests__/AssignmentModal.lock.test.tsx` and `AssignmentModal.deleteConfirm.test.tsx` both mock `useClients` via `vi.mock('../../hooks', () => ({ ..., useClients: () => ({ data: { clients: [] } }) }))` — any new tests for `ClientSelect`/`ClientCombobox` sort+search behavior in `AssignmentModal` should follow this same mocking pattern (mock `useClients` to return a fixed, deliberately-unsorted `Client[]` fixture with mixed-case/accented names, e.g. `['Zeta', 'acme', 'Ácido']`, then assert render order and filtered results via `@testing-library/react`'s `render`/`screen`/`fireEvent`).
- No existing frontend test file covers `BoardFilters.tsx` or the client sort/search behavior specifically — this phase should add new test file(s), e.g. `frontend/src/features/schedule/components/__tests__/ClientSelect.test.tsx` (or wherever the extracted component lands) plus assertions inside a `BoardFilters` test if one gets created, and a small unit test for the `sortClientsByName` helper itself (pure function, easy to test in isolation — put alongside wherever it's created, e.g. `frontend/src/lib/__tests__/utils.test.ts` if colocating in `lib/utils.ts`, or `frontend/src/lib/__tests__/sort.test.ts` if split out).
- Frontend test coverage is currently sparse overall (`TESTING.md`: "Frontend: sparse — only `MappingOverlayCard.test.tsx`... Most UI is untested") — this phase would be one of the few frontend UI test additions in the repo; keep tests focused (sort correctness with mixed-case/accents, search filters + restores full list on clear, sentinel stays pinned, empty-state message) rather than broad UI snapshot testing.

## Gotchas

1. **`BoardFilters`'s `clients` prop is NOT the full client roster and has no `color` field.** It's derived in `Board.tsx:131-140` from currently-loaded board `cards` (`{ id, name }[]`, deduped via `Map`), scoped only to clients that appear on at least one visible card. Any shared component must tolerate a missing `color` (no swatch to render at that call site) and must not assume it receives the same array reference/identity as `AssignmentModal`'s `useClients()`-sourced list. This also means: even after this phase's fix, the board filter's client list will still only show clients with board cards — that's existing/intentional behavior unrelated to this phase's scope (not a bug to fix here).
2. **Sentinel options must stay pinned and un-alphabetized** — `AssignmentModal.tsx:97` ("No client" button, static, above the search-filtered/sorted list) and `BoardFilters.tsx:70` (`<SelectItem value="__all__">All clients</SelectItem>`, first item) — per CONTEXT.md decision #5, these must not be sorted into place among real client names, and the search box should not need to match/filter them either (they should always remain visible at top regardless of search text, matching current `ClientSelect` behavior for "No client").
3. **Keyboard a11y** — `ClientSelect`'s existing Popover already does `onOpenAutoFocus={(e) => e.preventDefault()}` + manual `setTimeout(() => inputRef.current?.focus())` to auto-focus the search input on open (`AssignmentModal.tsx:63, 79, 89`) and stops wheel-scroll propagation (`onWheel={(e) => e.stopPropagation()}` at :80, :92) to prevent the modal background from scrolling while the popover list scrolls. If replacing `BoardFilters`'s Radix `<Select>` with this pattern, note Radix `<Select>` currently provides native keyboard nav (arrow keys, type-ahead, Esc-to-close) "for free" — the hand-rolled Popover+button-list pattern in `ClientSelect` does NOT currently implement arrow-key navigation between filtered results (it's click/Enter-on-focused-search-then-manual-click only, so verify this against the a11y bar the team expects before assuming it's a drop-in equivalent for the Select it replaces).
4. **Preserve the color swatch** — `AssignmentModal.tsx:68, 105` renders a `<span style={{ backgroundColor: selected.color }}>` swatch both in the trigger button and each list row; this must be preserved for the schedule call sites in any extraction, made optional for the board call site (no `color` available there).
5. **Two `ClientSelect` instances share one `clients` array** in `AssignmentModal.tsx` (main at :396, split at :481, both fed from the single `clientsQuery` at :188-189) — sorting/searching should be applied once (e.g., inside the shared component, or once via `useMemo` in `AssignmentModal` before passing to both) rather than duplicated per-instance.
6. **No `cmdk`/shadcn `Command` component is installed** (`package.json` has `@radix-ui/react-select`, `-popover`, `-dialog`, etc., but no `cmdk`) — do not assume a `Command`/`CommandInput`/`CommandList` combobox pattern is available out of the box; either add the dependency or (recommended, lower-risk) reuse the existing hand-rolled Popover+Input+button-list pattern already proven in `ClientSelect`.
7. **Locale for `localeCompare`** — no locale-aware string comparison exists anywhere else in the frontend today (date formatting uses `'en-GB'` throughout: `constants.ts:186,190`, `HolidayManager.tsx:50`, `FilesPanel.tsx:23`, `CardDetailModal.tsx:54`, `NotesEditor.tsx:40`). Passing `undefined` as the locale to `localeCompare` would use the browser's locale, which is non-deterministic across environments/tests — recommend explicitly passing `'pt-PT'` (or `'pt'`) as documented in CONTEXT.md's example ("acme"/"Acme"/"Ácido" ordering) to keep sort behavior deterministic and testable regardless of the test runner's/browser's default locale.

## Live Validation Evidence

No live/runtime validation was performed for this research pass — all findings are static code inspection (grep + file reads) of the current committed frontend source. No external APIs, servers, or authenticated endpoints were involved.
- `command_shape`: N/A (static analysis only, no Bash execution against running services)
- `exit_status`: N/A
- `redacted_evidence`: N/A
- `expected_shape`: N/A
- `confidence`: high — findings are based on direct file reads/greps of the current repo state, not memory or assumption
- `limitations_or_deferred_reason`: Runtime behavior (e.g., actual keyboard-nav gaps in the Popover+Input pattern, actual visual regression risk) was not exercised in a browser; recommend the planner/dev phase include a manual or Playwright check of keyboard interaction on the reused combobox once implemented.
