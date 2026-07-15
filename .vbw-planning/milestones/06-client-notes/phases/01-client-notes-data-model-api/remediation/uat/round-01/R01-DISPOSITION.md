---
phase: 1
round: 1
title: "Phase 01 UAT Remediation R01 — Closing Disposition (D01–D06 re-dispositioned as process-exceptions)"
type: remediation-disposition
date: 2026-07-10
source_uat: .vbw-planning/phases/01-client-notes-data-model-api/01-UAT.md
prior_round: .vbw-planning/phases/01-client-notes-data-model-api/remediation/qa/round-01/
---

# UAT R01 Closing Disposition — Phase 01 (Client Notes — Data Model + API)

All six UAT deviation-review rejections (D01–D06) are closed as **process-exceptions**
with **zero product-source changes**. The two real deviations underlying these six
rejections were already formally reconciled with the plan by the earlier QA remediation
round (QA R01, commits `d365322`, `1851e53`), which recorded them as resolved-by-amendment
in `01-01-PLAN.md`. This disposition record makes that closure human-reviewable for the
UAT audit trail; it does not re-open or re-fix anything.

## Root cause (all six rejections)

The rejections were driven by a **stale, pre-amendment `01-01-SUMMARY.md` snapshot** shown
to the UAT reviewer — not by a live defect. `01-01-SUMMARY.md` is a completed, timestamped,
per-plan-run artifact (`status: complete`, `completed: 2026-07-10`) written by Dev **before**
the QA remediation round ran, and correctly disclosed both deviations with rationale at that
time. It was never intended to be rewritten afterward. Between that Dev run and this UAT round,
QA R01 already closed both underlying deviations as sound, rationale-backed plan-amendments in
the actual source of truth (`01-01-PLAN.md`). The reviewer was shown the now-superseded SUMMARY
text without visibility into that intervening amendment. The as-built `schema.prisma`,
`migration.sql`, and `clientNotesAccess.test.ts` already match the amended plan — there is
nothing left to build or fix in the code for D01–D05, and D06's one in-scope fix already landed.

## Dispositions

### Deviation A — D01 (and its restatement D04): process-exception, resolved-by-prior-amendment

**As-built (unchanged this round).** The three notes columns sit at the **END** of
`model Client`'s scalar fields (after `updatedAt`), and
`backend/prisma/migrations/20260710112154_client_notes/migration.sql` is exactly three
hand-authored `ALTER TABLE "Client" ADD COLUMN` statements (`notes`, `notesUpdatedAt`,
`notesUpdatedBy`) with **zero `RedefineTables`** / zero `PRAGMA` table-rebuild blocks.

**Closing evidence.** This as-built form was **already reconciled with the plan by QA R01**.
`01-01-PLAN.md` carries the **"As-built amendment (QA R01)"** note on **Task 1**'s `<action>`
block marking **"DEV-01 resolved-by-amendment — do NOT revert."** QA independently verified:
zero `RedefineTables` in `migration.sql`, `prisma migrate status` clean with no drift,
`PRAGMA table_info(Client)` order matching `schema.prisma` exactly, and all 6 pre-existing
Client rows preserved with `notes=''` and null attribution.

**Why no code-fix.** A literal-spec code-fix (regenerating a tool-authored migration to place
the columns "after color") would make Prisma 7 emit the `RedefineTables` table rebuild that
**must_have #1** explicitly forbids on the populated `dev.db` — the "fix" would break the very
must_have it targets, for a purely cosmetic field-ordering preference. Source rewrites are off
the table. **No source file changed.**

### Deviation B — D02 (and its restatement D05): process-exception, resolved-by-prior-amendment

**As-built (unchanged this round).** Case 8 in
`backend/src/routes/__tests__/clientNotesAccess.test.ts` uses **fixture-scoped row-identity
`toEqual` snapshots** (byte-identity on the exact seeded TeamMember/Assignment/Absence/Holiday
rows) **plus marker-scoped insert counts** (e.g. `assignment.count({ where: { clientId } })`),
**not literal global row counts**.

