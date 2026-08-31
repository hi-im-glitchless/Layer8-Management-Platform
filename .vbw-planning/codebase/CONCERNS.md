# Concerns

Ordered roughly by severity. Many are dev-convenience tradeoffs that become risks in production.

## Security
1. **Hardcoded API key default in source** — `config.ts` sets `CLIPROXY_API_KEY` to a literal `sk-...` default. Any deploy without an explicit override ships a real-looking secret baked into the binary/repo. Move to required env (no default) and rotate the leaked value. (`backend/src/config.ts:12`)
2. **`DISABLE_VIRUS_SCAN` bypass** — env flag fully skips ClamAV on uploads (added `e45392f`). Convenient locally; dangerous if it leaks into prod since the platform handles user-uploaded docx/board files. Ensure it is force-`false` in production config and surfaced in deploy checks.
3. **`reset-password` sets a known default + weak example secret** — `launch-local.sh reset-password` defaults to `Admin123!`; `backend/.env.example` ships `SESSION_SECRET=change-me...`. Fine for dev; document hard requirement to replace in prod (config already enforces ≥32 chars but not entropy).
4. **`enable-mfa` stores raw TOTP secret + prints it** — the dev helper persists `totpSecret` in plaintext (consistent with how the app verifies) and echoes secret/URI to the terminal. Dev-only by design; keep out of any shared/logged context.
5. **Client-side RBAC is advisory** — `lib/rbac.ts` gating must always be backed by server `requireRole`/`requireCardAccess`. Verified server-side today; keep that invariant when adding routes.
6. **Board authz TODO** — `requireCardAccess` lets PM pass unconditionally because "org-scoping is not yet implemented" (explicit TODO in `middleware/boardAuth.ts`). Multi-org isolation is not enforced.

## Data / correctness
7. **SQLite as primary store** — single-writer; concurrent writes (realtime board/schedule edits across users) can contend. Acceptable for small team scale; revisit if usage grows. WAL/lock behaviour not configured here.
8. **JSON-in-TEXT columns** (`tags`, `splitTags`, `checklist`, audit `details`) — no DB-level schema/validation; correctness depends on every service parse/stringify site. Easy to drift.
9. **Prisma SQLite path resolution duality** — app resolves `file:./dev.db` relative to backend root (`db/prisma.ts`), while Prisma CLI/`prisma.config.ts` resolve from `DATABASE_URL`. Mismatch risks migrating one DB file while the app reads another. Verify both point at the same file after setup.
10. **Nullable `projectId`/`splitProjectId` on Assignment** — pre-R03 / incomplete assignments silently drop out of the Planner. Intentional, but a quiet data-completeness cliff; the `dryrun-project-dedupe.ts` script exists to help.

## Operational
11. **Optional services degrade silently** — sanitizer/gotenberg/clamav down at boot only log a warning; features return 503 later. Good resilience, but no health surface aggregating their status beyond `/api/health` (which only reports the API itself).
12. **No CI detected** — tests run locally; regressions in untested schedule/board backend logic won't be caught automatically.
13. **Two launcher scripts** (`launch-local.sh` ~19KB, `launcher.sh` ~25KB) — overlapping responsibilities; risk of divergence/confusion about the canonical entrypoint.
14. **Binary/asset cruft in repo root** — `layer8_logo_dark (Copy).exe` (a PNG mislabeled `.exe`), duplicate logos. Harmless but messy; the `.exe` extension is a footgun.

## Test coverage
15. **Core domain logic under-tested** — scheduling (split cells, copy/paste), board stage locks, and project dedupe carry most of the recent churn yet have thin backend tests; frontend almost entirely untested. See TESTING.md.

## Process / state
16. **VBW bookkeeping lags code** — roadmap/summaries drift vs implemented phases (state-drift warning at session start); treat planning artifacts as approximate. Phase 22 (Kanban UI) shown in-progress while board features are already in main.
17. **DEVN-05 accepted lint issue** in `KanbanCard` — known, non-blocking; do not re-open QA for it.

## Accessibility
18. **Radix `DialogContent` rendered without a `Description`** — `frontend/src/features/board/components/CardDetailModal.tsx:497` and `frontend/src/features/schedule/components/ClientNotesModal.tsx:46` render `DialogContent` with a `DialogTitle` but no `DialogDescription`. Radix therefore logs `Missing Description or aria-describedby={undefined} for DialogContent` on every render (visible as stderr noise across the whole `CardDetailModal.test.tsx` suite) and wires `aria-describedby` to an id that no element carries — a dangling IDREF. Both dialogs *are* correctly named: `aria-labelledby` resolves to the `DialogTitle`, so WCAG 4.1.2 is satisfied and the practical assistive-tech impact is negligible (a dangling IDREF is dropped silently). The residual gap is the absent supplementary description. Every other dialog in the repo already uses `DialogDescription`; these two are the outliers. Accepted as non-blocking for Phase 01 QA round 01 — the warning predates the phase and fires identically on untouched Phase-03 cases. Deferred rather than fixed inline because the real fix requires new description copy (a content decision) landing in the header subtree, and should cover both modals in one scoped accessibility change. Fixing it as `aria-describedby={undefined}` alone would silence the warning without improving accessibility and is not the wanted outcome.

## Lint / tooling debt
19. **Standing repo-wide ESLint backlog** — `npm run lint` in `frontend/` reports 59 problems (45 errors, 14 warnings) across 31 files (`routes/Profile.tsx`, `routes/TemplateAdapter.tsx`, `admin/*`, `features/adapter/*`, `features/executive-report/*`, `features/schedule/*`, `routes/Board.tsx`, and others). Nothing gates it: `build` is `tsc -b && vite build` and never invokes ESLint, and there is no CI (see 12), so the backlog neither fails a build nor blocks a merge and grows unchecked. Accepted as non-blocking for Phase 01 QA round 01 — zero findings fall in the four Planner files that phase touched. Needs its own cleanup phase; per-phase acceptance is not a fix.
