# Template AI Engine Roadmap

Layer8 automates template adaptation and executive report generation for offensive security teams. The roadmap progresses through security-first infrastructure, LLM and document processing capabilities, then delivers the two main features with progressive enhancement.

## Phases

- [x] Phase 1: Foundation, Security & Web UI Design
- [x] Phase 1.1: UI/UX Visual Polish (INSERTED)
- [x] Phase 2: Sanitization Infrastructure
- [x] Phase 2.1: Profile Page Completion (INSERTED)
- [x] Phase 3: LLM Integration
- [x] Phase 4: Document Processing
- [x] Phase 5: Template Adapter - Core
- [x] Phase 5.1: Analysis Preview & Mapping Memory (INSERTED)
- [x] Phase 5.2: Interactive PDF Mapping (INSERTED)
- [x] Phase 5.3: Placeholder Verification & Correction (INSERTED)
- [x] Phase 5.4: Intelligent Knowledge Base (INSERTED)
- [x] Phase 5.5: LLM-Powered Placeholder Regeneration (INSERTED)
- [x] Phase 5.6: Prescriptive Knowledge Base (INSERTED)
- [x] Phase 6: Executive Report Generator
- [x] Phase 6.1: Executive Report HTML Overhaul (INSERTED)
- [x] Phase 7: UI Polish (INSERTED)
- [x] Phase 8: Role-Based Access Control (INSERTED)
- [x] Phase 9: Team Schedule & Allocation
- [x] Phase 10: Schedule Visual Polish
- [x] Phase 11: UI Cleanup & Role Simplification
- [x] Phase 12: Clients & Project Tags
- [x] Phase 13: Dashboard Redesign
- [x] Phase 14: Security Hardening
- [x] Phase 15: Production Deployment Script
- [x] Phase 16: Auth Light Mode Text Visibility Fix
- [x] Phase 17: Security & Bug Fixes
- [x] Phase 18: Schedule Multi-Select & Bulk Operations
- [x] Phase 19: Real-Time Sync & Mobile Fix
- [x] Phase 20: Schedule HTML Export
- [x] Phase 21: Project Board — Data Model & API
- [ ] Phase 22: Project Board — Kanban UI
- [x] Phase 23: Project Board — Files, Notes & Comments
- [x] Phase 24: Project Board — Schedule Integration & Navigation

> **Note on completion criteria:** Phases 15–20 were verified informally by the project owner (no formal VBW UAT or QA artifacts were produced for those phases). Phase 21 is closed by `21-UAT.md` (status: complete). Phase 22 is closed by the QA remediation chain (`R01-VERIFICATION.md` PASS) plus UAT remediation chain (`R01-UAT.md` complete).

### Phase 1: Foundation, Security & Web UI Design
**Goal:** Secure infrastructure for authentication, session isolation, compliance-grade audit logging, and fully designed frontend
**Deps:** None
**Reqs:** AUTH-01-06, SECR-01-04, SECR-06, UIUX-01-04
**Success:** Auth + MFA working, audit trail tamper-evident, frontend scaffold complete
**Plans:** 6/6 complete

### Phase 1.1: UI/UX Visual Polish (INSERTED)
**Goal:** Polished visual identity with deep-dark theme, cool blue accent, atmospheric login
**Deps:** Phase 1
**Reqs:** Visual polish (no formal requirement IDs)
**Success:** Professional dark theme, logo integration, Notion-like sidebar
**Plans:** 3/3 complete

### Phase 2: Sanitization Infrastructure
**Goal:** Production-grade PII sanitization with custom pentest recognizers and session-scoped mappings
**Deps:** Phase 1
**Reqs:** SECR-05
**Success:** Presidio + custom recognizers detect PII, mappings stored per-session, never sent to LLM
**Plans:** 8/8 complete

### Phase 2.1: Profile Page Completion (INSERTED)
**Goal:** User profile with avatar, display name, password change, TOTP regeneration
**Deps:** Phase 2
**Reqs:** Profile management (no formal requirement IDs)
**Success:** Profile page functional, header avatar integration
**Plans:** 2/2 complete