**Closing evidence.** This was **already reconciled by QA R01**. `01-01-PLAN.md` carries the
**"As-built amendment (QA R01)"** note on **Task 4**'s `<action>` block marking
**"DEV-02 resolved-by-amendment — do NOT revert to global counts."** QA verified this is a
strictly stronger, parallel-safe proof of the schedule no-write invariant.

**Why no code-fix.** vitest runs suites in parallel against a shared `dev.db`; reverting case 8
to literal unscoped global counts would be read racily against other suites' inserts/deletes and
reintroduce a known cross-suite flake. The fixture-scoped assertion is both more precise and
race-immune. **No source file changed.**

### D03: process-exception, resolved-together with D01/D02

D03's `Deviation:` field is literally the SUMMARY preamble fragment
**"Two deviations, both recorded in frontmatter:"** — the sentence that introduces the numbered
list, not a deviation of its own. It carries no independent technical content and is closed
together with D01/D02. `01-UAT.md` itself directs closing D03 as a process-exception once the
two real deviations are handled.

### D04: process-exception, resolved-together with D01 (Deviation A)

Verbatim SUMMARY-body restatement of D01 (same columns, same hand-authored migration, same
Prisma-7 `RedefineTables` cause, same BoardCard precedent). Resolved via the QA R01 **DEV-01**
amendment. **No source change.**

### D05: process-exception, resolved-together with D02 (Deviation B)

Verbatim SUMMARY-body restatement of D02 (same case 8, same fixture-scoped-vs-global framing,
same parallel-vitest-worker rationale). Resolved via the QA R01 **DEV-02** amendment.
**No source change.**

### D06: process-exception, carried forward from QA R01

Pre-existing **SQLite P1008 SocketTimeout** contention in the shared, out-of-scope
`backend/src/services/audit.ts` `$transaction` (SQLite single-writer contention via the
`better-sqlite3` adapter) under full parallel vitest load — **not a client-notes defect**.
`audit.ts` is not in Phase 01's `files_modified` and is shared by every audited route in the app.
The one **in-scope** fix — excluding stale compiled duplicates via `**/dist/**` from vitest
discovery — **already landed at `backend/vitest.config.ts:18`** in QA R01, cutting parallel
`dev.db` write load. `clientNotesAccess.test.ts` is **8/8 green in isolation** (re-verified in
this round's Task 2 as the audit trail's own evidence). This same disposition and prior-phase
acceptance were carried from QA R01, which cited prior acceptance of the identical `audit.ts`
single-writer contention in **phases 09 and 24**. Disposition: **accepted-process-exception**.

## Summary table

| UAT ID | Underlying deviation | Disposition | Closing evidence |
| --- | --- | --- | --- |
| D01 | A — column placement + hand-authored migration | process-exception | 01-01-PLAN.md Task 1 "DEV-01 resolved-by-amendment" (QA R01) |
| D02 | B — fixture-scoped isolation assertion | process-exception | 01-01-PLAN.md Task 4 "DEV-02 resolved-by-amendment" (QA R01) |
| D03 | fragment (no independent content) | process-exception | resolved-together with D01/D02 |
| D04 | restatement of A | process-exception | QA R01 DEV-01 amendment |
| D05 | restatement of B | process-exception | QA R01 DEV-02 amendment |
| D06 | SQLite P1008 audit.ts contention | accepted-process-exception | dist exclusion at backend/vitest.config.ts:18; 8/8 green in isolation; phases 09/24 precedent |

**Net effect:** zero source-code changes and zero further plan edits (the plan is already
amended). This round formally re-dispositions all six issues as process-exceptions /
resolved-together, citing the QA R01 amendment as closing evidence for Deviations A and B, and
records that the reviewer's rejection was based on a stale SUMMARY snapshot rather than a live defect.
