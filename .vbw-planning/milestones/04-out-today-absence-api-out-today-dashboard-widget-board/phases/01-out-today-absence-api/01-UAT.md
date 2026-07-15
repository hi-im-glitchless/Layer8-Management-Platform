---
phase: 1
plan_count: 2
status: complete
started: 2026-07-01
completed: 2026-07-02
total_tests: 3
passed: 3
skipped: 0
issues: 0
---

UAT for Phase 01 — Out-Today Absence API. This phase adds a backend read endpoint `GET /api/schedule/absences/out-today` that returns who is absent on a given date (defaulting to today), plus a test-infrastructure fix. Verify against the running backend with an authenticated session (the same auth you use for `/api/schedule`).

## Tests

### P01-T01: Out-today endpoint returns the right people

- **Plan:** 01-01 -- Out-Today Absence API
- **Scenario:** With the app/backend running and logged in, call `GET /api/schedule/absences/out-today` (no query param). Compare the returned list against who you know is marked absent today (e.g. via the planner/absence UI).
- **Expected:** The response is `{ date, absences }` where `date` is today's UTC date (YYYY-MM-DD) and `absences` lists each person who is out today with a sensible display name (their user display name / username, or team-member name for backlog members). Nobody who is present appears; nobody out today is missing.
- **Result:** pass

### P01-T02: Specific date + empty day behave correctly

- **Plan:** 01-01 -- Out-Today Absence API
- **Scenario:** Call the endpoint with `?date=YYYY-MM-DD` for (a) a past/future day you know has an absence, and (b) a day you know has nobody out. Also confirm a person absent only *yesterday* does not show up in today's default call.
- **Expected:** The `?date=` day returns exactly the people out on that day; the known-empty day returns `{ date, absences: [] }` (empty list, not an error); yesterday's absence does not leak into today's result.
- **Result:** pass

### R01-T01: App still works after the test-infra fix

- **Plan:** R01 -- Clear tracked TS2835 known-issue in rateLimit.test.ts
- **Scenario:** This plan was an internal test-file typing fix (no user-facing change). Just confirm the app still behaves normally from your perspective — sign in and use the planner/schedule area as usual.
- **Expected:** No regression: authentication, rate limiting, and the schedule/absence screens all still work as before.
- **Result:** pass
