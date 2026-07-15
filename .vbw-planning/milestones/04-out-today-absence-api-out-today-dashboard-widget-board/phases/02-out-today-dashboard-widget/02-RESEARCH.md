---
phase: "02"
title: "Out-Today Dashboard Widget"
type: research
confidence: high
date: 2026-07-02
---

## Findings

### 1. Dashboard Feature Structure

**Directory:** `frontend/src/features/dashboard/`

```
components/
  NoScheduleState.tsx   — empty/error state component
  ProjectCard.tsx       — individual project card widget
types.ts                — DashboardProject interface
utils.ts                — buildProjectTimeline, getCurrentProjects, getNextProjects, etc.
```

**Dashboard page/route:** `frontend/src/routes/Dashboard.tsx`

- Route registered in `frontend/src/App.tsx:98` as `<Route index element={<Dashboard />} />` (the `/` root route, inside `ProtectedRoute`).
- No `pages/` directory exists — route components live directly in `frontend/src/routes/`.

**How the page is assembled (`frontend/src/routes/Dashboard.tsx:43-157`):**

The `Dashboard` function returns a single `<div className="space-y-6">`. It currently has one visible section:

1. **Greeting header** (lines 44-49): `<h1>` with `getGreeting()` + user name.
2. **"Your Schedule" section** (lines 86-156): a `<div className="space-y-4">` block with a section heading (Calendar icon + `<h2>`), then the query-state branches (loading/404/empty/data).

Two additional sections ("Template Adaptation / Executive Report" and "Recent Activity") are commented out.

**To add the new widget:** Insert a new `<div className="space-y-4">` section block after line 156 (after the closing `</div>` of the Schedule section) and before line 240 (the outer closing `</div>`). The widget component should be imported from `@/features/dashboard/components/OutTodayWidget` and placed inside `frontend/src/features/dashboard/components/OutTodayWidget.tsx`.

**Exact insertion point:** `frontend/src/routes/Dashboard.tsx`, between line 156 (`</div>` closing the schedule section) and line 240 (`</div>` closing the outer `space-y-6` wrapper) — append a sibling `<div className="space-y-4">` block containing the new widget.

---

### 2. React Query Pattern

**API client:** `frontend/src/lib/api.ts`

- `apiClient<T>(endpoint: string, options?: RequestInit): Promise<T>` — typed `fetch` wrapper at `api.ts:51`.
- Automatically includes session cookies (`credentials: 'include'`), handles CSRF for mutating methods, and throws `ApiError` (with `.status`) on non-OK responses.
- GET requests need no special options — just call `apiClient<ResponseType>('/api/some/path')`.

**Pattern (from `frontend/src/features/schedule/api.ts` and `hooks.ts`):**

```ts
// api.ts — thin wrapper per endpoint
export const scheduleApi = {
  async getSomething(params: { year: number }) {
    const searchParams = new URLSearchParams({ year: String(params.year) })
    return apiClient<{ items: Item[] }>(`/api/schedule/something?${searchParams}`)
  },
}

// hooks.ts — useQuery on top of api function
export function useSomething(year: number) {
  return useQuery({
    queryKey: ['schedule', 'something', year],
    queryFn: () => scheduleApi.getSomething({ year }),
  })
}
```

**Query key convention:** `['schedule', '<sub-resource>', ...params]` — e.g. `['schedule', 'absences', params]` at `hooks.ts:208`. No `staleTime` is set on most schedule queries (defaults to 0 = stale immediately, refetch on mount/window-focus). Exception: `useProjectTags` uses `staleTime: Infinity` at `hooks.ts:338`.

**Recommended key for the new hook:** `['schedule', 'absences', 'out-today']` (no date param since the widget always queries today; optionally `['schedule', 'absences', 'out-today', date]` if a `date` param is ever added).

**staleTime guidance:** No staleTime needed — mirrors all other schedule queries. The widget can also accept a short `staleTime` (e.g. 5 minutes) since the data is date-anchored, but is not required by convention.

---

### 3. Phase 01 API Contract

**Endpoint:** `GET /api/schedule/absences/out-today`

**Source:** `backend/src/routes/schedule.ts:409-432`

**Query param (optional):** `date` — `YYYY-MM-DD` string (regex validated); defaults to today UTC when omitted.

