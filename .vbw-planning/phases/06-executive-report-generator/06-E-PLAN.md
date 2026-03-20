---
phase: "06"
plan: "06-E"
title: "Corrections Flow, Chat Integration, and End-to-End Polish"
wave: 3
depends_on:
  - "06-C"
  - "06-D"
cross_phase_deps: []
skills_used:
  - fastapi-expert
must_haves:
  - "Chat corrections in StepReview send messages via SSE and receive targeted section updates"
  - "Targeted regeneration: only affected narrative sections re-generated, charts only if data changed"
  - "De-sanitization of correction text before re-generation (re-sanitize user input, de-sanitize LLM output)"
  - "Report rebuilds after corrections: updated DOCX + new PDF"
  - "Best-effort parsing warnings displayed to user when input report is poorly structured"
  - "Full end-to-end flow works: upload any DOCX -> sanitize -> review -> generate -> correct via chat -> download"
---

## Objective

Complete the executive report feature by wiring chat-based corrections in the review step, implementing targeted section regeneration, handling edge cases (parse failures, missing data), and polishing the end-to-end flow for production use.

## Context

- `@06-C-PLAN.md` -- Backend pipeline: sanitization, extraction, generation, DOCX build, PDF conversion
- `@06-D-PLAN.md` -- Frontend: 5-step wizard with all step components, SSE hooks
- `@frontend/src/features/executive-report/hooks.ts` -- useReportChat hook for SSE streaming
- `@frontend/src/features/executive-report/components/StepReview.tsx` -- review step (chat placeholder to fill)
- `@backend/src/services/reportService.ts` -- processReportChat stub to implement
- `@backend/src/routes/executiveReport.ts` -- /chat SSE endpoint
- `@sanitization-service/app/services/report_narrative_prompt.py` -- narrative prompt builder for single-section regeneration
- `@06-CONTEXT.md` decisions: targeted section regeneration, chat corrections, de-sanitize before DOCX build, best-effort parsing with warnings

## Tasks

### Task 1: Python single-section regeneration prompt + route

**Files:**
- `sanitization-service/app/services/report_narrative_prompt.py` (modify)
- `sanitization-service/app/routes/report.py` (modify)
- `sanitization-service/app/models/report.py` (modify)

**What:** Add support for targeted single-section narrative regeneration.

**report_narrative_prompt.py additions:**
1. `build_section_correction_system_prompt(language: str) -> str` -- system prompt for correcting a single section. Instructs LLM to revise the specified section based on user feedback while maintaining consistency with the rest of the report. Output: JSON `{ section_key: str, revised_text: str }`.

2. `build_section_correction_user_prompt(section_key: str, current_text: str, user_feedback: str, report_context: dict) -> str` -- user prompt with: the current section text, user's correction request, surrounding section summaries for context. report_context includes findings summary, risk score, and other section titles for coherence.

3. `validate_section_correction(raw_json: str, expected_key: str) -> dict` -- validate the correction response has the expected section_key and non-empty revised_text.

**Pydantic models:**
- `SectionCorrectionPromptRequest` -- section_key, current_text, user_feedback, report_context, language
- `SectionCorrectionPromptResponse` -- system_prompt, user_prompt
- `ValidateSectionCorrectionRequest` -- raw_json, expected_section_key
- `ValidateSectionCorrectionResponse` -- section_key, revised_text, valid, error

**Routes:**
- `POST /report/build-section-correction-prompt` -- builds correction prompt
- `POST /report/validate-section-correction` -- validates correction response

**Acceptance:**
- [ ] Correction system prompt instructs single-section revision with context
- [ ] User prompt includes current text, feedback, and surrounding context
- [ ] Validation checks section_key matches expected
- [ ] Routes respond correctly with prompt text

**Commit:** `feat(report): add single-section correction prompt builder and routes`

### Task 2: Backend chat corrections -- processReportChat implementation

**Files:**
- `backend/src/services/reportService.ts` (modify)

**What:** Implement `processReportChat()` for the SSE /chat endpoint. This handles iterative corrections to the executive report.

