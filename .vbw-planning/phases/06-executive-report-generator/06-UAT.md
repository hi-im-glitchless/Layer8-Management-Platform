---
phase: "06"
plan_count: 5
status: paused
started: "2026-02-15"
completed: null
total_tests: 10
passed: 4
skipped: 0
issues: 2
---

# UAT: Phase 6 -- Executive Report Generator

Browser-only manual testing as a normal user.

## P01-T1: Page loads without errors
**Plan:** 06-D -- Frontend Executive Report Module
**Scenario:** Navigate to http://localhost:5173/executive-report in the browser.
**Expected:** Page loads with 5-step wizard indicator (Upload, Sanitize & Review, Generate, Review, Download). Upload step shown with drag-and-drop area. No console errors.
**Result:** PASS

## P01-T2: Upload DOCX and auto-advance
**Plan:** 06-C -- Skeleton DOCX + Pipeline
**Scenario:** Upload the test report DOCX via drag-and-drop or file picker. Use `test-templates/executive/L8250203 - Internal Pentest Report_Anonimizado.docx` if available, or any DOCX.
**Expected:** Progress display shows upload stages (uploading, detecting language, sanitizing, extracting). Wizard auto-advances to "Sanitize & Review" step when pipeline completes.
**Result:** PASS

## P02-T1: Sanitization diff view with entity highlights
**Plan:** 06-D -- Frontend Executive Report Module
**Scenario:** On the Sanitize & Review step, check the side-by-side diff panel.
**Expected:** Left panel shows original text, right panel shows sanitized text. Entity replacements (e.g. [PERSON_1], [ORG_1]) highlighted in color. Entity type legend visible. Summary row shows entity/paragraph counts.
**Result:** PASS

## P02-T2: Deny list and metadata editors
**Plan:** 06-D -- Frontend Executive Report Module
**Scenario:** Add a term to the deny list (e.g. "Acme Corp"). Check the metadata editor fields.
**Expected:** Deny list chip appears, re-sanitization triggers (loading state visible). Metadata editor shows 5 fields (Client Name, Project Code, Start Date, End Date, Scope Summary) with LLM-extracted values pre-filled.
**Result:** PASS

## P03-T1: Generation progress through 6 stages
**Plan:** 06-C -- Pipeline + 06-D -- Frontend
**Scenario:** Click "Approve & Generate" to advance to the Generate step.
**Expected:** Progress display shows 6 stages sequentially: Extracting findings, Computing risk metrics, Generating charts, Writing executive narrative, Building report document, Converting to PDF. Wizard auto-advances to Review when done.
**Result:** ISSUE -- No progress display visible during generation, but wizard did advance to Generate step. Missing 6-stage progress UI.

## P04-T1: PDF preview loads in Review step
**Plan:** 06-D -- Frontend Executive Report Module
**Scenario:** On the Review step, check the PDF preview panel.
**Expected:** PDF preview renders on the left (60% width). Contains report sections, chart images, and formatted text. "Satisfied" and "Regenerate" buttons visible.
**Result:** ISSUE -- Multiple problems:
1. Headers/footers and text inside boxes not parsed during sanitization
2. All IP addresses mapped to same placeholder [IP_ADDRESS_1] instead of incrementing ([IP_ADDRESS_1], [IP_ADDRESS_2], etc.) -- will break de-sanitization
3. Wrong mappings shown with no ability to remove them (need X button on each mapping)
4. Left panel shows plain text instead of PDF preview with highlighted entities (should match template adapter pattern)
5. User wants: select text in PDF to add to mapping table, pick entity type from dropdown, mappings shown in toggleable right panel (not deny list)
6. Deny list concept should be replaced with an editable mapping table (add/edit/delete entries)
7. Warnings during generation suggest incomplete parsing of document structure

## P04-T2: Chat corrections panel
**Plan:** 06-E -- Corrections Flow
**Scenario:** On the Review step, type a correction in the chat panel (right side), e.g. "Make the executive summary more concise" or "Add more detail to the recommendations".
**Expected:** Chat panel shows streaming LLM response. After completion, a section-update badge appears indicating which section was modified. PDF preview refreshes with updated content (may show "Regenerating..." overlay briefly).
**Result:**

## P05-T1: DOCX and PDF download
**Plan:** 06-D -- Frontend Executive Report Module
**Scenario:** Click "Satisfied" to advance to the Download step.
**Expected:** Two download buttons visible: DOCX (primary) and PDF (secondary). Report summary card shows file name, detected language, risk score, and findings count. "Generate Another" button present.
**Result:**

## P05-T2: Downloaded files have content
**Plan:** 06-C -- Skeleton DOCX + Pipeline
**Scenario:** Download both the DOCX and PDF files. Open them.
**Expected:** DOCX contains filled sections with narrative text, embedded chart images, metadata on cover page. PDF matches DOCX content.
**Result:**

## P06-T1: Session auto-resume
**Plan:** 06-E -- E2E Polish
**Scenario:** Refresh the page (F5) while on any step after Upload.
**Expected:** Wizard resumes at the same step (or the furthest reached step). No data loss -- session state preserved.
**Result:**
