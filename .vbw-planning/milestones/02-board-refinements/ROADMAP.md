# Template AI Engine (Layer8) Roadmap

**Goal:** Template AI Engine (Layer8)

**Scope:** 11 phases

## Progress
| Phase | Status | Plans | Tasks | Commits |
|-------|--------|-------|-------|---------|
| 01 | ● Done |
| 02 | ● Done |
| 03 | ● Done |
| 04 | ● Done |
| 05 | ● Done |
| 06 | ● Done |
| 07 | ● Done |
| 08 | ● Done |
| 09 | ● Done |
| 10 | ● Done |
| 11 | ● Done |

---

## Phase List
- [x] [Phase 1: Board: Stopped Column & Horizontal Drag Auto-Scroll](#phase-1-board-stopped-column-horizontal-drag-auto-scroll)
- [x] [Phase 2: Archive Without Typed Project-Name Confirmation](#phase-2-archive-without-typed-project-name-confirmation)
- [x] [Phase 3: File Download Permission Fix](#phase-3-file-download-permission-fix)
- [x] [Phase 4: Board Card Pentester Avatars](#phase-4-board-card-pentester-avatars)
- [x] [Phase 5: Board Bug Fixes — Status Sync & Card Modal Overlap](#phase-5-board-bug-fixes--status-sync--card-modal-overlap)
- [x] [Phase 6: Auth Rate Limiter Dev Override (MFA enrollment 429)](#phase-6-auth-rate-limiter-dev-override-mfa-enrollment-429)
- [x] [Phase 7: Planner Card Avatars — Initials & Account Colour](#phase-7-planner-card-avatars--initials--account-colour)
- [x] [Phase 8: Planner Avatar Name Precedence — full account name for initials](#phase-8-planner-avatar-name-precedence--full-account-name-for-initials)
- [x] [Phase 9: Planner Orphaned Card on Last-Pentester Schedule Delete](#phase-9-planner-orphaned-card-on-last-pentester-schedule-delete)
- [x] [Phase 10: Planner Card Client Name — Bold & Client Colour](#phase-10-planner-card-client-name--bold--client-colour)
- [x] [Phase 11: PM Role Can View & Open Archived Cards](#phase-11-pm-role-can-view--open-archived-cards)

---

## Phase 1: Board: Stopped Column & Horizontal Drag Auto-Scroll

**Goal:** Add a new 'Stopped' stage/column to the Kanban board, and make the board auto-scroll horizontally while a card is dragged near the left/right edge so off-screen columns are reachable. Grouped because both touch the board's stage list and drag surface (Board.tsx, KanbanColumn, stage types + backend stage enum/validation).

**Requirements:** Board stages, Drag-and-drop UX

**Success Criteria:**
- A 'Stopped' column renders on the board alongside the existing stages, with header label and count pill
- Cards can be moved into and out of 'Stopped'; the backend accepts and persists the new stage; the stage is a valid value everywhere stages are validated
- Auto-move logic does not override a card the user has manually placed in 'Stopped'
- Dragging a card near the board's left/right edge auto-scrolls the board horizontally so off-screen columns become reachable; normal (non-drag) horizontal scroll still works
- Schedule isolation preserved: no writes to Assignment/TeamMember/Absence/Holiday

**Dependencies:** None

---

## Phase 2: Archive Without Typed Project-Name Confirmation

**Goal:** Remove the type-the-exact-project-name requirement from the admin archive flow. Keep a lightweight confirm (archive is destructive — deletes files), but drop the typed-name gate end to end (UI dialog + backend confirmProjectName requirement).

**Requirements:** Board archive UX

**Success Criteria:**
- An admin can archive a card via a single confirm action without typing the project name
- A lightweight confirmation step remains (e.g., Archive / Cancel) since archive permanently deletes files
- Archive still requires ADMIN role and performs the same destructive action (hard-delete files, stage=archived, metadata/comments/notes/checklist preserved, audit event emitted)
- Backend no longer rejects archive for a missing/mismatched confirmProjectName (requirement removed or made optional, consistent with the UI)
- Resolves the empty-projectName edge case (cards with no linked project can now be archived)

**Dependencies:** Phase 1

---

## Phase 3: File Download Permission Fix

**Goal:** Fix the bug where a user can only download files they personally uploaded. Any user with access to a board card should be able to download any file attached to that card.

**Requirements:** Board files, Access control

**Success Criteria:**
- A user who can view/access a card can download every file on that card, regardless of who uploaded it
- Access is still enforced at the card-access boundary: a user without access to the card cannot download its files (no cross-card leakage)
- Delete permissions are unchanged (still PM/ADMIN as before) — only download is broadened
- Schedule isolation preserved

**Dependencies:** Phase 2

---

## Phase 4: Board Card Pentester Avatars

**Goal:** On the board (Kanban) cards, replace the textual pentester name(s) line with small circular profile-picture avatars — one per pentester — reusing the same avatar logic the schedule already uses (the `avatarUrl` at `/uploads/avatars/<userId>` with an initials fallback when no picture). Project Name and Client Name lines stay as text; only the pentester line becomes avatars.

**Requirements:** Board UX, Schedule parity

**Success Criteria:**
- Each board card shows a small circular avatar per assigned pentester in place of the joined name text, matching the schedule's avatar appearance (same image source and initials fallback)
- A pentester with no uploaded picture shows the same initials fallback the schedule uses (no broken image)
- Cards with multiple pentesters show multiple avatars (deduplicated by team member), consistent with how the schedule renders multiple members
- The avatar image source is the existing `user.avatarUrl` exposed on the board card payload (read-only backend select addition — no Prisma migration)
- Schedule isolation preserved: the board read path adds only a read-only avatar-field select; no writes to Assignment/TeamMember/Absence/Holiday

**Dependencies:** Phase 1

---

## Phase 5: Board Bug Fixes — Status Sync & Card Modal Overlap

**Goal:** Fix two board bugs. (1) A project's status edited on the Schedule does not propagate to the board (planner) — root cause is `projectService.upsertByKey` being create-only (it returns the existing Project without updating its status), compounded by the KanbanCard memo comparator omitting `project.status` and `useUpdateAssignment` not invalidating the board query. (2) In the card detail modal, the close (✕) button and the "manually placed" pin icon overlap in the top-right corner.

**Requirements:** Schedule↔board sync, Board UX

**Success Criteria:**
- Editing a project's status on the Schedule updates the same project's status on the board automatically (no manual refresh): `Project.status` is written on existing projects, the board query is invalidated after the schedule status mutation, and the KanbanCard re-renders on a status change
- The card detail modal's close (✕) button and the "manually placed" pin icon no longer overlap; both remain visible and clickable
- Schedule isolation preserved: the board side performs no writes to Assignment/TeamMember/Absence/Holiday (updating `Project.status` and invalidating the board cache are allowed; the board read path stays read-only against schedule tables)
- No regression to the existing schedule status editing, the avatar/status card layout (Phase 4), or project dedupe/eligibility behaviour

**Dependencies:** Phase 4

---

## Phase 6: Auth Rate Limiter Dev Override (MFA enrollment 429)

**Goal:** Stop the auth rate limiter (5 requests/min) from blocking legitimate MFA enrollment and local dev/testing. The multi-step onboarding flow (login → set password → TOTP setup → verify-setup, plus retries) trips `authRateLimiter` (5/min) and returns 429 on `POST /api/auth/totp/setup`, surfacing as "Failed to generate QR code". The QR-generation code and the setup route are correct; only the rate limit is too tight, and — unlike `generalRateLimiter` — it has no development relaxation. Add a `NODE_ENV==='development'` override to `authRateLimiter.max` (high in dev, keep 5/min in production), mirroring the existing `generalRateLimiter` pattern.

**Requirements:** Auth/MFA reliability, Dev experience

**Success Criteria:**
- In `NODE_ENV=development`, the auth/MFA endpoints (login, totp/setup, totp/verify-setup, password/change) no longer 429 during normal onboarding/testing — MFA QR enrollment works without hitting the rate limit
- In production, the auth rate limit is unchanged (still 5 requests/min per IP) — no weakening of production hardening
- The fix is confined to `authRateLimiter`'s `max` in `backend/src/middleware/rateLimit.ts`, mirroring `generalRateLimiter`'s existing `NODE_ENV==='development'` override; `loginRateLimiter` (its alias) is covered automatically
- The existing `skip: skipInTest` (test-env exemption) is preserved; `mutationRateLimiter`/`readRateLimiter` are untouched
- No new dependency, no DB migration, no schedule-table writes

**Dependencies:** None

---

## Phase 7: Planner Card Avatars — Initials & Account Colour

**Goal:** Change the pentester avatar "circles" on the **planner / board (Kanban) cards only** so that, instead of reusing the Schedule's photo + single-letter avatars (added in Phase 4), each circle shows a **two-letter monogram — first initial of the first name + first initial of the last name** (uppercase; mononyms show a single initial) on a **background colour deterministically derived from the account** (hash the stable `teamMemberId` to a colour from a fixed, white-text-readable palette). The Schedule view is left exactly as-is. Frontend-only, board-only: the entire change lives in `frontend/src/features/board/components/KanbanCard.tsx` (drop the `<AvatarImage>` photo branch, replace the single-initial fallback with a two-initial monogram, add a module-local `avatarBgColor(teamMemberId)` colour helper). The shared shadcn `avatar.tsx` primitive and the Schedule's hand-rolled `ScheduleGrid` avatars must not change. No backend, no Prisma migration, no schedule-table writes.

**Requirements:** Board UX, Schedule isolation

**Success Criteria:**
- Each planner/board card avatar circle shows the pentester's **first + last initial** (uppercase, e.g. "Ana Sousa" → "AS"); a single-token/mononym name shows one initial; a missing name degrades gracefully (no crash, sensible fallback)
- Each avatar circle has a **background colour deterministically derived from the account** (same account → same colour every render, stable across reloads), drawn from a fixed palette chosen so the initials text stays legible
- Board avatars **no longer render the uploaded profile photo** — the planner uses the initials+colour monogram regardless of whether the account has an `avatarUrl`
- The **Schedule view is visually unchanged**: the shared avatar primitive and the Schedule's own avatar rendering are not modified; only board/planner cards change
- Existing planner behaviour from Phase 4 is preserved: one circle per pentester (deduplicated by team member) and the "+N" overflow cap past the display limit
- `KanbanCard.test.tsx` is updated to assert the new two-initial monogram + deterministic colour and the absence of an `<img>` avatar; suite stays green. No schedule-table writes, no DB migration.

**Dependencies:** Phase 4

---

## Phase 8: Planner Avatar Name Precedence — full account name for initials

**Goal:** Fix the production bug where planner/board card avatars show only **one** initial even though accounts have a full "First Last" name. Root cause (verified): the name-resolution chain in `frontend/src/features/board/components/KanbanCard.tsx` (`pentesterName()` and `pentesterInitials()`) tries the editable **TeamMember alias** (`teamMember.displayName`, schema-documented for backlog members like "Futuro 1") **before** the linked account's `user.displayName`. In production the alias holds only the first name (e.g. alias "Rui" while `user.displayName` is "Rui Marques"), so it shadows the full name and the avatar renders a single initial. Fix is **planner-only**: flip the precedence so a linked user's `user.displayName` wins, keeping the alias as the fallback for backlog members that have no user (`teamMember.user` null). The board payload already exposes both fields, so no backend, no Prisma migration, no schedule change. The Schedule keeps its current behaviour by explicit decision.

**Requirements:** Board UX, Schedule isolation

**Success Criteria:**
- For a member with a linked user account, the board avatar shows **first + last initial of `user.displayName`** (e.g. account "Rui Marques" → "RM"), even when the `teamMember.displayName` alias is a single first name; the hover/title shows the full `user.displayName`
- Name-resolution precedence in `pentesterName()` and `pentesterInitials()` becomes `user.displayName → teamMember.displayName (alias) → username → fallback`
- **Backlog members preserved:** a member with no linked user (`teamMember.user` null, alias like "Futuro 1") still uses the alias — initials/name unchanged for them
- Single-token `user.displayName` still yields one initial (no last name exists to show); missing name still degrades to the safe fallback without crashing
- All Phase-7 behaviour preserved: deterministic per-account colour, no `<img>`/photo, dedupe by team member, cap-3 "+N" overflow
- **Schedule isolation:** only `frontend/src/features/board/components/KanbanCard.tsx` and its test change; `ScheduleGrid.tsx`, the shared `avatar.tsx`, `constants.ts`, `boardService.ts`, and all backend/prisma files are untouched; no DB migration
- `KanbanCard.test.tsx` gains a regression: a member whose alias is a single first name but whose `user.displayName` is "First Last" renders two initials; suite stays green (`tsc -b` + `vitest`)

---

## Phase 9: Planner Orphaned Card on Last-Pentester Schedule Delete

**Goal:** Fix the bug where deleting the **last** pentester's Assignment for a project in the Schedule leaves the project's card "hung up" in the Planner/board. Root cause (verified, see `09-RESEARCH.md`) is two compounding gaps: (1) `useDeleteAssignment` (`frontend/src/features/schedule/hooks.ts`) does not invalidate the `['board','cards']` React Query cache the way `useUpsertAssignment`/`useUpdateAssignment` do, so the stale card stays on screen; and (2) `deleteAssignment` (`backend/src/services/assignmentService.ts`) deletes only the Assignment row and never checks whether the linked Project now has zero remaining assignments — the `Assignment → Project` FK is `onDelete: SetNull`, so the Project + its 1:1 BoardCard survive and `boardService.listCards` keeps returning a zero-pentester card in its old column. The fix moves a genuinely orphaned card to the existing **`stopped`** stage (never deletes it) and broadcasts a board refresh; the multi-pentester case is protected by counting remaining assignments (`OR projectId / splitProjectId`) so a project still assigned to other pentesters is untouched. Schedule isolation preserved (writes only `BoardCard.stage`; never Assignment/TeamMember/Absence/Holiday; no Prisma migration).

**Requirements:** Schedule↔board sync, Board data integrity, Access control / data safety

**Success Criteria:**
- Deleting the **last** remaining Assignment for a project in the Schedule no longer leaves an orphaned/"hung" card in the Planner: the card is moved to the existing `stopped` stage (card, project, comments, files, checklist all **preserved** — never deleted)
- **Multi-pentester safety (non-negotiable):** when a project still has at least one other Assignment (primary or split, any pentester/week), deleting one pentester's assignment leaves the card and project completely untouched — no stage change, no deletion, no data loss
- The Planner reflects the deletion immediately for the acting user: `useDeleteAssignment.onSuccess` invalidates `['board','cards']` (matching the upsert/update hooks)
- Other connected clients refresh too: `DELETE /assignments/:id` emits `board:invalidate('cards')` after the schedule invalidate
- The remaining-assignment count correctly unions `projectId` and `splitProjectId`; split-cell deletes check both project halves independently; backlog/`projectId == null` assignments are skipped (no orphan check)
- The board-side update in `deleteAssignment` is best-effort (non-fatal try/catch) so a board failure can never roll back or block the schedule delete
- Schedule isolation preserved: the fix writes only `BoardCard.stage`; no writes to Assignment/TeamMember/Absence/Holiday, no change to the `onDelete: SetNull` FK, no Prisma migration
- Out-of-scope orphan paths documented as known gaps (bulk backlog delete `DELETE /team-members/backlog/:id`, `DELETE /schedule/purge`) rather than silently left ambiguous

**Dependencies:** Phase 1 (introduced the `stopped` stage), Phase 5 (board-cache invalidation pattern)

**Dependencies:** Phase 7

---

## Phase 10: Planner Card Client Name — Bold & Client Colour

**Goal:** On the planner/board (Kanban) card **preview**, render the client name in **bold** and in the **client's own colour**. Research (`10-RESEARCH.md`) confirms the colour pipeline already exists end-to-end: `Client.color` is a non-nullable hex column (`schema.prisma`), already selected by `boardService` (`listCards` + `getCard`) and already typed on the frontend (`BoardCard.project.client.color`). So this is a frontend-only, one-file change in `frontend/src/features/board/components/KanbanCard.tsx`: style the client-name line (currently `text-xs text-muted-foreground` at ~L167) as `font-bold` with `color: client.color`, and add `client.color` to the KanbanCard memo comparator so colour edits re-render. No backend change, no Prisma migration, no Schedule change.

**Requirements:** Board UX, Schedule isolation

**Success Criteria:**
- The client name on each planner/board card preview renders **bold** and in the **client's colour** (`card.project.client.color`)
- The colour updates reactively when a client's colour changes (KanbanCard memo comparator includes `client.color`)
- Legibility is preserved on the card's (light) background — pale client colours must remain readable (apply a contrast/luminance guard or confirm acceptable); no crash when `client` or `color` is absent (graceful fallback to the current muted style)
- Scope is the **card preview only** — the `CardDetailModal` expanded view and the Schedule are unchanged; the shared `avatar.tsx` primitive is untouched
- Frontend-only: no backend select change (colour already exposed), no Prisma migration, no writes to Assignment/TeamMember/Absence/Holiday

**Dependencies:** Phase 4 (board card layout)

---

## Phase 11: PM Role Can View & Open Archived Cards

**Goal:** Let users with the **PM** role see and open archived cards in the planner, while still being unable to **archive** cards. Research (`11-RESEARCH.md`) confirms every backend read endpoint already permits PM (board list, card detail, card files/download are `requireAuth` only and `listCards` returns all stages); the only gate hiding archived cards from PMs is the frontend **"Show Archived" toggle** in `BoardFilters.tsx` (rendered only for `hasRole('ADMIN')`) combined with the `Board.tsx` archived filter. The destructive admin-archive route (`POST /cards/:id/admin/archive`) stays `requireRole('ADMIN')` and the archive button stays ADMIN-only. **Critical hole to close:** the `PATCH /cards/:id` stage handler currently lets PM set `stage='archived'` (drag-to-archived-column), which would let a PM archive-by-dragging — since the user requires PMs cannot archive, this path must also be blocked for PM.

**Requirements:** Access control, Board UX, Role-based authorization

**Success Criteria:**
- A PM user can reveal archived cards in the planner (the "Show Archived" toggle is visible to PM and ADMIN — `hasRole('PM')`, which is `>=` so ADMIN still qualifies) and can open an archived card's detail view and its files/downloads
- The destructive **admin archive** action remains ADMIN-only: `POST /cards/:id/admin/archive` keeps `requireRole('ADMIN')`, and the Archive button stays hidden for PM (`canArchive` unchanged)
- **PMs cannot archive by any path:** the `PATCH /cards/:id` handler is updated so PM (like NORMAL) cannot set `stage='archived'` by dragging a card into the archived column; only ADMIN may move a card to `archived`. No other mutating/destructive endpoint (delete, file hard-delete, un-archive/restore) is widened to PM
- When a PM opens an archived card, archive/edit/delete controls that PMs lack permission for are not actionable (no privilege escalation via the opened view)
- No card-access leakage: PMs see archived cards under the same card-access rules as active cards; no cross-card data exposure. Audit behaviour unchanged
- Out of scope (flag, don't implement unless requested): a dedicated separate "Archived" view, and PM un-archive/restore

**Dependencies:** Phase 2 (archive flow), Phase 3 (file access control)