### Phase 3: LLM Integration
**Goal:** Multi-provider LLM client with SSE streaming, compliance-grade interaction logging, and streaming UI components
**Deps:** Phase 1 (audit logging)
**Reqs:** LLMI-01-05, SECR-03, UIUX-05-06
**Success:** CLIProxyAPI + Anthropic fallback, SSE streaming, streaming UI component, audit logging, error states, per-feature model config
**Plans:** 3/3 complete

### Phase 4: Document Processing
**Goal:** DOCX parsing, PDF generation, Ghostwriter integration, reusable document UI
**Deps:** Phase 1
**Reqs:** DOCP-01-05, GHST-01-03, UIUX-07-08
**Success:** Parse/generate DOCX, pixel-perfect PDF via Gotenberg, Ghostwriter GraphQL integration
**Plans:** 5/5 complete

### Phase 5: Template Adapter - Core
**Goal:** LLM-powered Jinja2 insertion with pixel-perfect preview, iterative feedback loop
**Deps:** Phase 3, Phase 4
**Reqs:** TMPL-01-11, UIUX-09-10
**Success:** Upload → analyze → preview → annotate → download workflow complete
**Plans:** 5/5 complete

### Phase 5.1: Analysis Preview & Mapping Memory (INSERTED)
**Goal:** Annotated document preview in Analysis step highlighting mapped vs missing placeholders, plus a persistent knowledge base that stores completed mappings as few-shot examples for future LLM analyses
**Deps:** Phase 5
**Reqs:** TMPL-01, TMPL-06, UIUX-09
**Success:** Annotated PDF preview shows green (mapped) / yellow (gap) highlights in Step 2; completed mappings persist in DB and inject as few-shot examples in future analyses, reducing repeated misses
**Plans:** 5/5 complete

### Phase 5.2: Interactive PDF Mapping (INSERTED)
**Goal:** Replace table-based mapping UI with a PDF-first, select-and-describe workflow
**Deps:** Phase 5.1
**Reqs:** TMPL-01, TMPL-06, UIUX-09, UIUX-10
**Success:** Users can select text on PDF + pick blank paragraphs from structure panel, batch-describe selections via chat, LLM maps all at once, PDF regenerates with green shading, KB stores mappings per template type for few-shot reuse
**Plans:** 5/5 complete

### Phase 5.3: Placeholder Verification & Correction (INSERTED)
**Goal:** Analysis step renders the PDF with visible Jinja placeholders, three correction modes via LLM chat
**Deps:** Phase 5.2
**Reqs:** TMPL-01, TMPL-06, UIUX-09, UIUX-10
**Success:** Analysis step shows PDF with raw Jinja placeholders, three selection-based correction modes work end-to-end, LLM processes corrections, regenerate produces corrected PDF
**Plans:** 5/5 complete

### Phase 5.4: Intelligent Knowledge Base (INSERTED)
**Goal:** Structural intelligence layer with zone patterns, blueprints, and confidence calibration
**Deps:** Phase 5.3
**Reqs:** TMPL-01, TMPL-06
**Success:** KB stores zone patterns, repetition rules, structural blueprints; auto-map accuracy 80%+ on familiar templates
**Plans:** 5/5 complete

### Phase 5.5: LLM-Powered Placeholder Regeneration (INSERTED)
**Goal:** Replace mechanical find-and-replace with LLM-based intelligent placeholder placement
**Deps:** Phase 5.4
**Reqs:** TMPL-01, TMPL-06
**Success:** LLM produces correctly-placed placeholders without document corruption; mapping table UI unchanged
**Plans:** 4/4 complete

### Phase 5.6: Prescriptive Knowledge Base (INSERTED)
**Goal:** Transform KB from advisory to deterministic mapping cache with LLM fallback
**Deps:** Phase 5.5
**Reqs:** TMPL-01, TMPL-06
**Success:** Re-uploading mapped document produces near-identical mappings with zero LLM calls for known sections
**Plans:** 5/5 complete

