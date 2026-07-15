---
phase: 01
tier: deep
result: PASS
passed: 44
failed: 0
total: 44
date: 2026-07-01
verified_at_commit: 76ef2c8b668c439ca360ca2021ff83d8756ebf68
writer: write-verification.sh
plans_verified:
  - 01-01
---

## Must-Have Checks

| # | ID | Truth/Condition | Status | Evidence |
|---|-----|-----------------|--------|----------|
| 1 | MH-01 | GET /api/schedule/absences/out-today returns who is absent on a given UTC date, defaulting to today when no ?date= is passed | PASS | Route at schedule.ts:409 with optional ?date= param; when omitted targetDate=undefined is passed to getAbsencesOnDate which defaults to new Date(); test 'today-default' confirms no-arg call returns today's absence |
| 2 | MH-02 | Date filtering uses full-UTC-day window (gte dayStart, lt nextDay); querying yesterday's absence on today returns nothing | PASS | absenceService.ts:37-38 where: { date: { gte: dayStart, lt: nextDay } }; dayStart computed as new Date(`${iso}T00:00:00.000Z`); nextDay = dayStart + 86400000; tests 'explicit-date boundary' and 'absent yesterday' both pass |
| 3 | MH-03 | Only active TeamMembers appear (teamMember.status === 'active'); archived/inactive members are excluded | PASS | absenceService.ts:39 teamMember: { status: 'active' } in where clause; SQL confirms j0.status = 'active' filter; test 'active-only: archived excluded' passes |
| 4 | MH-04 | displayName server-resolved: user.displayName > user.username > teamMember.displayName > 'Unknown' (backlog members included) | PASS | absenceService.ts:53-57 resolution chain: a.teamMember.user?.displayName ?? a.teamMember.user?.username ?? a.teamMember.displayName ?? 'Unknown'; tests 'name fallback' and 'backlog member included' both pass |
| 5 | MH-05 | Authz is requireAuth + readRateLimiter only — identical to GET /absences; no requireRole, no NORMAL over-exposure | PASS | schedule.ts:409 router.get('/absences/out-today', requireAuth, readRateLimiter, ...); no requireRole call; matches GET /absences pattern at line 375 |
| 6 | MH-06 | No new Prisma model, no schema migration; listAbsences/toggleAbsence left unmodified | PASS | git log c9f9214 d1447ed 76ef2c8 -- backend/prisma/ returns no output; schema.prisma Absence model unchanged; listAbsences at absenceService.ts:66 and toggleAbsence at :93 are identical to pre-phase HEAD~3 content |
| 7 | TC-01 | Test case: today-default — getAbsencesOnDate() with no arg returns member absent today (UTC) | PASS | absenceOutToday.test.ts:160-171 'today-default' test seeds absence on utcDay(todayIso()) and calls getAbsencesOnDate(); asserts result filtered to seeded tm.id has length 1 and displayName 'Today Person'; passes |
| 8 | TC-02 | Test case: explicit-date boundary — returned on its date, not returned on adjacent date | PASS | absenceOutToday.test.ts:173-184 seeds absence on 2026-01-01; asserts getAbsencesOnDate(2026-01-01) returns it and getAbsencesOnDate(2026-01-02) does not; passes |
| 9 | TC-03 | Test case: absent-yesterday — absence from yesterday is not returned for today's query | PASS | absenceOutToday.test.ts:186-196 seeds absence at todayStart - 86400000 (yesterday); getAbsencesOnDate() (today) returns empty for that member; passes |
| 10 | TC-04 | Test case: empty-day — date with no absences returns [] without throwing | PASS | absenceOutToday.test.ts:198-206 calls getAbsencesOnDate(utcDay('2099-12-31')); asserts result is array and filtered result has length 0; passes |
| 11 | TC-05 | Test case: multi-absence-day — three active members absent on one date all appear | PASS | absenceOutToday.test.ts:208-222 seeds 3 active members with absences on 2026-02-10; asserts all 3 appear in filtered result; passes |
| 12 | TC-06 | Test case: archived-excluded — absence on archived TeamMember is not returned | PASS | absenceOutToday.test.ts:224-233 seeds TeamMember with status 'archived' and absence on 2026-03-15; asserts filtered result has length 0; passes |
| 13 | TC-07 | Test case: backlog-included — userId null, isBacklog true member with displayName is returned | PASS | absenceOutToday.test.ts:235-249 seeds TeamMember with userId null, isBacklog true, displayName 'Futuro {suffix}'; asserts member appears with correct displayName from TeamMember.displayName; passes |
| 14 | TC-08 | Test case: name-fallback — null user.displayName falls back to user.username; non-null displayName uses displayName | PASS | absenceOutToday.test.ts:251-268 seeds user with null displayName (falls back to 'out-today-fallback-{suffix}') and user with 'Named Person' displayName; both asserted correctly; passes |
| 15 | TC-09 | Test case: reason-passthrough (optional per plan) — non-null reason surfaces; null reason stays null | PASS | absenceOutToday.test.ts:270-285 seeds absence with reason 'Doctor' and absence with reason null; both surface correctly; passes |
| 16 | TC-10 | Full test suite passes: 9/9 tests green | PASS | npx vitest run src/services/__tests__/absenceOutToday.test.ts: Test Files 1 passed (1), Tests 9 passed (9), duration 1.18s |

