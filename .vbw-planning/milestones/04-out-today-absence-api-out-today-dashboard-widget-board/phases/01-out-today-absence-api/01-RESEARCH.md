---
phase: "01"
title: "Out-Today Absence API"
type: research
confidence: high
date: 2026-06-29
---

## Absence Model Shape

**File:** `backend/prisma/schema.prisma` (lines 232–247)

```prisma
model Absence {
  id           String   @id @default(cuid())
  teamMemberId String
  date         DateTime // Specific date (YYYY-MM-DD) — stored as UTC midnight
  type         String   // 'holiday' | 'sick' | 'vacation' | 'other'
  reason       String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  teamMember TeamMember @relation(fields: [teamMemberId], references: [id], onDelete: Cascade)

  @@unique([teamMemberId, date])
  @@index([teamMemberId])
  @@index([date])           // ← exists, so point-in-time date queries are indexed
  @@index([type])
}
```

Key shape decisions:
- **Single-date model** — one row per person per calendar day. No range/start+end columns. A multi-day absence (e.g., week-long vacation) is stored as N individual rows.
- **date field** stores an ISO UTC DateTime. When the toggle route receives `"2026-06-29"`, it calls `new Date(data.date)` → `2026-06-29T00:00:00.000Z` (UTC midnight). That value is written into SQLite.
- **@@unique([teamMemberId, date])** — at most one absence per person per day.
- **@@index([date])** — a point-in-time query `WHERE date = X` will use the index; no full scan.
- `reason` is optional; absent for most records created via the toggle flow.

TeamMember linkage (schema lines 168–186):

```prisma
model TeamMember {
  id          String  @id @default(cuid())
  userId      String? @unique          // null for backlog/placeholder rows
  isBacklog   Boolean @default(false)
  displayName String?                  // used when userId is null ("Futuro 1", etc.)
  status      String  @default("active") // active | inactive | archived
  ...
  user        User?   @relation(...)
  absences    Absence[]
}
```

A TeamMember row has either:
- A linked `User` (real pentester): `user.displayName` preferred, fall back to `user.username`.
- No linked `User` (backlog slot): use `teamMember.displayName` (e.g., "Futuro 1").


## Existing Absence/Schedule Query Code to Reuse

### `absenceService.ts` — `listAbsences` (the primary reuse target)

**File:** `backend/src/services/absenceService.ts`

```ts
export async function listAbsences(params: {
  teamMemberId?: string;
  dateStart: Date;
  dateEnd: Date;
}) {
  return prisma.absence.findMany({
    where: {
      date: { gte: params.dateStart, lte: params.dateEnd },
      ...(params.teamMemberId ? { teamMemberId: params.teamMemberId } : {}),
    },
    orderBy: [{ date: 'asc' }, { teamMemberId: 'asc' }],
    include: {
      teamMember: {
        include: {
          user: { select: { username: true, displayName: true } },
        },
      },
    },
  });
}
```

This already does everything needed:
- Range query on `date` with `gte`/`lte` — works for a single-day query with `dateStart = dateEnd = midnightUTC(targetDate)`.
- Includes `teamMember.user.{ username, displayName }` — all fields needed to resolve a display name.
- `@@index([date])` means the single-date query is O(absent_people_that_day), not O(all_absences).

**Recommended reuse:** Add a thin `getAbsencesOnDate` wrapper in `absenceService.ts` that normalises the target date to UTC midnight and delegates to the existing Prisma query (or duplicates just the query if cleaner). Do not modify `listAbsences` — its interface serves the schedule grid.

### `scheduleService.ts` — `listTeamMembers`

**File:** `backend/src/services/scheduleService.ts`

```ts
export async function listTeamMembers() {
  return prisma.teamMember.findMany({
    where: { status: 'active' },
    orderBy: { displayOrder: 'asc' },
    include: {
      user: { select: { username: true, displayName: true, avatarUrl: true } },
    },
  });
}
```

Not needed for the new endpoint — `listAbsences` already joins `teamMember.user`. No second round-trip required.


## Recommended Endpoint

### Route path and method

```
GET /api/schedule/absences/out-today
```