### Phase 6: Executive Report Generator
**Goal:** Sanitized executive report generation with complete workflow
**Deps:** Phase 2, Phase 3, Phase 4
**Reqs:** EXEC-01-13, DENY-01-04, LANG-01-03, UIUX-14-15
**Success:** Upload → sanitize → review → generate → desanitize → annotate → download
**Plans:** 4/4 complete

### Phase 6.1: Executive Report HTML Overhaul (INSERTED)
**Goal:** Replace DOCX-based report generation with HTML template rendering via Gotenberg
**Deps:** Phase 6
**Reqs:** EXEC-01-13
**Success:** HTML templates produce pixel-perfect PDF reports matching corporate branding
**Plans:** 5/5 complete

### Phase 7: UI Polish (INSERTED)
**Goal:** Complete the dashboard and minor visual details across the application
**Deps:** Phase 6
**Reqs:** Visual polish (no formal requirement IDs)
**Success:** Dashboard fully functional, minor visual inconsistencies resolved, polished user experience
**Plans:** 5/5 complete

### Phase 8: Role-Based Access Control (INSERTED)
**Goal:** Role-based permissions (ADMIN, MANAGER, PENTESTER) with route guards and UI enforcement
**Deps:** Phase 1
**Reqs:** AUTH-01-06
**Success:** Three roles with distinct permissions, admin user management panel, route-level RBAC middleware
**Plans:** 5/5 complete

### Phase 9: Team Schedule & Allocation
**Goal:** Build a team allocation dashboard that lets managers assign pentesters to projects on a weekly calendar, track availability (holidays, absences), and manage team composition — integrated natively with the app's existing UI patterns (React/shadcn/TanStack), Prisma data layer, and RBAC system
**Deps:** Phase 8 (RBAC for role-gated access)
**Reqs:** SCHED-01 through SCHED-12
**Success:**
- Weekly calendar grid with sticky headers/columns showing team × weeks for full year
- Per-day availability indicators (available/holiday/absence) rendered inline
- Click-to-edit assignments with project name, color, status (confirmed/needs-reqs/placeholder)
- Split-cell support (two projects in same week)
- Drag-and-drop to swap/move assignments between cells
- Ctrl+click copy/paste assignments across cells
- Lock assignments to prevent accidental changes
- Team management panel (add/remove/reorder members)
- Holiday configuration (Portuguese public holidays, extensible)
- Absence management (click day dots to toggle personal absences)
- Auto-OUT logic (week becomes OUT when all days unavailable)
- ADMIN/MANAGER can edit; PENTESTER read-only view
**Requirements:**
- SCHED-01: Multi-section calendar (quarterly views + all-year tab)
- SCHED-02: Sticky column/header scrollable grid
- SCHED-03: Weekly assignment cells with color-coded projects
- SCHED-04: Per-day availability dots (5 per week: Mon-Fri)
- SCHED-05: Edit modal with color palette and status cycling
- SCHED-06: Split cell support (two projects per week)
- SCHED-07: Drag-and-drop assignment swapping
- SCHED-08: Ctrl+click clipboard copy/paste
- SCHED-09: Lock/unlock assignments
- SCHED-10: Team management panel (add/remove/reorder)
- SCHED-11: Holiday and absence management
- SCHED-12: RBAC integration (ADMIN/MANAGER write, PENTESTER read-only)

### Phase 10: Schedule Visual Polish
**Goal:** Visual refinements and UX improvements to the schedule feature
**Deps:** Phase 9
**Success:** Polished schedule UI with improved interactions

### Phase 11: UI Cleanup & Role Simplification
**Goal:** Clean up unused UI elements and simplify role structure
**Deps:** Phase 10
**Success:** Streamlined UI with simplified roles

### Phase 12: Clients & Project Tags
**Goal:** Add client management and project tagging to schedule assignments
**Deps:** Phase 11
**Success:** Clients and tags integrated into schedule workflow