## Artifact Checks

| # | ID | Artifact | Exists | Contains | Status |
|---|-----|----------|--------|----------|--------|
| 1 | ART-01 | backend/src/services/absenceService.ts exists and provides getAbsencesOnDate + AbsenceOutEntry interface | Yes | export async function getAbsencesOnDate | PASS |
| 2 | ART-02 | backend/src/routes/schedule.ts exists and provides GET /absences/out-today route returning { date, absences } | Yes | /absences/out-today | PASS |
| 3 | ART-03 | backend/src/services/__tests__/absenceOutToday.test.ts exists and contains vitest coverage for getAbsencesOnDate | Yes | getAbsencesOnDate | PASS |
| 4 | ART-04 | AbsenceOutEntry interface has exact required fields: { teamMemberId: string; displayName: string; type: string; reason: string &#124; null } | - | - | PASS |
| 5 | ART-05 | getAbsencesOnDate is exported (not just defined internally) | - | - | PASS |
| 6 | ART-06 | listAbsences, toggleAbsence, and bulkCreateAbsences remain as pre-phase (unmodified) | - | - | PASS |

## Key Link Checks

| # | ID | From | To | Via | Status |
|---|-----|------|-----|-----|--------|
| 1 | KL-01 | backend/src/routes/schedule.ts | backend/src/services/absenceService.ts | import * as absenceService from '../services/absenceService.js' | PASS |
| 2 | KL-02 | backend/src/routes/schedule.ts | backend/src/services/absenceService.ts | absenceService.getAbsencesOnDate | PASS |
| 3 | KL-03 | backend/src/services/__tests__/absenceOutToday.test.ts | backend/src/services/absenceService.ts | import { getAbsencesOnDate } from '../absenceService.js' | PASS |
| 4 | KL-04 | backend/src/routes/schedule.ts (line 409) | backend/src/routes/schedule.ts (line 438) | route registration order | PASS |

## Anti-Pattern Scan

| # | ID | Pattern | Status | Evidence |
|---|-----|---------|--------|----------|
| 1 | AP-01 | No business logic in route handler — route stays thin, delegates to service layer | PASS | schedule.ts out-today route: only performs Zod parse, date param resolution, and delegates filtering/name-resolution to absenceService.getAbsencesOnDate; no Prisma calls in handler |
| 2 | AP-02 | No requireRole in out-today route (would over-restrict NORMAL users or grant unintended PM elevation) | PASS | schedule.ts:409 handler args: requireAuth, readRateLimiter only; requireRole is present on other routes but explicitly absent here, matching authz intent |
| 3 | AP-03 | No schema.prisma changes introduced by phase commits | PASS | git log c9f9214 d1447ed 76ef2c8 -- backend/prisma/schema.prisma returns empty; Absence model has pre-existing reason String? field that was reused |
| 4 | AP-04 | No new migration files created by phase commits | PASS | git log c9f9214 d1447ed 76ef2c8 -- backend/prisma/migrations returns empty; latest migration dir is 20260401111456_add_board_models, predating this phase |

## Convention Compliance

| # | ID | Convention | File | Status | Detail |
|---|-----|------------|------|--------|--------|
| 1 | CC-01 | ESM .js extension used in all relative imports in new files | backend/src/services/__tests__/absenceOutToday.test.ts | PASS | test:28 import from '../absenceService.js'; test:27 import from '../../db/prisma.js'; service:1 import from '@/db/prisma.js' — all ESM-compliant |
| 2 | CC-02 | camelCase naming convention followed in new backend code | backend/src/services/absenceService.ts | PASS | getAbsencesOnDate (function), AbsenceOutEntry (interface — PascalCase per TS convention), teamMemberId, displayName, dayStart, nextDay — all camelCase |
| 3 | CC-03 | @/ import alias used for prisma singleton in service file, matching sibling services | backend/src/services/absenceService.ts | PASS | absenceService.ts:1 import { prisma } from '@/db/prisma.js' — identical to holidayService.ts, scheduleService.ts, and all other service files |
| 4 | CC-04 | Zod validation at route boundary for ?date= query param | backend/src/routes/schedule.ts | PASS | schedule.ts:411-413 inline z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }); ZodError caught and returned as 400 at line 427 |
| 5 | CC-05 | Routes delegate to service layer; no Prisma or business logic in route handler | backend/src/routes/schedule.ts | PASS | Route handler only does: (1) parse query with Zod, (2) resolve targetDate param, (3) call absenceService.getAbsencesOnDate, (4) return json — all business logic and Prisma access in service |
| 6 | CC-06 | Commit messages follow {type}({scope}): {description} format | git log | PASS | c9f9214 feat(schedule): add getAbsencesOnDate out-today absence service method; d1447ed feat(schedule): add GET /absences/out-today read route; 76ef2c8 test(schedule): cover getAbsencesOnDate out-today service — all conform |
| 7 | CC-07 | 2-space indentation in new service code matches surrounding file style | backend/src/services/absenceService.ts | PASS | getAbsencesOnDate body uses 2-space indentation throughout, matching the pre-existing listAbsences and toggleAbsence functions |