Query parameter:
- `?date=YYYY-MM-DD` — optional. If omitted, the server computes today's UTC date as fallback. **Strongly recommend the client always pass this** — see Risks section on timezone boundary.

Mount this route **before** `GET /absences` in `schedule.ts` (avoid the Express ambiguity risk if a future `GET /absences/:id` is ever added; also keeps absence routes grouped logically). In practice, since there is no current `GET /absences/:id`, ordering between the two GET handlers does not matter today.

### Zod input schema (inline, consistent with all other schedule routes)

```ts
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
```

### Response shape

Envelope-wrapped, consistent with all other schedule endpoints:

```json
{
  "date": "2026-06-29",
  "absences": [
    {
      "teamMemberId": "clxxxx",
      "displayName": "Alice Ferreira",
      "type": "vacation",
      "reason": null
    },
    {
      "teamMemberId": "clyyyy",
      "displayName": "Futuro 1",
      "type": "sick",
      "reason": null
    }
  ]
}
```

The `displayName` is the resolved name (see TeamMember→User section below). This avoids nesting and is directly widget-friendly for Phase 2 — no client-side resolution needed.

The `type` field is included so the widget can optionally colour-code by absence type (vacation/sick/holiday/other).

The echo of `date` in the response body lets the widget confirm which date was served (useful when the client did not pass `?date=`).

### Service function to add

**File:** `backend/src/services/absenceService.ts`

```ts
export interface AbsenceOutEntry {
  teamMemberId: string;
  displayName: string;
  type: string;
  reason: string | null;
}

/**
 * Return all team members who are absent on the given date (defaults to today UTC).
 * Includes backlog members (displayName from TeamMember.displayName when no user linked).
 */
export async function getAbsencesOnDate(targetDate?: Date): Promise<AbsenceOutEntry[]> {
  // Normalise to UTC midnight so the point query matches stored values exactly.
  const d = targetDate ?? new Date();
  const iso = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dayStart = new Date(`${iso}T00:00:00.000Z`);

  const absences = await prisma.absence.findMany({
    where: { date: dayStart },
    orderBy: [{ teamMemberId: 'asc' }],
    include: {
      teamMember: {
        include: {
          user: { select: { username: true, displayName: true } },
        },
      },
    },
  });

  return absences.map((a) => ({
    teamMemberId: a.teamMemberId,
    displayName:
      a.teamMember.user?.displayName ??
      a.teamMember.user?.username ??
      a.teamMember.displayName ??
      'Unknown',
    type: a.type,
    reason: a.reason,
  }));
}
```

Note: the query uses `date: dayStart` (exact equality) rather than `gte/lte` because the `@@unique([teamMemberId, date])` constraint guarantees each absence is at midnight UTC. Exact equality is marginally cleaner but either form works.


## Auth/RBAC Approach

Use `requireAuth, readRateLimiter` — identical to every other read-only endpoint on the schedule router:

```ts
router.get('/absences/out-today', requireAuth, readRateLimiter, async (req, res) => { … });
```

Evidence from `schedule.ts`:
- `GET /team-members` → `requireAuth, readRateLimiter`
- `GET /assignments` → `requireAuth, readRateLimiter`
- `GET /absences` → `requireAuth, readRateLimiter` — with the explicit comment: *"Read access is open to all authenticated users — mirrors GET /assignments, so pentesters can see who is out of office across the whole team."*

The new endpoint is a read-only subset of the existing absence data, visible to the same audience. **No PM+ elevation needed.** Do not use `requireRole` here.

Audit logging: not required for read-only data access (the middleware auto-audits denials; successful reads are not audited elsewhere on schedule routes).


## TeamMember→User Name Resolution

Resolution priority (applied in `getAbsencesOnDate`):

| Condition | Value used |
|-----------|-----------|
| `teamMember.user?.displayName` is non-null/non-empty | `user.displayName` |
| `teamMember.user` exists but `displayName` is null | `user.username` |
| `teamMember.userId` is null (backlog/placeholder member) | `teamMember.displayName` (e.g. "Futuro 1") |
| All null (edge case) | `"Unknown"` |