### Phase 13: Dashboard Redesign
**Goal:** Redesign the main dashboard for schedule-focused workflow
**Deps:** Phase 12
**Success:** Dashboard reflects active schedule data

### Phase 14: Security Hardening
**Goal:** Production security hardening with rate limiting, CSRF protection, session management, and security headers
**Deps:** Phase 8
**Reqs:** SECR-01-06
**Success:** OWASP-compliant security posture, rate limiting, CSRF tokens, security headers, feature gates

### Phase 15: Production Deployment Script
**Goal:** Create `launcher.sh` bash script with install/start/stop/update/status subcommands for deploying Layer8 on AWS EC2 Linux. Schedule-only deployment: Express backend (systemd), nginx (frontend + reverse proxy), Redis, SQLite. Must safely handle updates without destroying the database.
**Deps:** Phase 14
**Reqs:** DEPLOY-01 (install), DEPLOY-02 (start), DEPLOY-03 (stop), DEPLOY-04 (update)
**Success:**
- Single `launcher.sh` script with `install|start|stop|update|status` commands
- Install provisions EC2 with Node.js, Redis, nginx, certbot, Docker
- Express backend as systemd unit, nginx serves frontend SPA
- Let's Encrypt SSL with interactive domain setup
- Update does git pull + npm install + build + prisma db push (non-destructive) + restart
- SQLite database preserved across updates
- Admin user seeded with forced password reset

### Phase 16: Auth Light Mode Text Visibility Fix
**Goal:** Fix invisible text on MFA setup, MFA verification, and password change pages when the browser is in light mode — applying the same hardcoded light-text pattern already used on the login form
**Deps:** Phase 1
**Reqs:** UIUX (accessibility)
**Success:** All auth flows (TOTP setup, TOTP verification, password change) display readable text in both light and dark mode, including when rendered inside Profile page dialogs
**Files:** TOTPSetup.tsx, TOTPVerification.tsx, PasswordChange.tsx, Profile.tsx (dialog wrappers)

### Phase 17: Security & Bug Fixes
**Goal:** Fix 4 security/bug issues: hide rate limit response headers, block breached passwords, hide nginx version on 301s, fix TOTP regeneration so new secret persists correctly
**Deps:** Phase 14, Phase 15
**Reqs:** SECR-01-06
**Success:** Rate limit headers hidden, breached passwords rejected, nginx version not leaked, TOTP regeneration produces working codes at login
**Files:** backend/src/middleware/rateLimit.ts, backend/src/routes/auth.ts, deploy/nginx-layer8.conf, launcher.sh, frontend/src/components/auth/TOTPSetup.tsx

### Phase 18: Schedule Multi-Select & Bulk Operations
**Goal:** Add multi-cell selection to the schedule grid (Ctrl+Click individual cells, Click+Drag for range selection) with bulk paste (Ctrl+V pastes copied project onto all selected cells) and bulk delete (Delete/Backspace clears all selected cells). Visual feedback for selected state.
**Deps:** Phase 9, Phase 12
**Reqs:** UX enhancement
**Success:**
- Ctrl+Click toggles individual cell selection with visual highlight
- Click+Drag selects a rectangular range of cells
- Ctrl+V pastes clipboard assignment onto all selected cells (skipping locked cells)
- Delete/Backspace bulk-deletes all selected assignments (skipping locked cells)
- Selection clears after paste/delete operations
- PM role required for all mutation operations
**Files:** frontend/src/features/schedule/components/ScheduleGrid.tsx, frontend/src/features/schedule/components/ScheduleCell.tsx