**Response shape:**
```ts
{
  date: string          // resolved UTC YYYY-MM-DD (e.g. "2026-07-02")
  absences: AbsenceOutEntry[]
}
```

**`AbsenceOutEntry` interface** (`backend/src/services/absenceService.ts:7-12`):
```ts
export interface AbsenceOutEntry {
  teamMemberId: string
  displayName: string        // pre-resolved; never null (falls back to 'Unknown')
  type: string               // 'holiday' | 'sick' | 'vacation' | 'other'
  reason: string | null
}
```

**Frontend TS type to define:** Create `AbsenceOutEntry` in `frontend/src/features/schedule/types.ts` (alongside the existing `Absence` interface at `types.ts:76`):
```ts
export interface AbsenceOutEntry {
  teamMemberId: string
  displayName: string
  type: string
  reason: string | null
}
```

And the response wrapper:
```ts
export interface AbsencesOutTodayResponse {
  date: string
  absences: AbsenceOutEntry[]
}
```

**Auth:** `requireAuth` only — all authenticated users, no PM elevation. Same as `GET /api/schedule/absences` (open read).

---

### 4. shadcn UI + Styling Conventions

**Available shadcn primitives** in `frontend/src/components/ui/`:
- `skeleton.tsx` — `<Skeleton className="h-N w-N" />` used in Dashboard loading state (`Dashboard.tsx:93-103`).
- `card.tsx` — `Card`, `CardHeader`, `CardContent`, `CardTitle`, `CardDescription` (used in commented-out sections; ProjectCard uses raw `div` with manual `rounded-lg border bg-card` classes).

**Styling patterns observed in Dashboard.tsx and ProjectCard.tsx:**

| Pattern | Classes |
|---|---|
| Section wrapper | `space-y-4` |
| Section heading row | `flex items-center gap-2` + icon `h-5 w-5 text-muted-foreground` + `<h2 className="text-xl font-semibold tracking-tight">` |
| Sub-label (above card columns) | `text-xs font-medium uppercase tracking-wider text-muted-foreground` |
| Card shell (non-interactive) | `rounded-lg border bg-card text-card-foreground shadow-sm` |
| Card body padding | `p-4` |
| Empty/no-data card | `flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-8 text-center` with `text-sm text-muted-foreground` |
| Large empty state (NoScheduleState) | `px-6 py-10`, icon `h-10 w-10 text-muted-foreground/50`, `text-lg font-medium text-muted-foreground` |
| Skeleton loading block | `rounded-lg border bg-card p-4 space-y-3` wrapping `<Skeleton className="h-5 w-3/4" />` etc. |
| Responsive grid | `grid grid-cols-1 md:grid-cols-2 gap-4` |

The "Out Today" widget is a list (not a grid of two columns), so it should render as a single full-width section, consistent with `NoScheduleState`-style single-column layout.

**Lucide icons in use:** `Calendar` (schedule section heading, `Dashboard.tsx:1,88`), `CalendarX` (`NoScheduleState.tsx:1`). A suitable icon for the Out Today widget would be `UserX` or `UserMinus` from `lucide-react`.

---

### 5. Loading / Empty / Error Handling Patterns

**Loading:** `Dashboard.tsx:92-103` — when `assignmentsQuery.isLoading`, renders a `grid grid-cols-1 md:grid-cols-2 gap-4` of two skeleton cards, each a `rounded-lg border bg-card p-4 space-y-3` div containing 3 `<Skeleton>` elements of varying widths (`h-5 w-3/4`, `h-4 w-1/2`, `h-4 w-1/3`).

For the Out Today widget (single column), a simpler skeleton suffices: a single `rounded-lg border bg-card p-4 space-y-3` block with 3 skeleton rows.

