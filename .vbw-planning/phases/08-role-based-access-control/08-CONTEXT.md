# Phase 8: Role-Based Access Control — Context

Gathered: 2026-02-18
Calibration: architect

## Phase Boundary
Replace binary `isAdmin: Boolean` with a 4-tier hierarchical role system (NORMAL, PM, MANAGER, ADMIN) enforced across database, backend middleware, API responses, frontend route guards, and sidebar visibility.

## Decisions

### Role Hierarchy
- Hierarchical model: NORMAL (1) < PM (2) < MANAGER (3) < ADMIN (4)
- `requireRole('PM')` allows PM, Manager, and Admin through; blocks Normal
- `requireRole('MANAGER')` allows Manager and Admin; blocks Normal and PM
- Single `requireRole(minimumRole)` check per route — no explicit role lists needed

### Session Invalidation on Role Change
- When an admin changes a user's role, immediately delete all active sessions for that user from Redis
- User's next request gets 401, forcing re-login with a fresh session containing the new role
- No stale role data in session store — strongest security posture

### API Contract Change
- Clean break: drop `isAdmin: boolean` from all API responses
- Replace with `role: 'NORMAL' | 'PM' | 'MANAGER' | 'ADMIN'`
- `GET /api/auth/me` returns `{ role: string }` instead of `{ isAdmin: boolean }`
- Frontend `useAuth()` hook updated: `user.role` replaces `user.isAdmin`
- Provide `hasRole(user, minimumRole)` utility for hierarchy checks
- Breaking change is safe — internal API only, no external consumers

### Access Matrix (confirmed)
| Feature | Normal | PM | Manager | Admin |
|---------|--------|----|---------|-------|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Schedule (view) | ✓ | ✓ | ✓ | ✓ |
| Schedule (edit) | | ✓ | ✓ | ✓ |
| Template Adapter | | | ✓ | ✓ |
| Executive Report | | | ✓ | ✓ |
| Audit Log (own) | ✓ | ✓ | ✓ | ✓ |
| Audit Log (all) | | | | ✓ |
| Profile | ✓ | ✓ | ✓ | ✓ |
| Admin Panel | | | | ✓ |

### Manager Scope
- Managers have the same schedule edit rights as PMs
- Managers additionally access Template Adapter and Executive Report
- Managers do NOT manage other users' roles — only Admins can change roles
- No Manager-specific role management UI needed

### Migration Path
- Prisma migration: add `role` enum field (NORMAL, PM, MANAGER, ADMIN), default NORMAL
- Data migration: existing `isAdmin: true` users → ADMIN, others → NORMAL
- Drop `isAdmin` column after migration
- Seed script updated to create default admin with `role: ADMIN`

### Open (Claude's discretion)
- Prisma enum name and column details
- Frontend route guard component design (router-level `<RoleRoute>` vs component-level)
- Admin panel user management UI updates for role dropdown
- Specific middleware function signature and error response format

## Deferred Ideas
None