### Phase 19: Real-Time Sync & Mobile Fix
**Goal:** Add WebSocket (Socket.IO) real-time sync so all users see schedule changes instantly when someone adds, deletes, or modifies assignments. Also fix schedule grid layout on mobile.
**Deps:** Phase 18
**Reqs:** UX enhancement, collaboration
**Success:**
- Socket.IO server integrated with Express backend, sharing session auth
- Frontend connects on schedule page, auto-reconnects on disconnect
- Assignment create/update/delete emits event to all connected clients
- Other users' React Query cache invalidates on WebSocket event (grid refreshes)
- Absence/holiday changes also broadcast
- Mobile schedule grid renders correctly (horizontal scroll, readable cells)
- PM delete permission works from grid (Ctrl+Click select + Delete key)
**Files:** backend/src/index.ts, backend/src/routes/schedule.ts, frontend/src/features/schedule/hooks.ts, frontend/src/features/schedule/components/ScheduleGrid.tsx

### Phase 20: Schedule HTML Export
**Goal:** Add an "Export HTML" button (PM/Admin only) to the schedule page that generates a self-contained HTML file matching the current grid view (year + quarter). The file opens locally in any browser as a visual backup of the schedule — colored cells, project names, team members, absences, holidays.
**Deps:** Phase 9, Phase 18
**Reqs:** Data backup, offline viewing
**Success:**
- Backend endpoint `GET /api/schedule/export/html` restricted to PM/ADMIN roles
- Accepts year and quarter params matching the current view
- Generates self-contained HTML (inline CSS, no external deps) replicating the schedule grid
- Includes team member names, project assignments with colors, tags, status badges
- Shows absence (OUT) cells and holiday dots
- Frontend "Export" button in schedule toolbar, visible only to PM/Admin
- Clicking downloads the HTML file with filename like `schedule-2026-Q2.html`
**Files:** backend/src/routes/schedule.ts, frontend/src/routes/Schedule.tsx, backend/src/services/scheduleExportService.ts (new)

### Phase 21: Project Board — Data Model & API
**Goal:** Create the database schema and REST API for project board cards. A board card represents a pentest project with its lifecycle stage, checklist, and metadata. Cards link to schedule assignments via project+client+dates.
**Deps:** Phase 9 (Schedule)
**Reqs:** Data persistence, CRUD API
**Success:**
- Prisma schema: BoardCard model with fields for stage (upcoming/preparation/execution/closing/done/archived), checklist items (JSON), notes, linked assignment references, timestamps
- BoardCardComment model for threaded comments
- BoardCardFile model for file attachment metadata
- CRUD endpoints: GET /api/board/cards (with filters), POST, PUT, DELETE
- Stage transition endpoint: PUT /api/board/cards/:id/stage
- Checklist toggle endpoint: PUT /api/board/cards/:id/checklist/:index
- Role-based access: all roles can read, PM+ can create/edit, Admin can archive
- Default checklist template: Kickoff, Requirements, Pentest, Report, Review, Delivery

### Phase 22: Project Board — Kanban UI
**Goal:** Build the Kanban board page with drag-and-drop columns (Upcoming, Preparation, Execution, Closing, Done). Cards show project name, client, assigned pentester, dates, checklist progress, and status badge. Role-based filtering and column interactions.
**Deps:** Phase 21
**Reqs:** Kanban UI, drag-and-drop, filtering
**Success:**
- New "Board" page in sidebar, accessible to all roles
- 5 columns: Upcoming, Preparation, Execution, Closing, Done
- Drag-and-drop cards between columns (PM/pentester can move cards)
- Card shows: project name, client, tags, assigned pentester(s), dates, checklist progress (e.g. "3/6"), status badge
- Auto-move: cards move to Preparation 1 week before start, to Execution when week arrives
- Done column cards visible until Admin archives them
- Filter: "My Projects" / "All Projects" toggle, plus client and pentester filters
- "Show Archived" toggle for Admins

### Phase 23: Project Board — Files, Notes & Comments
**Goal:** Add file attachments, notes, and threaded comments to project cards. Files stored server-side with upload/download. Admin archive action deletes files to save storage. Notes field for free-text instructions. Comments for PM-pentester communication.
**Deps:** Phase 21, Phase 22
**Reqs:** File management, team communication
**Success:**
- File upload/download on project cards (scope docs, credentials, VPN configs)
- Files stored in server uploads directory, linked to board card
- Notes field (rich text or markdown) for special instructions
- Threaded comments on cards (PM and pentester can communicate in context)
- Admin archive action: hides card from board, permanently deletes attached files, preserves metadata/checklist/comments

