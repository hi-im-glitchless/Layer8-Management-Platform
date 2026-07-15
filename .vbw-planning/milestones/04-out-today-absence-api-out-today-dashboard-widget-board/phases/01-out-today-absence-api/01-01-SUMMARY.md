---
phase: 1
plan: "01"
title: Out-Today Absence API
status: complete
completed: 2026-06-29
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - c9f9214
  - d1447ed
  - 76ef2c8
deviations: []
pre_existing_issues:
  - '{"test": "tsc --noEmit (typecheck)", "file": "backend/src/middleware/__tests__/rateLimit.test.ts", "error": "TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan; not fixed"}'
ac_results:
  - criterion: "GET /api/schedule/absences/out-today returns who is absent on a given UTC date, defaulting to today when no ?date= is passed"
    verdict: "pass"
    evidence: "d1447ed schedule.ts route; test 'today-default' in absenceOutToday.test.ts"
  - criterion: "Date filtering uses a full-UTC-day window (gte dayStart, lt nextDay); querying yesterday's absence on today returns nothing"
    verdict: "pass"
    evidence: "c9f9214 getAbsencesOnDate; tests 'explicit-date boundary' + 'absent yesterday' in absenceOutToday.test.ts"
  - criterion: "Only active TeamMembers appear (teamMember.status === 'active'); archived/inactive excluded"
    verdict: "pass"
    evidence: "c9f9214 where.teamMember.status; test 'active-only: archived excluded'"
  - criterion: "displayName server-resolved: user.displayName > user.username > teamMember.displayName > 'Unknown' (backlog included)"
    verdict: "pass"
    evidence: "c9f9214 map step; tests 'name fallback' + 'backlog member included'"
  - criterion: "Authz is requireAuth + readRateLimiter only — identical to GET /absences; no requireRole"
    verdict: "pass"
    evidence: "d1447ed router.get('/absences/out-today', requireAuth, readRateLimiter, ...)"
  - criterion: "No new Prisma model, no schema migration; listAbsences/toggleAbsence left unmodified"
    verdict: "pass"
    evidence: "git diff HEAD~3 HEAD touches only the 3 planned files; no schema.prisma/migration changes"
  - criterion: "artifact backend/src/services/absenceService.ts provides getAbsencesOnDate + AbsenceOutEntry"
    verdict: "pass"
    evidence: "c9f9214; grep getAbsencesOnDate at absenceService.ts:27"
  - criterion: "artifact backend/src/routes/schedule.ts provides GET /absences/out-today returning { date, absences }"
    verdict: "pass"
    evidence: "d1447ed; route at schedule.ts:409, before POST /absences/toggle at :438"
  - criterion: "artifact backend/src/services/__tests__/absenceOutToday.test.ts provides vitest coverage"
    verdict: "pass"
    evidence: "76ef2c8; 9/9 tests pass"
  - criterion: "key_link schedule.ts -> absenceService.ts via absenceService.getAbsencesOnDate"
    verdict: "pass"
    evidence: "grep getAbsencesOnDate call site at schedule.ts:423"
  - criterion: "key_link test -> absenceService.ts via imports getAbsencesOnDate"
    verdict: "pass"
    evidence: "import { getAbsencesOnDate } from '../absenceService.js' in absenceOutToday.test.ts"
---

Backend-only "out today" capability: a name-resolved service function and a GET /api/schedule/absences/out-today read route reusing the existing Absence data, with full service-level vitest coverage.

## What Was Built

- `getAbsencesOnDate(targetDate?)` + `AbsenceOutEntry` interface in absenceService.ts: full-UTC-day window query (gte dayStart, lt nextDay), `teamMember.status === 'active'` filter, server-resolved displayName (user.displayName > user.username > teamMember.displayName > 'Unknown'), backlog members included. listAbsences/toggleAbsence untouched.
- `GET /absences/out-today` route in schedule.ts with `requireAuth + readRateLimiter` (authz identical to GET /absences, no requireRole), inline Zod `?date=YYYY-MM-DD` validation, returns `{ date, absences }`, registered before POST /absences/toggle.
- Service-level vitest (9 cases): today-default, explicit-date boundary, absent-yesterday, empty day, multi-absence day, archived-excluded, backlog-included, name fallback, reason passthrough. Parallel-safe (uniqueSuffix + withDbRetry, seeded-id-scoped teardown).

## Files Modified

- `backend/src/services/absenceService.ts` -- added: getAbsencesOnDate + AbsenceOutEntry (60 lines, additive).
- `backend/src/routes/schedule.ts` -- added: GET /absences/out-today route (32 lines, additive).
- `backend/src/services/__tests__/absenceOutToday.test.ts` -- created: vitest coverage (286 lines).

## Deviations

None.

## Verification Evidence

- `npx tsc --noEmit`: clean for all three modified files. The sole tsc error is pre-existing in `src/middleware/__tests__/rateLimit.test.ts` (TS2835, an unmodified file unrelated to this plan) — classified DEVN-05, not fixed.
- `npx vitest run src/services/__tests__/absenceOutToday.test.ts`: 9 passed (9).
- Route ordering: out-today at schedule.ts:409 precedes POST /absences/toggle at :438.
- `git diff --stat HEAD~3 HEAD`: only the 3 planned files changed; no schema.prisma / migration changes.
