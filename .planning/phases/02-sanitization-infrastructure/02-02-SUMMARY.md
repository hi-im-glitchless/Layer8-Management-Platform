---
phase: 02-sanitization-infrastructure
plan: 02
subsystem: backend-deny-list
tags: [backend, api, database, crud, security]
dependency_graph:
  requires:
    - prisma-schema
    - express-app
    - auth-middleware
    - audit-service
  provides:
    - deny-list-api
    - deny-list-service
    - DenyListTerm-model
  affects:
    - sanitization-pipeline
tech_stack:
  added:
    - DenyListTerm Prisma model (SQLite)
    - Deny list CRUD service
    - Deny list REST API
  patterns:
    - Admin-only CRUD endpoints
    - Authenticated user access for active terms
    - Zod validation
    - Audit logging for mutations
key_files:
  created:
    - backend/src/services/denyList.ts
    - backend/src/routes/denyList.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/index.ts
decisions:
  - slug: deny-list-hot-path
    summary: "getAllActiveTerms() returns string[] for efficient sanitization pipeline integration"
    rationale: "Sanitization service needs term strings only, not full records. Minimize data transfer and parsing overhead on hot path."
  - slug: admin-only-management
    summary: "Deny list CRUD requires admin role, active terms accessible to any authenticated user"
    rationale: "Global deny list is security-critical infrastructure. Only admins should modify it. But sanitization needs read access for all users."
  - slug: bulk-create-skip-duplicates
    summary: "Bulk create operation skips existing terms instead of failing"
    rationale: "Improves UX for importing large term lists. Admin can upload a CSV without needing to check for duplicates first."
metrics:
  duration: 2m 39s
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  commits: 2
  completed_date: 2026-02-11
---

# Phase 02 Plan 02: Global Deny List Infrastructure Summary

**One-liner:** Admin-managed global deny list with CRUD API for persistent term storage and efficient term lookup

## What Was Built

### Database Layer
- **DenyListTerm model** in Prisma schema with:
  - Unique term constraint (prevents duplicates)
  - isActive flag for soft deactivation
  - createdBy foreign key to User (nullable, SET NULL on delete)
  - Indexed isActive field for query performance
  - Timestamps (createdAt, updatedAt)
- Reverse relation added to User model (denyListTerms array)
- Schema pushed to SQLite database

### Service Layer (`backend/src/services/denyList.ts`)
Implemented 6 service functions:
1. **getAllActiveTerms()** - Hot path function returning `string[]` of active terms only
2. **listTerms()** - Full term details with creator username for admin UI
3. **createTerm()** - Create with duplicate detection and trimming
4. **updateTerm()** - Update with conflict checking for renamed terms
5. **deleteTerm()** - Hard delete (returns boolean)
6. **bulkCreateTerms()** - Batch creation with skip-duplicates strategy

### API Layer (`backend/src/routes/denyList.ts`)
Created 6 REST endpoints:
- `GET /api/deny-list/active` - Get active terms (any authenticated user)
- `GET /api/deny-list` - List all terms with optional includeInactive query param (admin)
- `POST /api/deny-list` - Create term with zod validation (admin)
- `PUT /api/deny-list/:id` - Update term (admin)
- `DELETE /api/deny-list/:id` - Delete term, returns 204 (admin)
- `POST /api/deny-list/bulk` - Bulk create (max 100 terms), returns created/skipped counts (admin)

### Integration
- Mounted router at `/api/deny-list` in Express app (after admin routes)
- Added audit logging for create, update, delete, bulk_create actions
- Zod schemas enforce:
  - Term: 1-200 characters, required
  - Description: optional string
  - Bulk: max 100 terms per request

## Verification Results

All success criteria met:

- [x] Prisma schema has DenyListTerm model with unique term constraint
- [x] Deny list service provides getAllActiveTerms() returning string[]
- [x] REST API at /api/deny-list with full CRUD + bulk create
- [x] Admin-only access enforced on management endpoints
- [x] Audit logging on create/update/delete operations