**Flow:**
1. Load session state (must be in 'review' step with narrative sections)
2. Parse user message to identify target section(s). Use a simple heuristic: if message mentions a section name (e.g., "executive summary", "recommendations"), target that section. If unclear, ask the LLM to identify the section from context.
3. **Sanitize user feedback:** The user types real names/data in corrections. Re-sanitize the user message using session forward mappings before sending to LLM.
4. **Build correction prompt:** POST to Python `/report/build-section-correction-prompt` with section_key, current sanitized text, sanitized user feedback, report context
5. **LLM correction call:** Call `generateStream()` with correction prompts. Stream delta events to client.
6. **Validate correction:** POST raw JSON to Python `/report/validate-section-correction`
7. **De-sanitize revised text:** Call `desanitizeText()` on the revised section text
8. **Update session:** Replace the section in narrativeSections with de-sanitized revised text
9. **Rebuild report:** POST updated sections to Python `/report/build-report` for new DOCX
10. **Queue new PDF:** Call `addPdfConversionJob()` for Gotenberg conversion
11. **Emit section_update SSE event** with updated section key and preview PDF job ID
12. Increment chat iteration count

**Section identification heuristic:**
Map common keywords to section keys: "summary" -> executive_summary, "risk score" -> risk_score_explanation, "recommendations" -> strategic_recommendations, "compliance" -> compliance_risk_text, "threats" -> key_threats, "conclusion" -> conclusion, "positive" -> positive_aspects. If no match, default to executive_summary and mention in the delta response which section is being updated.

**Acceptance:**
- [ ] User message re-sanitized before LLM call
- [ ] Correct section identified from user message
- [ ] LLM generates revised section text via streaming
- [ ] Revised text de-sanitized with session mappings
- [ ] Session updated with new narrative section text
- [ ] DOCX rebuilt and PDF re-queued
- [ ] SSE events emitted: delta (LLM text), section_update (JSON), done

**Commit:** `feat(report): implement chat-based section correction with targeted regeneration`

### Task 3: Frontend chat panel for StepReview

**Files:**
- `frontend/src/features/executive-report/components/ReportChatPanel.tsx` (new)
- `frontend/src/features/executive-report/components/StepReview.tsx` (modify)

**What:** Build the chat panel for the review step and wire it into StepReview.

**ReportChatPanel.tsx:**
Chat panel following ChatPanel.tsx pattern but for report corrections:
- Input field + Send button
- Message history display (user + assistant messages)
- Streaming indicator during LLM response
- Iteration counter with soft limit warning (5 iterations)
- Helper text: "Describe what you'd like to change in the report. Reference specific sections by name."
- Section update badge: when a `section_update` event arrives, show a brief toast/badge indicating which section was updated

**StepReview.tsx (modify):**
Add the chat panel alongside the PDF preview:
- Layout: PDF preview (left/top, 60%) + chat panel (right/bottom, 40%)
- On section_update event: trigger PDF re-poll (new PDF being generated)
- "Regenerating..." overlay on PDF while new PDF converts
- Show loading skeleton for PDF during conversion
- Section update triggers preview status re-fetch

**Acceptance:**
- [ ] Chat panel renders with input, message history, streaming indicator
- [ ] User can type corrections and receive streaming LLM responses
- [ ] section_update event triggers PDF re-poll
- [ ] PDF preview updates after correction (new PDF from Gotenberg)
- [ ] Iteration counter warns after 5 corrections
- [ ] Layout responsive: side-by-side on desktop, stacked on mobile

**Commit:** `feat(report-ui): add chat panel for review corrections with PDF re-render`

### Task 4: Best-effort parsing + warning display + edge cases

**Files:**
- `sanitization-service/app/services/report_extraction_prompt.py` (modify)
- `backend/src/services/reportService.ts` (modify)
- `frontend/src/features/executive-report/components/StepSanitizeReview.tsx` (modify)
- `frontend/src/features/executive-report/components/StepGenerate.tsx` (modify)

**What:** Handle edge cases for poorly structured input reports and propagate warnings to the user.

**Python extraction prompt changes:**
- Strengthen the system prompt to handle: reports without CVSS scores (estimate severity from description), reports with non-standard formatting (bullet points instead of sections), very short reports (few paragraphs), reports in mixed languages
- Add warning categories: `missing_cvss` (no CVSS scores found), `few_findings` (< 3 findings extracted), `unclear_severity` (severity guessed), `incomplete_metadata` (some metadata fields missing)

**Backend changes:**
- In `extractFindings()`: if validation returns warnings, store them prominently in session
- In `sanitizeReport()`: handle edge case where DOCX has very few paragraphs (< 5) -- still proceed but add warning
- In `generateReport()`: if findings are sparse, still generate report but with appropriate warnings in narrative

