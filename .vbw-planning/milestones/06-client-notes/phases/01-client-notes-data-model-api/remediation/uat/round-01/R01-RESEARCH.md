---
phase: 1
round: 1
title: "Phase 01 UAT Remediation R01 — Research"
type: remediation-research
confidence: high
date: 2026-07-10
---

## Findings

### Timeline context (critical — read first)

The six UAT issues (D01–D06) are all "Summary deviation review" checkpoints whose `Scenario` is literally *"Review a documented implementation deviation from SUMMARY.md"*. They were generated from `01-01-SUMMARY.md`'s frontmatter `deviations:` list and body "## Deviations" section — a file that was written by Dev **before** the QA remediation round ran, and was never updated afterward (SUMMARY.md is a point-in-time artifact, not a living document).

Between the Dev plan run and this UAT round, a full QA remediation round (`remediation/qa/round-01/`) already ran and closed both underlying deviations as **plan-amendments**:
- `.vbw-planning/phases/01-client-notes-data-model-api/remediation/qa/round-01/R01-PLAN.md` classifies DEV-01 and DEV-02 as `type: "plan-amendment"` with explicit rationale (both technically sound and safer than the plan's literal text).
- `.vbw-planning/phases/01-client-notes-data-model-api/remediation/qa/round-01/R01-SUMMARY.md` (commits `d365322`, `1851e53`) confirms both amendments were made and confirms `01-01-PLAN.md` was edited (not SUMMARY.md, not source code).
- `01-01-PLAN.md` itself (read directly, see below) already contains both "As-built amendment (QA R01)" notes with explicit "DEV-01 resolved-by-amendment" / "DEV-02 resolved-by-amendment" markers and "do NOT revert" warnings.

So when the UAT reviewer was shown `01-01-SUMMARY.md`'s stale deviation list and said "fix all the deviations," they were re-litigating two decisions that the plan (the project's declared source of truth per `01-01-PLAN.md`'s own amendment) had already closed with engineering rationale one remediation round earlier. This is the single most important fact for the planner: **there is nothing left to build or fix in the underlying code for D01/D02** — the artifact that was stale is `01-01-SUMMARY.md`, not `schema.prisma`, not `migration.sql`, not the test file.

---

### Deviation A (D01, restated in D04) — notes column placement + hand-authored migration

**What Plan 01 literally said** (`01-01-PLAN.md` Task 1 `<action>`, lines 82–89, quoted verbatim):
> "In model Client (schema.prisma:274), add three fields mirroring BoardCard (schema.prisma:324-329), placed after the `color` field and before the relation block: ... Then generate and apply the migration against the dev DB: `cd backend && npm run db:migrate -- --name client_notes` (i.e. `prisma migrate dev --name client_notes`) This both creates backend/prisma/migrations/{timestamp}_client_notes/migration.sql and applies it to dev.db, and regenerates the Prisma client. The generated SQL must be pure `ALTER TABLE "Client" ADD COLUMN ...` statements (3 of them) — NO RedefineTables block ... If the tool proposes a table redefinition, stop and investigate rather than committing it."

**must_have #1 verbatim** (`01-01-PLAN.md` line 22):
> "Migration is purely additive (ADD COLUMN only, no table redefinition); it applies cleanly to the existing populated SQLite dev.db and existing clients read back notes=\"\", notesUpdatedAt=null, notesUpdatedBy=null."

**Already-amended note** (`01-01-PLAN.md` line 91, appended to Task 1's `<action>` block by QA R01):
> "As-built amendment (QA R01): the three notes columns were appended at the END of model Client's scalar fields (after updatedAt), not after color, and migration.sql was hand-authored as three pure ALTER TABLE "Client" ADD COLUMN statements rather than tool-generated, because Prisma 7's engine proposed a RedefineTables table rebuild for the populated dev.db. QA independently verified: zero RedefineTables in migration.sql, prisma migrate status clean with no drift, PRAGMA table_info(Client) order matching schema.prisma exactly, and all 6 pre-existing Client rows preserved with notes='' and null attribution. DEV-01 resolved-by-amendment — do NOT revert (reverting would force a table rebuild on populated data)."

**As-built (verified directly)**:
- `backend/prisma/schema.prisma` `model Client` (lines 274–294): scalar order is `id, name, color, createdAt, updatedAt`, THEN a comment block (lines 281–283) explaining the placement choice, THEN `notes` (284), `notesUpdatedAt` (286), `notesUpdatedBy` (289) — i.e. appended at the end of scalars, after `updatedAt`, not immediately "after color." The relation block (`assignments`, `splitAssignments`, `projects`) follows at lines 291–293.
- `backend/prisma/migrations/20260710112154_client_notes/migration.sql`: exactly 3 lines, all `ALTER TABLE "Client" ADD COLUMN ...` (`notes TEXT NOT NULL DEFAULT ''`, `notesUpdatedAt DATETIME`, `notesUpdatedBy TEXT`). Zero `RedefineTables`, zero `PRAGMA` table-rebuild blocks. Confirms must_have #1 is satisfied to the letter even though the *placement* and *authoring method* diverged from the literal Task 1 instruction.

**Assessment — would literal-spec code-fix even be safe?**
Moving the three columns to sit textually "after color" in `schema.prisma` is cosmetic-only for SQLite (column order in the CREATE TABLE statement is not semantically meaningful to Prisma/SQLite once already applied) — but achieving that placement by regenerating a *tool-generated* migration is the real ask, and that is exactly what Dev tried and reports Prisma 7 refused to do additively: the `01-01-SUMMARY.md` deviation text and the Task 1 amendment both independently state Prisma 7's migrate engine proposed a `RedefineTables` rebuild for a `NOT NULL DEFAULT ''` column add — a table-rebuild is not merely undesirable, it directly violates must_have #1's explicit "no table redefinition" requirement and Task 1's own instruction to "stop and investigate rather than committing it" if that's what the tool proposes. Re-running `prisma migrate dev` now against the populated `dev.db` to chase literal-spec placement would risk regenerating that same `RedefineTables` block — i.e. the "fix" would directly break the must_have it's trying to satisfy for the sake of a purely cosmetic field-ordering preference.
There is also a **process reason** a literal code-fix is off the table procedurally: QA already independently re-verified (per the R01 plan/summary) that the hand-authored migration is additive, drift-free, and preserves all 6 pre-existing rows — i.e. an independent gate already signed off on exactly this artifact.

**Recommendation: process-exception** (not a fresh plan-amendment, since the amendment already happened; not a code-fix, since attempting one risks the exact must_have violation the plan forbids). The remediation should record that D01/D04 were already fully resolved by QA R01's plan-amendment prior to this UAT round, cite `01-01-PLAN.md`'s existing "As-built amendment (QA R01)" / "DEV-01 resolved-by-amendment" text as the disposition, and note the only defect was that `01-01-SUMMARY.md` (a historical point-in-time artifact) still displayed the pre-amendment deviation text that the UAT reviewer was shown — no source file requires further change.

**Files a remediation would touch:** none in `backend/`. At most, note-only: `01-01-SUMMARY.md` is a completed, timestamped artifact — VBW convention (per phase docs elsewhere in this repo) is not to retroactively rewrite completed SUMMARY files; if the planner wants to close the loop for future UAT clarity, the appropriate touch is the round's own `R01-PLAN.md`/`R01-SUMMARY.md` disposition text (recording that D01/D04 = process-exception, already resolved-by-amendment pre-UAT), not an edit to `01-01-PLAN.md` (already amended) or `01-01-SUMMARY.md`.

---

### Deviation B (D02, restated in D05) — schedule-isolation test assertion style

**What Plan 01 literally required** (`01-01-PLAN.md` Task 4 `<action>`, line 165, case 8 spec):
> "8. Schedule-isolation snapshot: capture Assignment/TeamMember/Absence/Holiday row counts before the PUT and assert they are unchanged after (no incidental writes)."

This is the literal ask for **global** row counts on all four tables.

**Already-amended note** (`01-01-PLAN.md` line 167, appended to Task 4's `<action>` block by QA R01):
> "As-built amendment (QA R01): case 8 asserts fixture-scoped row-identity (toEqual before/after on the exact seeded TeamMember/Assignment/Absence/Holiday rows) PLUS insert-count checks scoped by markers tied to the fixture (Assignment count filtered by clientId), NOT literal global row counts, because vitest runs suites in parallel against a shared dev.db and global counts would be flaky. QA verified this is a strictly stronger, parallel-safe proof of the no-write invariant. DEV-02 resolved-by-amendment — do NOT revert to global counts."

**As-built (verified directly)** — `backend/src/routes/__tests__/clientNotesAccess.test.ts` case 8, lines 355–390:
- Lines 356–359: `findUnique` snapshots of the exact seeded `TeamMember`/`Assignment`/`Absence`/`Holiday` rows (by id) before the PUT.
- Lines 362–365: fixture-scoped counts — `teamMember.count({ where: { displayName: `${marker}-tm` } })`, `assignment.count({ where: { clientId } })`, `absence.count({ where: { teamMemberId } })`, `holiday.count({ where: { name: `${marker}-holiday` } })` — all scoped to unique per-run markers (line 55–57 `uniqueSuffix()`), not global `count()`.
- Lines 374–389: re-fetch and re-count after the PUT; assert `toEqual` identity on the four rows (no UPDATE/DELETE) and assert the four scoped counts are unchanged (no INSERT under this fixture's markers).

**Assessment — is literal global-count achievable?**
No, not deterministically. `backend/vitest.config.ts` runs the suite via vitest's default pooling (no `singleFork`/`sequence.concurrent: false` override is set — only `exclude` was added by QA R01, confirmed by reading the full file, lines 1–41), and the test harness in this file itself (`withDbRetry`, lines 59–74) exists specifically to retry on `SQLITE_BUSY`/lock-timeout errors from concurrent workers against the single shared `dev.db` — i.e. the suite's own authors already had to design around shared-DB write contention. A literal unscoped `prisma.teamMember.count()` (no `where`) run concurrently with other suites that seed/teardown `TeamMember`/`Assignment` rows (e.g. `boardPatchChecklistAccess.test.ts`, which the plan itself names as the harness template) would be read racily against those other suites' inserts/deletes and produce nondeterministic counts — a textbook cross-suite test flake, not a defect in this suite. The fixture-scoped version is strictly *more* precise (byte-identity on the exact rows, not just a count) while being immune to this race.

**Recommendation: process-exception**, same reasoning as Deviation A — this was already classified and closed as `plan-amendment` by QA R01 (`fail_classifications: DEV-02, type: "plan-amendment"`), and the amendment text is already live in `01-01-PLAN.md`. Reverting case 8 to literal global counts would reintroduce a known-flaky assertion against the plan's own already-recorded rationale. Confirm whether Plan 01 was already amended for DEV-02: **yes**, per the "DEV-02 resolved-by-amendment" line quoted above.

**Files a remediation would touch:** none — `clientNotesAccess.test.ts` is correct as-built and should not be reverted; `01-01-PLAN.md` already carries the amendment.

---

### D06 — vitest dist exclusion + residual SQLite P1008 contention

**Vitest config state** — `backend/vitest.config.ts` (full file read, lines 1–41):
```
import { defineConfig, configDefaults } from 'vitest/config';
...
exclude: [...configDefaults.exclude, '**/dist/**'],
```
This is already in place (lines 14–18), added by QA R01 Task 2, and the comment on lines 14–17 explicitly attributes it to "QA remediation R01." `configDefaults.exclude` (vitest's own default, includes `node_modules/**` etc.) is preserved via spread, so no prior exclusion was narrowed.

**Does `clientNotesAccess.test.ts` pass in isolation?**
This cannot be verified without running vitest, which is out of scope for read-only research (and even if permitted, running a mutating-adjacent Prisma-backed suite against the shared `dev.db` is exactly the kind of live-state-touching action Scout should not perform). The claim that the suite is "8/8 green in isolation" is corroborated by two independent artifacts, not just Dev's word:
- `remediation/qa/round-01/R01-SUMMARY.md` line 52: "`npx vitest run src/routes/__tests__/clientNotesAccess.test.ts` remained 8/8 green (Test Files 1 passed, Tests 8 passed)" — this was QA's own re-run after the dist-exclusion change, i.e. a second, independent confirmation post-fix.
- `remediation/qa/round-01/R01-PLAN.md` line 26 (known_issues_input) states the case (6)/(7) 500s were "Root-caused via stack trace to the identical P1008 SocketTimeout inside logAuditEvent's prisma.$transaction (backend/src/services/audit.ts:47-71), not in schedule.ts or clientService.ts... Independently verified via stack trace inspection, not taken on Dev's word."

⚠ This phase's remediation planner should treat "8/8 green in isolation" as **Dev/Debugger-verifiable** rather than research-confirmed truth — Scout did not execute the suite. Recommend the remediation plan include a verify step re-running `cd backend && npx vitest run src/routes/__tests__/clientNotesAccess.test.ts` in isolation as a Dev-stage check, consistent with how QA R01 itself verified it.

**Is the residual P1008 contention deterministically fixable within this phase's scope?**
No. The root cause (per QA R01's stack-trace-verified finding) is in `backend/src/services/audit.ts:47-71`'s `prisma.$transaction` under SQLite's single-writer model via the `better-sqlite3` adapter — a file **not** in Plan 01's `files_modified` list and shared by every audited route in the app (not just client notes). QA R01 already accepted this exact failure mode as a `process-exception` for 7 of 8 known issues, citing prior acceptance in phases 09 and 24 (`R01-PLAN.md` lines 31–38, `R01-SUMMARY.md` lines 19–26). D06 in `01-UAT.md` (lines 97–111) is itself describing this same already-accepted contention, plus explicitly noting "The R01 remediation already excluded dist/** from vitest discovery" and asking the remediation to "Confirm the dist-exclusion fix resolves the doubled-run contention" — i.e. D06's own text acknowledges the fix already landed and asks for confirmation, not a new fix.

**Recommendation: process-exception**, carrying forward QA R01's exact disposition and citations (phases 09/24 prior acceptance), plus a Dev-stage verification step confirming `clientNotesAccess.test.ts` is still 8/8 green in isolation post dist-exclusion (already reported once by QA, worth reconfirming for this round's own audit trail).

**Files a remediation would touch:** none in `backend/` (the one legitimate fix — dist exclusion — is already merged in `backend/vitest.config.ts`).

---

### D03 (fragment) and duplicate handling (D04, D05)

- **D03** (`01-UAT.md` lines 49–63): its `Deviation:` field is literally the sentence fragment `"Two deviations, both recorded in frontmatter:"` — the SUMMARY.md preamble line that introduces the numbered list, not a deviation of its own. `01-UAT.md`'s own issue description for D03 (line 62) already says: "Not a distinct deviation of its own — resolve by addressing those two underlying deviations. Remediation may classify this as a process-exception once the real deviations are handled." Confirmed: D03 carries no unique technical content beyond D01/D02 and should be closed as **process-exception / resolved-together** once A and B are dispositioned.
- **D04** (`01-UAT.md` lines 65–79) is the `01-01-SUMMARY.md` body's numbered restatement ("1. **Task 1 column placement + hand-authored migration.**") of the exact same fact pattern as D01. Confirmed verbatim overlap — same columns, same migration, same Prisma-7-RedefineTables cause, same BoardCard precedent citation.
- **D05** (`01-UAT.md` lines 81–95) is the SUMMARY body's restatement ("2. **Task 4 isolation assertion style.**") of D02. Confirmed verbatim overlap — same case-8, same fixture-scoped-vs-global framing, same parallel-vitest-worker rationale.

**Recommendation:** D03/D04/D05 should be dispositioned as **resolved-together with D01/D02 respectively** (process-exception, no separate code change), not as three additional independent findings. A remediation plan that tried to "fix" D04 and D05 as if distinct from D01/D02 would either duplicate work or contradict itself (e.g., amending the same plan text twice, or writing two different rationales for the same underlying test assertion).

---

## Prior Fix Analysis

The only prior fix activity for this phase's deviations is the QA remediation round documented at `.vbw-planning/phases/01-client-notes-data-model-api/remediation/qa/round-01/`:
- `R01-PLAN.md` (2 tasks: amend `01-01-PLAN.md` for DEV-01/DEV-02; add `dist/**` exclusion to `vitest.config.ts`).
- `R01-SUMMARY.md` (status: complete, commits `d365322`, `1851e53`, both tasks confirmed done, both classified `deviations: "None."`).
- `R01-VERIFICATION.md` and `R01-KNOWN-ISSUES.json` also exist in that folder (not read in full for this research pass, but their existence corroborates the round completed its own QA gate).

That prior fix directly and fully addresses the technical substance of D01/D02/D03/D04/D05: no further code or plan edit is warranted for those five items. It does **not** address D06 beyond the dist exclusion (which it does address) — D06's residual audit-transaction contention was explicitly carried forward as an accepted process-exception, which is the same disposition this UAT round's D06 should receive.

## Root Cause Assessment

The root cause of all six UAT rejections is **not** a defect in the shipped code — it is a **sequencing/staleness gap in the review artifact chain**: `01-01-SUMMARY.md` was authored by Dev before QA ran, correctly disclosed both deviations with rationale at that time, and was never intended to be rewritten after QA's plan-amendment (SUMMARY.md is a completed, timestamped, per-plan-run artifact in this project's conventions — see `01-01-SUMMARY.md` frontmatter `status: complete`, `completed: 2026-07-10`). The UAT reviewer was shown that now-superseded SUMMARY text (via the "Summary deviation review" checkpoint mechanism) without visibility into the intervening QA remediation round that had already closed both deviations as sound, rationale-backed plan-amendments in the actual source of truth (`01-01-PLAN.md`). The user's blanket instruction — "Fix all the deviations before ending the phase" — was a reasonable response to what they were shown, but the underlying deviations were already fixed (i.e., formally reconciled with the plan) one round earlier.

## Recommendations

1. **D01 / D04 (Deviation A — column placement + hand-authored migration): process-exception.** Already resolved-by-amendment in `01-01-PLAN.md` (QA R01). Do not attempt a literal-placement/tool-generated-migration code-fix — Dev's own reported and QA's own independently-verified finding is that doing so risks exactly the `RedefineTables` table-rebuild that must_have #1 forbids, on a populated `dev.db`. No files touched.
2. **D02 / D05 (Deviation B — fixture-scoped isolation assertion): process-exception.** Already resolved-by-amendment in `01-01-PLAN.md` (QA R01). The fixture-scoped assertion is strictly stronger (row-identity, not just counts) and is required for correctness under vitest's parallel, shared-`dev.db` execution model. Reverting to literal global counts would introduce a known flake. No files touched.
3. **D03 (fragment): process-exception, resolved-together with D01/D02.** Not a distinct deviation; carries no independent technical content.
4. **D06 (SQLite P1008 contention): process-exception**, carried forward from QA R01's own disposition (citing phases 09/24 prior acceptance of the same `audit.ts` single-writer contention). The one legitimate, in-scope fix — excluding `dist/**` from vitest discovery — is already merged in `backend/vitest.config.ts:18`. Recommend the remediation plan include a Dev-stage verification step re-confirming `clientNotesAccess.test.ts` is 8/8 green in isolation (Scout did not execute the suite; QA R01 did, twice, with stack-trace-level root-causing).
5. **Net effect:** this UAT remediation round likely needs **zero source-code changes** and **zero further plan edits** (the plan is already amended). Its job is to formally re-disposition all six issues as process-exceptions/resolved-together, citing the QA R01 amendment as the closing evidence, and to make explicit — for the audit trail — that the reviewer's rejection was based on a stale SUMMARY snapshot rather than a live defect.

## Live Validation Evidence

- **command_shape:** N/A — no live command was executed. All findings are from direct file reads (`01-01-PLAN.md`, `schema.prisma`, `migration.sql`, `clientNotesAccess.test.ts`, `vitest.config.ts`, `01-UAT.md`, `01-01-SUMMARY.md`, and the QA R01 remediation artifacts).
- **exit_status:** N/A
- **redacted_evidence:** N/A
- **expected_shape:** A Dev/Debugger-stage run of `cd backend && npx vitest run src/routes/__tests__/clientNotesAccess.test.ts` is expected to report `8 passed` (matching QA R01's own reported re-run in `R01-SUMMARY.md` line 52).
- **confidence:** high on all static/textual findings (direct quotes from source files); medium-high on the "still passes in isolation" claim specifically, since Scout did not execute it directly and is relying on QA R01's documented re-run.
- **limitations_or_deferred_reason:** Running vitest against the shared `dev.db` was deliberately not attempted — it would be a state-touching action against a live Prisma-backed SQLite database, outside Scout's read-only research mandate. Flagged above as a recommended Dev-stage verification step rather than executed here.