## Requirement Mapping

| # | ID | Requirement | Plan Ref | Evidence | Status |
|---|-----|-------------|----------|----------|--------|
| 1 | RM-01 | UTC midnight normalization: iso slice + T00:00:00.000Z anchor + +86400000 nextDay | 01-01 | absenceService.ts:31-34 exact implementation per plan spec: const d = targetDate ?? new Date(); const iso = d.toISOString().slice(0, 10); dayStart = new Date(`${iso}T00:00:00.000Z`); nextDay = new Date(dayStart.getTime() + 86400000) | PASS |
| 2 | RM-02 | Route echoes back the resolved UTC YYYY-MM-DD date (not just echoing the ?date= param) | 01-01 | schedule.ts:421 const resolvedDate = (targetDate ?? new Date()).toISOString().slice(0, 10) — uses resolved date so today's date is echoed when no param given; line 424 res.json({ date: resolvedDate, absences }) | PASS |
| 3 | RM-03 | Response shape is { date: string, absences: AbsenceOutEntry[] } as required | 01-01 | schedule.ts:424 res.json({ date: resolvedDate, absences }) where absences is the AbsenceOutEntry[] array from getAbsencesOnDate | PASS |
| 4 | RM-04 | ZodError produces 400 with error message matching sibling route error shape | 01-01 | schedule.ts:426-427 if (error instanceof z.ZodError) { return res.status(400).json({ error: error.issues[0].message }) } — identical pattern to GET /absences at line 394-396 | PASS |
| 5 | RM-05 | 500 catch block with console.error and { error: 'Failed to list out-today absences' } | 01-01 | schedule.ts:429-430 console.error('[schedule routes] Error listing out-today absences:', error); res.status(500).json({ error: 'Failed to list out-today absences' }) — mirrors GET /absences pattern | PASS |
| 6 | RM-06 | TypeScript compiles clean for new files (tsc --noEmit); only pre-existing error in unmodified file | 01-01 | npx tsc --noEmit output: single error TS2835 in src/middleware/__tests__/rateLimit.test.ts (line 15) — pre-existing, unrelated to phase; no errors in absenceService.ts, schedule.ts, or absenceOutToday.test.ts | PASS |
| 7 | RM-07 | Prisma query includes full-UTC-day gte/lt filter + active status relational filter + include teamMember.user | 01-01 | absenceService.ts:36-49 prisma.absence.findMany with where: { date: { gte: dayStart, lt: nextDay }, teamMember: { status: 'active' } }, orderBy: [{ teamMemberId: 'asc' }], include: { teamMember: { include: { user: { select: { username, displayName } } } } }; SQL confirmed in test output showing j0.status = 'active' join condition | PASS |

## Pre-existing Issues

| Test | File | Error |
|------|------|-------|
| tsc --noEmit (typecheck) | backend/src/middleware/__tests__/rateLimit.test.ts | TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan |

## Summary

**Tier:** deep
**Result:** PASS
**Passed:** 44/44
**Failed:** None