**Tested:**
- Schema pushed to database successfully
- DenyListTerm table exists with correct indexes
- Server starts without errors
- `/api/deny-list/active` endpoint mounted and rejects unauthenticated requests (401)
- Health check confirms server responsive

## Deviations from Plan

None - plan executed exactly as written.

## Task Breakdown

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add DenyListTerm model and service | 47dffe7 | schema.prisma, denyList.ts (new) |
| 2 | Create REST API routes and mount | a676bdc | denyList.ts (routes, new), index.ts |

## Integration Points

### Upstream Dependencies
- Prisma ORM and schema infrastructure (Phase 01)
- Express app and routing (Phase 01)
- Auth middleware (requireAuth, requireAdmin) (Phase 01)
- Audit service (Phase 01)

### Downstream Consumers
- **Phase 02-03** (Sanitization service proxy) will call GET /api/deny-list/active
- **Phase 02-04** (Python sanitization engine) will receive deny list terms as request payload
- **Phase 08** (Sanitization UI) will build admin interface to manage deny list

### API Contract
```typescript
// GET /api/deny-list/active
{ terms: string[] }

// GET /api/deny-list?includeInactive=true
{ terms: Array<{
  id: string,
  term: string,
  description: string | null,
  createdBy: string | null,
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date,
  creatorUsername: string | null
}> }

// POST /api/deny-list
Request: { term: string, description?: string }
Response: 201 { term: DenyListTerm }

// PUT /api/deny-list/:id
Request: { term?: string, description?: string, isActive?: boolean }
Response: { term: DenyListTerm }

// DELETE /api/deny-list/:id
Response: 204 No Content

// POST /api/deny-list/bulk
Request: { terms: Array<{ term: string, description?: string }> }
Response: { created: number, skipped: number }
```

## Technical Notes

### Performance Considerations
- `getAllActiveTerms()` is the hot path (called on every sanitize request)
- Query optimized with `select: { term: true }` (no joins, minimal fields)
- `isActive` field indexed for fast filtering
- Consider caching strategy if deny list grows large (>10k terms)

### Security Considerations
- All mutation endpoints (POST/PUT/DELETE) require admin role
- Active terms endpoint requires authentication (not admin) - any user needs deny list during sanitization
- Audit trail captures all mutations with user ID and IP
- Unique constraint prevents duplicate terms
- Zod validation prevents injection via term/description fields

### Error Handling
- Duplicate term returns 409 Conflict with descriptive message
- Invalid input returns 400 with zod validation errors
- Missing term on update/delete returns 404
- Bulk create gracefully skips duplicates and returns counts

## Next Steps

**Immediate (Phase 02-03):**
- Build Node.js proxy endpoint that fetches active deny list and forwards sanitization requests to Python service

**Phase 02-04:**
- Implement Python sanitization service that receives deny list terms in request payload
- Apply deny list matching BEFORE Presidio NER analysis (per user decision)

**Phase 08:**
- Build admin UI for deny list management (table view, create/edit forms, bulk import)
- Add CSV import for bulk term creation

## Self-Check: PASSED

**Created files exist:**
- FOUND: backend/src/services/denyList.ts
- FOUND: backend/src/routes/denyList.ts

**Modified files exist:**
- FOUND: backend/prisma/schema.prisma
- FOUND: backend/src/index.ts

**Commits exist:**
- FOUND: 47dffe7 (Task 1)
- FOUND: a676bdc (Task 2)

**Database verification:**
```sql
CREATE TABLE IF NOT EXISTS "DenyListTerm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DenyListTerm_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "DenyListTerm_isActive_idx" ON "DenyListTerm"("isActive");
CREATE UNIQUE INDEX "DenyListTerm_term_key" ON "DenyListTerm"("term");
```

All artifacts verified.
