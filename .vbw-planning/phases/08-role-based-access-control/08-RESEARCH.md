# Phase 8: Role-Based Access Control — Research

## Findings

### Current Database Schema (Prisma)
- **User model** (`backend/prisma/schema.prisma:12-32`):
  - `isAdmin: Boolean @default(false)` — single Boolean field, no role hierarchy
  - No other role-related fields; auth is binary (admin or not)
  - User also has: `isActive`, `mustResetPassword`, TOTP fields, account lock fields, audit trail linkage

### Session Management
- **Session augmentation** (`backend/src/types/express.d.ts:3-16`):
  - SessionData includes: `userId`, `username`, **`isAdmin: boolean`**, `totpVerified`, auth flow states
  - Sessions stored in **Redis** (configured in `index.ts:72-84`)
  - Session cookie: 30-day maxAge, httpOnly, secure in production, sameSite=lax
  - Session activity tracking: `lastActivity` and `ipAddress` updated on each request

### Auth Middleware (Two Functions)
- **`requireAuth`** (`backend/src/middleware/auth.ts:7-24`):
  - Checks `req.session.userId` exists
  - Enforces `totpVerified: true`
  - Generic 401 error; no role checks

- **`requireAdmin`** (`backend/src/middleware/auth.ts:30-42`):
  - Checks userId + totpVerified + `req.session.isAdmin === true`
  - Returns 403 Forbidden if not admin

### API Endpoints by Protection Level

**Admin-only (`requireAdmin`):**
1. `/api/users/*` — User CRUD (create, read, update, delete, password/TOTP reset)
2. `/api/admin/*` — Sessions, LLM settings, CLIProxyAPI control, Gotenberg status
3. `/api/deny-list/*` — Deny list CRUD (POST, PUT, DELETE)
   - Exception: `GET /api/deny-list/active` requires `requireAuth` only

**Auth-only (`requireAuth`):**
- `/api/auth/*`, `/api/profile/*`, `/api/audit/*`, `/api/deny-list/active`
- `/api/llm/*`, `/api/documents/*`, `/api/adapter/*`, `/api/report/*`
- `/api/sanitize/*`, `/api/desanitize/*`, `/api/ghostwriter/*`

### Frontend Auth
- **`useAuth()`** returns `isAdmin: query.data?.isAdmin ?? false`
- **Sidebar** filters by `adminOnly` flag on nav groups
- **Admin page** uses component-level `useEffect` redirect, not router-level guard
- **ProtectedRoute** only checks authentication, not roles

### User Creation & Seed
- `POST /api/users` accepts `isAdmin: z.boolean().optional().default(false)`
- Seed creates `admin` user with `isAdmin: true`, `mustResetPassword: true`

## Relevant Patterns
1. Middleware-based protection: entire route modules gated with one middleware call
2. Session augmentation: auth data stored in Redis session, not JWT
3. Component-level frontend guards with early return pattern
4. Sidebar filtering is cosmetic; backend enforces actual access
5. TanStack Query for auth state with 5-min stale time
6. TOTP enforced in `requireAuth` as baseline for all authenticated actions

## Risks
1. **Session compatibility**: Existing Redis sessions have `isAdmin: boolean`. Old sessions will fail role checks
2. **API response breaking change**: Frontend hardcodes `isAdmin` property access throughout
3. **Database migration**: Boolean → Enum type change requires custom SQL migration
4. **Fail-closed for undefined role**: Old sessions with no `role` field must be denied, not allowed
5. **Audit log filtering**: Currently admin sees all, non-admin sees own. Need intermediate role visibility rules

## Recommendations
1. Prisma enum `Role { NORMAL PM MANAGER ADMIN }` replaces `isAdmin: Boolean`
2. Custom migration: `isAdmin=true → ADMIN`, `isAdmin=false → NORMAL`, drop column
3. Parameterized `requireRole(minimumRole)` middleware with hierarchy map (NORMAL=1, PM=2, MANAGER=3, ADMIN=4)
4. Session stores `role: string` instead of `isAdmin: boolean`
5. Force session invalidation on deploy (or add normalization middleware for old sessions)
6. Frontend: `useAuth()` returns `role` and `hasRole(min)` utility, drop `isAdmin`
7. Sidebar: `minRole` replaces `adminOnly` on NavGroup interface
8. Router-level `RoleRoute` guard component wraps restricted routes
9. Seed script updated to `role: 'ADMIN'`
10. Test matrix: each role × each endpoint (positive + negative)
