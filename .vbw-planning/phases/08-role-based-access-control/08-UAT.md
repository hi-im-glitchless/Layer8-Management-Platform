---
phase: "08"
plan_count: 5
status: in_progress
started: 2026-02-19
total_tests: 6
passed: 1
skipped: 0
issues: 0
---

## UAT Tests

### P01-T1: Role schema and seed
**Plan:** 08-01 — Database Schema Migration & Seed Update
**Scenario:** Log in as the seeded admin user. Go to Profile page. Confirm the role badge shows "Admin" (not a boolean). Check that the role field exists in the user data.
**Expected:** Profile page shows role badge "Admin". No references to isAdmin visible anywhere in the UI.
**Result:** PASS

### P04-T1: Role-based route access enforcement
**Plan:** 08-04 — Backend Route Migration to Role-Based Access
**Scenario:** Log in as a NORMAL user. Try to navigate to Template Adapter (/adapter) and Executive Report (/report). Verify you are redirected or see an access denied state. Then log in as ADMIN and confirm both pages load.
**Expected:** NORMAL user cannot access MANAGER+ routes. ADMIN user can access everything.
**Result:**

### P05-T1: Sidebar filtering by role
**Plan:** 08-05 — Frontend Components & Route Guards
**Scenario:** Log in as NORMAL user. Check the sidebar — Template Adapter, Executive Report, and Admin Panel should NOT be visible. Log in as ADMIN — all items should be visible.
**Expected:** Sidebar only shows items the user's role has access to.
**Result:**

### P05-T2: User management role selector
**Plan:** 08-05 — Frontend Components & Route Guards
**Scenario:** As ADMIN, go to Admin > User Management. Create a new user. Verify the dialog has a Role dropdown (not an isAdmin switch). Set role to PM and save. Verify the user table shows the PM role badge.
**Expected:** Role dropdown with 4 options (Normal, PM, Manager, Admin). User table shows role badges.
**Result:**

### P05-T3: Role change forces re-login
**Plan:** 08-04 + 08-02 — Session Invalidation
**Scenario:** Open two browser windows — one as ADMIN, one as a test user. As ADMIN, change the test user's role. In the test user's window, try any action — they should be logged out / get a 401.
**Expected:** Changing a user's role invalidates their active sessions immediately.
**Result:**

### P05-T4: Self-demotion protection
**Plan:** 08-04 — Backend Route Migration
**Scenario:** As the only ADMIN user, try to change your own role to something lower (e.g., PM). The system should prevent this.
**Expected:** Self-demotion is blocked with an error message.
**Result:**