Backlog members (`isBacklog: true`, `userId: null`) can have absences — the schema permits it (`Absence.teamMemberId` links to any TeamMember, not filtered by `userId`). The endpoint should include them (they have display names like "Futuro 1"). If the widget should suppress backlog members from the "out today" list, add a `where: { teamMember: { isBacklog: false } }` filter in the Prisma query — but this is a scope decision for planning, not research.

The `listAbsences` function already does the join correctly and can be referenced as the pattern. The new `getAbsencesOnDate` duplicates only the minimal query shape it needs (exact-date instead of range, plus the name resolution mapping step).


## Testing Approach

**Framework:** Vitest 4 (`npm test` in `backend/`), node env, runs against real SQLite `backend/dev.db`.

**Test file location:** `backend/src/services/__tests__/absenceOutToday.test.ts`

Optionally also: `backend/src/routes/__tests__/absenceOutToday.route.test.ts` if route-level supertest coverage is wanted (not strictly required; the team's existing practice concentrates at the service layer for schedule logic).

### Test structure (service level)

Following the `deleteAssignmentOrphan.delete.test.ts` pattern:
- `uniqueSuffix()` helper for isolation.
- `beforeEach` or per-test seed: create a `User`, `TeamMember`, and one or more `Absence` rows.
- `afterEach` / `try-finally` cleanup scoped to seeded IDs.
- `withDbRetry` wrapper for SQLite busy-lock transience (already in sibling tests).

### Cases to cover

| Case | Description |
|------|-------------|
| **Happy path — single absence** | One absence on today → returns one entry with correct `displayName`, `type`, `reason`. |
| **Happy path — multi-absence** | Three absences on today for different team members → all three returned. |
| **Empty day** | No absences on target date → returns `{ date, absences: [] }`. |
| **Date boundary — explicit param** | Absence stored on `2026-01-01T00:00:00.000Z`; query with `?date=2026-01-01` → returned. Query with `?date=2026-01-02` → not returned. |
| **Date boundary — absent yesterday** | Absence stored on yesterday → not returned when querying today. |
| **Backlog member** | `isBacklog: true` TeamMember with a `displayName` and an absence → returned, name resolved correctly. |
| **User without displayName** | `user.displayName` is null → falls back to `user.username`. |
| **Type variety** | Absence types `holiday`, `sick`, `vacation`, `other` each map through correctly (type is not transformed). |
| **Reason field** | Absence with `reason: "Doctor"` → `reason` appears in output. Absence with null reason → `reason: null`. |

Service-level tests only need to call `getAbsencesOnDate(date)` directly; no HTTP layer needed. This follows the established pattern for schedule service tests.

If a route test is added, use a seeded session (cookie) and supertest against the Express app. The pattern is available in `routes/__tests__/boardFiles.test.ts` and `routes/__tests__/boardAdminArchive.test.ts`.


## Files to Touch

**Backend (Phase 1 — this phase):**

| File | Change |
|------|--------|
| `backend/src/services/absenceService.ts` | Add `getAbsencesOnDate(targetDate?: Date)` function + `AbsenceOutEntry` interface. |
| `backend/src/routes/schedule.ts` | Add `GET /absences/out-today` route handler (requireAuth, readRateLimiter). Import `getAbsencesOnDate` from absenceService. |
| `backend/src/services/__tests__/absenceOutToday.test.ts` | New test file covering all cases above. |

**Frontend (Phase 2 — not this phase, documented for contract alignment):**

| File | Change |
|------|--------|
| `frontend/src/features/dashboard/api.ts` | New file. Add `dashboardApi.getOutToday(date?: string)`. |
| `frontend/src/features/dashboard/hooks.ts` | New file. Add `useOutToday()` TanStack Query hook. |
| `frontend/src/features/dashboard/types.ts` | Extend with `OutTodayMember` and `OutTodayResponse` interfaces. |
| `frontend/src/features/dashboard/components/OutTodayWidget.tsx` | New component consuming the hook. |
| `frontend/src/routes/Dashboard.tsx` | Mount the widget. |

No schema migration is needed — the `Absence` model is unchanged.


## Risks and Gotchas

### 1. Timezone / date-boundary handling (HIGH RISK)

**Problem:** The `date` column stores UTC midnight (e.g. `2026-06-29T00:00:00.000Z`). "Today" computed server-side as `new Date()` gives a UTC timestamp. If the server runs in UTC (standard for Linux deployments), `new Date().toISOString().slice(0,10)` returns the correct UTC date. However for a team in Europe/Lisbon (UTC+1 in winter, UTC+2 in summer), at 11pm local time the UTC date is already "tomorrow" — so the server's "today" does not match the team's "today".

**Recommended mitigation:** Accept `?date=YYYY-MM-DD` from the client (browser knows the local date), validate it with Zod regex `/^\d{4}-\d{2}-\d{2}$/`, and construct `new Date(`${date}T00:00:00.000Z`)` server-side. Default to server UTC date only as a fallback. Document in the route comment that the client should always pass the date.

**Do not** implement a timezone offset parameter — that adds complexity the data model cannot support (no timezone column on absences).

### 2. Exact-equality vs. range query

**Problem:** `listAbsences` uses `gte/lte` on a range. For a single-day query, using `date: dayStart` (exact equality) is simpler and avoids potential off-by-one if a future migration accidentally stores times other than midnight. However, if for any reason a historical absence was stored with a non-midnight time (e.g., via a raw SQL import), exact equality would miss it.

**Recommendation:** Use `gte: dayStart, lt: nextDayStart` (exclusive upper bound covering the full UTC day) as a defensive pattern in `getAbsencesOnDate`. This handles any time-of-day variation in stored dates:
```ts
const nextDay = new Date(dayStart.getTime() + 86400000);
where: { date: { gte: dayStart, lt: nextDay } }
```

### 3. Archived / inactive TeamMembers

**Problem:** The Prisma query joins absences to any `TeamMember`, including `status: 'archived'` or `status: 'inactive'` ones. An archived pentester might still have past (or even current) absence rows from before archiving.

**Recommendation:** Add `teamMember: { status: 'active' }` to the `where` clause in `getAbsencesOnDate`. This mirrors how `listTeamMembers()` filters to `status: 'active'` only, and prevents showing absences for people no longer on the team.

```ts
where: {
  date: { gte: dayStart, lt: nextDay },
  teamMember: { status: 'active' },
},
```

### 4. Backlog member inclusion

**Problem:** Backlog members (`isBacklog: true`) are real TeamMember rows with real absences. Whether they should appear in the "out today" widget is a product decision. Including them is technically trivially supported; the name resolves to `teamMember.displayName` (e.g., "Futuro 1").

**Recommendation:** Include them in the initial implementation (consistent with how schedule routes do not filter by `isBacklog`). Phase 2 widget can decide whether to render them differently or suppress them in the UI. Flag this in the plan as a design decision point.

### 5. Route ordering in schedule.ts

**Problem:** `GET /absences/out-today` must be registered before any future `GET /absences/:id` route to avoid Express treating "out-today" as an ID parameter.

**Current state:** No `GET /absences/:id` route exists. But if one is ever added in the future, ordering matters.

**Recommendation:** Place the new route immediately after the `GET /absences` handler and before `POST /absences/toggle` in `schedule.ts`, with a comment noting the ordering dependency.

### 6. SQLite busy-lock in tests

Tests run against the shared `backend/dev.db`. Use the `withDbRetry` helper pattern (present in `deleteAssignmentOrphan.delete.test.ts` and `boardAutoMove.stopped.test.ts`) to handle transient SQLite `SQLITE_BUSY`/timeout errors when the test suite runs in parallel.

### 7. No socket invalidation needed

Mutations (`POST /absences/toggle`) already emit `emitScheduleInvalidate('absences')`. The new `GET /absences/out-today` is read-only — it does not need to emit anything. If Phase 2 wants real-time updates when an absence is toggled while the dashboard is open, it should subscribe to the `useScheduleSync` hook (already available) and invalidate the `['dashboard', 'out-today']` query key on absence events.