**Frontend StepSanitizeReview changes:**
- Show warnings banner at top of step if session has warnings
- Warning types: info (blue), caution (yellow), error (red)
- Each warning: icon + message + optional action ("No CVSS scores found -- severity will be estimated")
- Warnings don't block progression but inform the user

**Frontend StepGenerate changes:**
- If extraction had warnings, show them before generation starts
- "Continue with warnings" vs "Go back and review" choice
- During generation, if stage emits warnings, append to display

**Acceptance:**
- [ ] Reports without CVSS scores generate with estimated severity + warning
- [ ] Short reports (< 5 paragraphs) still process with warning
- [ ] Missing metadata flagged as warning, user can fill in metadata editor
- [ ] Warnings displayed in StepSanitizeReview banner
- [ ] Warnings shown before generation with continue/go-back choice
- [ ] No crashes on malformed input DOCX

**Commit:** `feat(report): add best-effort parsing with warning display for edge cases`

### Task 5: End-to-end integration testing + final polish

**Files:**
- `frontend/src/features/executive-report/components/ReportWizardShell.tsx` (modify)
- `backend/src/routes/executiveReport.ts` (modify)
- `backend/src/services/reportService.ts` (modify)

**What:** Final integration testing, bug fixes, and polish for the complete executive report flow.

**Integration verifications:**
1. Upload the test report (`L8250203 - Internal Pentest Report_Anonimizado.docx`) -- verify language detection (should detect PT or EN)
2. Sanitization review -- verify side-by-side diff shows entity replacements
3. Metadata editor -- verify LLM-extracted values appear
4. Generation -- verify all 6 stages complete and PDF is generated
5. Review -- verify PDF preview loads
6. Chat correction -- verify targeted section regeneration works
7. Download -- verify both DOCX and PDF are downloadable and contain expected content

**Polish items:**
- Auto-resume: if user navigates away and back, session restores to correct step
- Step regression prevention: can't go back past sanitize-review after generation
- File cleanup: delete uploaded DOCX and generated files on session delete
- Audit logging: log report generation events (upload, generate, download) via `logAuditEvent()`
- Error recovery: if generation fails mid-pipeline, allow retry from last successful stage
- Loading states: all async operations show proper loading indicators
- Toast notifications: success/error toasts for all user actions

**Acceptance:**
- [ ] Full flow works end-to-end with the test report DOCX
- [ ] Auto-resume works after page refresh
- [ ] Audit events logged for upload, generate, download
- [ ] File cleanup on session delete
- [ ] Error recovery: retry button on generation failure
- [ ] No console errors or unhandled promise rejections
- [ ] DOCX output has all sections filled with narrative text
- [ ] DOCX output has chart images embedded
- [ ] PDF output matches DOCX content

**Commit:** `feat(report): end-to-end integration polish and audit logging`

## Verification

```bash
# Full end-to-end test:
# 1. Start all services: backend, sanitization-service, Gotenberg, Redis
# 2. Navigate to http://localhost:5173/executive-report
# 3. Upload test-templates/executive/L8250203 - Internal Pentest Report_Anonimizado.docx
# 4. Verify sanitization review shows side-by-side diff
# 5. Add a deny list term, verify re-sanitization
# 6. Edit metadata, approve
# 7. Verify generation progress through 6 stages
# 8. Verify PDF preview loads
# 9. Type a correction in chat: "Make the executive summary more concise"
# 10. Verify PDF updates after correction
# 11. Download DOCX and PDF, verify contents
# 12. Refresh page, verify session auto-resume
# 13. Delete session, verify cleanup

# Backend audit log check:
curl http://localhost:3001/api/audit?action=report.upload -b cookies.txt
curl http://localhost:3001/api/audit?action=report.generate -b cookies.txt
```

## Success Criteria

- Chat corrections work with targeted section regeneration
- User message re-sanitized before LLM, revised text de-sanitized after LLM
- PDF regenerates after each correction
- Best-effort parsing handles various input formats with appropriate warnings
- Warning display in frontend is informative and non-blocking
- Full end-to-end flow: upload any DOCX -> sanitize -> review -> generate -> correct -> download
- Auto-resume works across page refreshes
- Audit trail captures all significant actions
- Both DOCX and PDF outputs contain complete report with charts
- Generated report structure matches Template Executivo.pdf sections
