# Phase 05: Template Adapter — Core Discussion

**Date:** 2026-02-13
**Phase:** 5 of 9
**Goal:** LLM-powered Jinja2 insertion with pixel-perfect preview, iterative feedback loop

## User Vision

Pentesters upload a blank client-branded DOCX report template. The system uses LLM intelligence to analyze the document structure, map sections to Ghostwriter fields, and insert Jinja2 placeholders — producing a GW-compatible template the user downloads and manually uploads to Ghostwriter. The entire process is a guided 5-step wizard with iterative feedback via chat.

## Essential Features

### 5-Step Wizard Flow
1. **Upload + Configure** — File upload (DOCX only) + template type (Web/Internal/Mobile) + language (EN/PT-PT) dropdowns
2. **Analysis** — LLM analyzes parsed DOCX structure, produces a visual mapping table (Template Section → GW Field with confidence). User reviews and corrects via chat.
3. **Adaptation** — System applies Jinja2 placeholders to the DOCX using structured instructions. Progress steps shown (no raw LLM output).
4. **Preview + Feedback** — Rendered PDF preview (using single local GW dummy report) + chat panel for iterative corrections. Soft limit warning after 5 iterations.
5. **Download** — Clean DOCX with Jinja2 placeholders. No metadata sidecar. Audit log captures everything.

### Two-Pass LLM Strategy
- **Pass 1 (Analysis):** LLM receives parsed DOCX structure JSON + matching reference template Jinja2 patterns. Outputs a mapping plan (which document sections map to which GW fields). Also validates template type selection.
- **Pass 2 (Insertion):** Based on approved mapping plan, LLM generates structured JSON instructions (e.g., `{action: "replace", paragraph: 5, text: "{{ client.short_name }}"}`). Python code applies instructions to DOCX via python-docx, preserving all original formatting.

### Separation of Concerns
- **LLM decides:** What maps where (semantic section matching, field identification)
- **System handles:** How to insert it (rich text markers auto-applied by field type, custom Jinja2 features injected by template-type-aware rules engine, Jinja2 syntax validation before applying to DOCX)

## Technical Preferences

### LLM Input
- Parsed DOCX structure JSON from Phase 4 parser (paragraphs, tables, headers, styles)
- Matching reference template (one, based on type+language selection) included in prompt
- Model: Sonnet 4.5 (per existing per-feature model config decision)

### Template Processing
- LLM outputs structured instructions, Python applies them — LLM never touches binary DOCX
- Rich text markers ({{p}}, {{r}}, {%tr%}) auto-applied based on field data type (deterministic mapping from Phase 4 research)
- Custom Jinja2 features (filter_type(), namespace counters, scope loops) injected by template-type-aware rules engine — not LLM-generated
- Jinja2 syntax validated against whitelist of known-valid patterns before applying to DOCX
- Client template formatting (fonts, colours, margins, branding) preserved exactly — only text content modified

### Preview Rendering
- Single local GW instance with one dummy report (Report ID 1) — always used for preview
- No report selector needed — same dummy data validates all adaptations
- Rendered via Phase 4 pipeline: template_renderer → Gotenberg → PDF → react-pdf

### Wizard State Management
- Auto-save wizard state to session (step, uploaded template, mapping plan, iteration history)
- Resume on navigation return — essential for multi-step process
- Checkpoint after each successful step — retry from last good state on LLM failure
- Back button navigates to any completed step

### Error Handling
- Checkpoint + retry from last good state (not full restart)
- LLM validation in Pass 1 checks if document is a pentest report template (warns if not)
- LLM warns + best-effort mapping for unusual template structures
- Progress steps with status during processing (no raw streaming for structured operations)
- Chat feedback uses SSE streaming from Phase 3 for conversational responses

## Boundaries

### In Scope (Phase 5)
- Blank client DOCX → GW-compatible template with Jinja2 placeholders
- All three template types: Web, Internal, Mobile
- Both languages: EN, PT-PT
- Chat-based feedback for iterations
- Session-scoped storage with optional save to persistent library
- Audit logging of all LLM interactions, mapping plans, reference template hashes

### Out of Scope (Phase 5)
- Inline PDF annotations (deferred to later phase)
- Modifying existing GW templates (Phase 7: Modification & Bulk)
- Translation (Phase 6)
- Bulk upload queue (Phase 7)
- Auto-push to Ghostwriter (v2: direct GW integration)
- Executive report generation (Phase 8)

## Acceptance Criteria

1. User uploads a blank client DOCX and selects template type + language
2. LLM analyzes structure and presents a mapping table; user can correct via chat
3. System applies Jinja2 placeholders preserving original formatting
4. Preview renders adapted template with GW dummy data as PDF
5. User iterates via chat until satisfied (soft warning after 5 rounds)
6. User downloads clean DOCX ready for GW upload
7. Wizard state persists across page navigation
8. All three template types (Web, Internal, Mobile) produce valid GW-compatible output
9. Reference template hash logged in audit trail
10. Invalid Jinja2 syntax caught before applying to DOCX

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Blank client DOCX as input (not existing GW templates) | Core value proposition — converting new client templates |
| 2 | 5-step wizard UI | Clear separation: upload → analyze → adapt → preview → download |
| 3 | User selects type + language, LLM validates | User intent + LLM sanity check — best of both |
| 4 | Download DOCX only (no GW push) | v1 constraint, manual upload to GW |
| 5 | Parsed DOCX structure JSON as LLM input | Structured data = fewer hallucinations, precise paragraph references |
| 6 | Two-pass: analyze then insert | User validates mapping before changes are applied |
| 7 | Single matching reference template in prompt | Token-efficient, type+language-specific guidance |
| 8 | LLM outputs structured instructions, Python applies | Preserves formatting, deterministic application |
| 9 | Rich text markers auto-applied by field type | Removes LLM error source, mapping is deterministic |
| 10 | Template-type-aware rules engine for custom Jinja2 | filter_type(), namespaces, loops are deterministic patterns |
| 11 | Rendered preview with GW dummy data (single report) | Proves placeholders work, no report selector needed |
| 12 | Chat-style feedback (annotations deferred) | Reuses Phase 3 SSE streaming, lower complexity |
| 13 | Soft iteration limit (warn after 5) | Balances flexibility with credit management |
| 14 | Mapping plan as visual table + chat corrections | Scannable, non-technical, correctable |
| 15 | Checkpoint + retry from last good state | Protects user from LLM/network failures |
| 16 | Progress steps (no raw streaming during processing) | Clean UX; streaming only for chat responses |
| 17 | Validate Jinja2 syntax against whitelist before applying | Catch errors before DOCX modification |
| 18 | Preserve client formatting exactly | Client branding is critical, only text content changes |
| 19 | Session-scoped with optional save | Clean by default, persistent library as bonus |
| 20 | LLM validates template is a pentest report (Pass 1) | Part of analysis, no extra processing step |
| 21 | Auto-save wizard state to session | Resume on navigation return, essential for multi-step |
| 22 | Back button to any completed step | Standard wizard UX, users expect this |
| 23 | Top-level 'Template Adapter' sidebar route | Primary feature, prominent placement |
| 24 | DOCX only download, audit log captures metadata | Clean output for GW, compliance via audit trail |
| 25 | Reference template hash logged in audit | Reproducibility insurance |
| 26 | Separate routes, shared components with Phase 8 | Clean architecture, no cross-feature dependencies |
| 27 | LLM warns + best-effort for unusual templates | Practical for real-world template diversity |
