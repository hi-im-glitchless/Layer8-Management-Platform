---
phase: "08"
plan: "08-04"
title: "Backend Route Migration to Role-Based Access"
status: complete
commits:
  - 23eb6fe feat(08-04): update auth routes to use role instead of isAdmin
  - 8e1b39b feat(08-04): update user management routes to use role field
  - 9a86d97 feat(08-04): update admin and deny list routes to requireRole
  - 51c4d90 feat(08-04): update audit routes to role-based access
  - 951d5ea feat(08-04): restrict template adapter and executive report to MANAGER+
  - 42bee3f fix(08-04): update profile route select to use role instead of isAdmin
deviations:
  - "DEVN-01: profile.ts had stale isAdmin in Prisma select, fixed inline (1 line)"
---
## What Was Built
- Login stores session.role, GET /me returns role field
- User CRUD uses role enum with Zod validation, session invalidation on role change
- Self-demotion guard prevents admin from removing own ADMIN role
- Admin panel, user management, deny list: ADMIN only via requireRole
- Template adapter, executive report: MANAGER+ via requireRole
- Audit log filtering: session.role === 'ADMIN' for admin visibility
- Profile route: select role instead of isAdmin
- Zero isAdmin/requireAdmin references in backend routes
- TypeScript compiles cleanly (npx tsc --noEmit)

## Files Modified
- backend/src/routes/auth.ts — session.role, select role
- backend/src/routes/users.ts — requireRole, Zod role enum, invalidateUserSessions
- backend/src/routes/admin.ts — requireRole('ADMIN')
- backend/src/routes/denyList.ts — requireRole('ADMIN')
- backend/src/routes/audit.ts — requireRole('ADMIN'), session.role check
- backend/src/routes/templateAdapter.ts — requireRole('MANAGER')
- backend/src/routes/executiveReport.ts — requireRole('MANAGER')
- backend/src/routes/profile.ts — select role instead of isAdmin
