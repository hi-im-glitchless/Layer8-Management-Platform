# Template AI Engine — Project Board Milestone Roadmap

This milestone delivers the **Project Board** ("Planner"): a Kanban board for
pentest projects with files/notes/comments and full schedule integration. It
comprises phases 22–24 (phase 21, the board data model & API, shipped earlier as
prior work — see the appendix). Phases 1–21 are earlier completed project work
and are not part of this milestone's archive (preserved in git history and the
appendix below).

## Phases

- [x] Phase 22: Project Board — Kanban UI
- [x] Phase 23: Project Board — Files, Notes & Comments
- [x] Phase 24: Project Board — Schedule Integration & Navigation

## Phase Details

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
| 22 - Board: Kanban UI | 1/1 | Complete | 2026-06-01 |
| 23 - Board: Files, Notes & Comments | 3/3 | Complete | 2026-06-03 |
| 24 - Board: Schedule Integration | 2/2 | Complete | 2026-06-03 |

## Prior Work (pre-milestone, not part of this archive)

Phases 1–21 are earlier completed project work that predates this milestone's
VBW tracking. Their phase directories were cleaned during development (phases
01–03 live in `.vbw-planning/gsd-archive/` from a GSD→VBW migration). They are
preserved in git history and listed here for context only — they are NOT part of
this milestone and intentionally have no phase directories. Phases 15–20 were
verified informally by the project owner; phase 21 (Project Board — Data Model &
API) is closed by its `21-UAT.md` (completed earlier).

Prior phases (completed): 1 Foundation, Security & Web UI Design · 1.1 UI/UX
Visual Polish · 2 Sanitization Infrastructure · 2.1 Profile Page Completion ·
3 LLM Integration · 4 Document Processing · 5 Template Adapter Core ·
5.1–5.6 Mapping/KB/Regeneration suite · 6 Executive Report Generator ·
6.1 Executive Report HTML Overhaul · 7 UI Polish · 8 Role-Based Access Control ·
9 Team Schedule & Allocation · 10 Schedule Visual Polish · 11 UI Cleanup & Role
Simplification · 12 Clients & Project Tags · 13 Dashboard Redesign · 14 Security
Hardening · 15 Production Deployment Script · 16 Auth Light Mode Fix ·
17 Security & Bug Fixes · 18 Schedule Multi-Select · 19 Real-Time Sync & Mobile
Fix · 20 Schedule HTML Export · 21 Project Board — Data Model & API.