### Phase 24: Project Board — Schedule Integration & Navigation
**Goal:** Connect the Board to the Schedule and Dashboard with seamless navigation. PMs see a "View on Board" button in the assignment edit modal. Pentesters click schedule cells to go directly to the project card. Dashboard Current/Next Project cards link to the Board. Auto-creation of board cards when assignments are created on the schedule. Date sync between schedule and board.
**Deps:** Phase 21, Phase 22, Phase 23
**Reqs:** Schedule-Board integration, navigation, auto-sync
**Success:**
- Assignment edit modal shows "View on Board" link when a board card exists
- Pentester click on schedule cell redirects to the project card on the Board
- Dashboard project cards link to the Board card
- Creating a schedule assignment auto-creates a Board card (or links to existing one for same project+client)
- Changing schedule dates updates the Board card dates
- Board default filter: "My Projects" for pentesters, "All Projects" for PMs/Admins

## Progress

| Phase | Done | Status | Date |
|-------|------|--------|------|
| 1 - Foundation | 6/6 | Complete | 2026-02-11 |
| 1.1 - UI Polish | 3/3 | Complete | 2026-02-11 |
| 2 - Sanitization | 8/8 | Complete | 2026-02-12 |
| 2.1 - Profile | 2/2 | Complete | 2026-02-11 |
| 3 - LLM Integration | 3/3 | Complete | 2026-02-12 |
| 4 - Document Processing | 3/3 | complete | 2026-03-26 |
| 5 - Template Adapter Core | 3/3 | complete | 2026-03-27 |
| 5.1 - Analysis Preview & Memory | 5/5 | Complete | 2026-02-13 |
| 5.2 - Interactive PDF Mapping | 5/5 | Complete | 2026-02-14 |
| 5.3 - Placeholder Verification | 5/5 | Complete | 2026-02-14 |
| 5.4 - Intelligent KB | 5/5 | Complete | 2026-02-14 |
| 5.5 - LLM Placeholder Regen | 4/4 | Complete | 2026-02-15 |
| 5.6 - Prescriptive KB | 5/5 | Complete | 2026-02-15 |
| 6 - Executive Report | 2/2 | complete | 2026-03-31 |
| 6.1 - Executive Report HTML | 5/5 | Complete | 2026-02-16 |
| 7 - UI Polish | 3/3 | complete | 2026-04-01 |
| 8 - Role-Based Access Control | 0/4 | planned | - |
| 9 - Team Schedule | 7/7 | complete | 2026-05-07 |
| 10 - Schedule Visual Polish | 5/5 | complete | 2026-05-07 |
| 11 - UI Cleanup & Role Simplification | Done | Complete | 2026-03-20 |
| 12 - Clients & Project Tags | Done | Complete | 2026-03-20 |
| 13 - Dashboard Redesign | Done | Complete | 2026-03-20 |
| 14 - Security Hardening | Done | Complete | 2026-03-20 |
| 15 - Production Deploy Script | 2/2 | complete | 2026-03-20 |
| 16 - Auth Light Mode Fix | 3/3 | complete | 2026-03-24 |
| 17 - Security | 4/4 | complete | 2026-03-24 |
| 18 - Schedule Multi-Select | 3/3 | Complete | 2026-03-26 |
| 19 - Real-Time Sync & Mobile Fix | Done | Complete | 2026-03-30 |
| 20 - Schedule HTML Export | 2/2 | Complete | 2026-03-31 |
| 21 - Board: Data Model & API | 0/0 | Pending | - |
| 22 - Board: Kanban UI | 1/1 | needs verification | - |
| 23 - Board: Files, Notes & Comments | 0/0 | Pending | - |
| 24 - Board: Schedule Integration | 0/0 | Pending | - |