**Empty state (no data):** `Dashboard.tsx:107-111` — a centered `rounded-lg border bg-card px-6 py-8 text-center` div with an icon and `text-sm text-muted-foreground` message. Matches `NoScheduleState` style except `py-8` (smaller padding since it's inline, not a full-page state). For "no one out today" the recommended text is "No one is out today" with a `CalendarCheck` or similar icon.

**Error state:** Dashboard does not render a generic error UI for the assignments query — it treats only `ApiError 404` specially (renders `NoScheduleState`). For the Out Today widget, a simple `text-sm text-muted-foreground` error inline message is sufficient (e.g. "Could not load absence data"). There is no shared `ErrorCard` component; all error display is inline.

**Query state branching pattern** (from `Dashboard.tsx:92-155`):
```tsx
{query.isLoading ? (
  <SkeletonBlock />
) : query.isError ? (
  <ErrorMessage />
) : absences.length === 0 ? (
  <EmptyState />
) : (
  <DataList />
)}
```

---

### 6. Existing Absence / Schedule Frontend Types

From `frontend/src/features/schedule/types.ts`:

- `AbsenceType = 'holiday' | 'sick' | 'vacation' | 'other'` (line 74) — reusable as a union for the `type` field label rendering in the widget.
- `Absence` interface (lines 76-84) — the full absence row (has `id`, `date`, `type`, `reason`, timestamps). **Not reusable directly** for Out Today because the endpoint returns `AbsenceOutEntry` (a flat projection with `displayName` already resolved, no `id` or dates).
- `TeamMember`, `TeamMemberUser` — available but not needed; `displayName` is pre-resolved in `AbsenceOutEntry`.

No existing frontend type maps 1:1 to the `AbsenceOutEntry` shape. A new `AbsenceOutEntry` interface and `AbsencesOutTodayResponse` response wrapper must be added to `frontend/src/features/schedule/types.ts`.

---

## Relevant Patterns

- **Feature module layout:** `features/schedule/api.ts` + `features/schedule/hooks.ts` — the new `getAbsencesOutToday` function belongs in `scheduleApi` (schedule/api.ts), and `useAbsencesOutToday` belongs in schedule/hooks.ts. No separate `features/dashboard/api.ts` or `hooks.ts` exists; dashboard reads from other feature hooks.
- **Component location:** New widget component goes in `frontend/src/features/dashboard/components/OutTodayWidget.tsx` (same directory as `ProjectCard.tsx` and `NoScheduleState.tsx`).
- **Import in route:** `Dashboard.tsx` imports from `@/features/dashboard/components/*` and `@/features/schedule/hooks`.

---

## Risks

- **Route registration order (backend):** The Phase 01 route comment (`schedule.ts:407`) notes the `/absences/out-today` route MUST stay registered before any `GET /absences/:id` route to avoid Express treating `"out-today"` as an `:id` param. This is a backend concern already resolved in Phase 01; no frontend risk.
- **AbsenceType label rendering:** The `type` field is a raw string on `AbsenceOutEntry`. The widget should use the existing `AbsenceType` union for display labels. A simple label map (`{ holiday: 'Holiday', sick: 'Sick', vacation: 'Vacation', other: 'Other' }`) is the right approach; no shared helper exists yet.
- **`staleTime` for today-anchored data:** If the widget is left open past midnight, the query would show yesterday's absentees until a refetch is triggered. This is acceptable for the current scope (no date-change watcher needed), but worth noting if a future iteration adds a clock-based refresh.

---

## Recommendations

1. **Files to create:**
   - `frontend/src/features/dashboard/components/OutTodayWidget.tsx` — the widget component (self-contained: owns loading/empty/error branches).

2. **Files to edit:**
   - `frontend/src/features/schedule/types.ts` — add `AbsenceOutEntry` interface and `AbsencesOutTodayResponse` type.
   - `frontend/src/features/schedule/api.ts` — add `getAbsencesOutToday(params?: { date?: string })` to `scheduleApi`.
   - `frontend/src/features/schedule/hooks.ts` — add `useAbsencesOutToday(date?: string)` using `useQuery` with key `['schedule', 'absences', 'out-today']`.
   - `frontend/src/routes/Dashboard.tsx` — import `OutTodayWidget` and insert a new `<div className="space-y-4">` section after the "Your Schedule" section (after line 156, before line 240).

3. **No new route registration** needed — widget is inline on the existing `/` dashboard route.

4. **No new shadcn component** needed — `Skeleton` is already imported in Dashboard.tsx; `Card`/`CardHeader`/`CardContent` can be used optionally, but the established pattern uses raw `div` with Tailwind classes.

5. **Query key:** `['schedule', 'absences', 'out-today']` — consistent with schedule namespace, no date param for the always-today use case in the widget.
