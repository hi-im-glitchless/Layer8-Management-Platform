# Phase 9 Research: Team Schedule & Allocation

## Findings

### Frontend Architecture Patterns

**File Organization:**
- Feature modules live in `frontend/src/features/{domain}/` with three standard files:
  - `api.ts` — API client functions (typesafe wrappers around `apiClient`/`apiUpload`)
  - `hooks.ts` — TanStack Query mutations + queries wrapping API calls
  - `types.ts` — TypeScript interfaces for API responses/requests
  - `components/` — Feature-specific UI components (optional)
- Page routes in `frontend/src/routes/{PageName}.tsx` compose feature hooks and layout components
- Reusable UI components in `frontend/src/components/ui/` (shadcn/ui)
- Shared hooks/utils in `frontend/src/lib/`

**Navigation:**
- Sidebar nav configured in `Sidebar.tsx` as array of `NavGroup[]` with `minRole` RBAC gates
- Routes registered in `App.tsx` with `ProtectedRoute` / `RoleProtectedRoute` wrappers
- New "Schedule" entry goes in `navigationGroups` array in `Sidebar.tsx` + `/schedule` route in `App.tsx`

**API Client Pattern:**
- `lib/api.ts` exports `apiClient<T>()` for JSON endpoints
- Handles CSRF token injection automatically (double-submit cookie)
- Feature-specific `api.ts` wraps `apiClient` with typed request/response schemas

**State Management:**
- TanStack Query for server state (queries + mutations)
- No manual fetch calls — all go through TanStack Query
- `useQuery` for GET, `useMutation` for POST/PUT/DELETE
- Query invalidation on success to trigger refetches
- Sonner toast notifications for errors

**Forms & Modals:**
- React Hook Form + Zod resolvers for validation
- shadcn/ui Dialog component for modals
- Tables from `ui/table.tsx`

### Backend Architecture Patterns

**Route Organization:**
- Express Router per domain: `backend/src/routes/{domain}.ts`
- Route handlers thin and delegated to services
- All routes register in `index.ts` as `app.use('/api/{domain}', routerImport)`

**Middleware Chain:**
- Session middleware → CSRF protection → Rate limiting → Route-specific middleware
- `requireRole('ROLE')` middleware for RBAC gates
- `auditMiddleware(action)` wraps mutations with audit logging

**Service Layer:**
- Services in `backend/src/services/{domain}.ts`
- Handle all business logic, DB queries, external API calls
- Services import Prisma client and return data

**Validation:**
- Zod schemas at route entry point
- Parse request body/params, respond 400 on validation failure

**Database (Prisma):**
- Models in `prisma/schema.prisma`
- User model has roles: NORMAL, PM, MANAGER, ADMIN
- Custom models follow PascalCase naming
- Migrations auto-run on startup

## Relevant Patterns

1. **Feature Module Template** → Create `frontend/src/features/schedule/` with `api.ts`, `hooks.ts`, `types.ts`, `components/`
2. **Backend Route Template** → Create `backend/src/routes/schedule.ts` with `requireRole('MANAGER')` guard + audit middleware
3. **Service Layer** → Create `backend/src/services/schedule.ts` for DB queries + business logic
4. **Prisma Models** → Extend `schema.prisma` with Schedule, SchedulePerson, ScheduleAssignment, Holiday, Absence models
5. **Navigation** → Add to `navigationGroups` in `Sidebar.tsx`, register route in `App.tsx`
6. **API Flow** → Feature hooks → apiClient → Express routes → Services → Prisma → Response

## Risks

1. **No drag-and-drop library installed** — Will need @dnd-kit (modern, maintained). react-beautiful-dnd is unmaintained.
2. **Complex grid UX** — Large team allocations need efficient rendering. Consider virtualization if > 100 rows.
3. **Holiday/date handling** — date-fns already in codebase for date utilities.
4. **Concurrency** — Multiple users editing same schedule simultaneously could cause conflicts. Consider optimistic updates.
5. **RBAC complexity** — ADMIN/MANAGER can edit, PENTESTER/NORMAL read-only.

## Recommendations

1. **Define Prisma models early** — Schedule, SchedulePerson, ScheduleAssignment, Holiday, Absence
2. **Start with read-only grid** — Build table UI first, then add mutations/modals
3. **Use @dnd-kit** — Modern, maintained, tree-shakeable, works well with complex grids
4. **Follow existing patterns** — Copy Sidebar nav, RoleProtectedRoute, auditMiddleware from Admin/Users features
5. **Store dates as ISO strings** — Consistent with existing patterns, use date-fns for formatting
6. **Build native UI** — Use shadcn/ui components (Dialog, Tabs, Table, Button) rather than copying HTML/CSS from reference

## Reference Functionality (from Alocação/ study)

Key features to reproduce using native app patterns:
- Multi-section yearly calendar (quarterly views + all tab)
- Sticky table headers/columns for large grid scrolling
- Per-day availability dots (5 colored indicators per week: Mon-Fri)
- Click-to-edit assignments with color palette and status cycling
- Split-cell support (two projects in same week)
- Drag-and-drop assignment swapping
- Ctrl+click clipboard copy/paste
- Lock/unlock assignments
- Team management panel (add/remove/reorder members)
- Holiday configuration (Portuguese public holidays)
- Absence management (toggle personal absences via day dots)
- Auto-OUT logic (all days unavailable → auto-mark OUT)
