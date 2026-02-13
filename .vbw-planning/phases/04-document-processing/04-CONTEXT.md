# Phase 04: Document Processing — Context

**Date:** 2026-02-13
**Source:** User discussion via /vbw:vibe --discuss 4

## User Vision

Phase 4 builds the document processing infrastructure that both main features (Template Adapter and Executive Report Generator) depend on. The focus is on DOCX manipulation, pixel-perfect PDF rendering, Ghostwriter data integration, and reusable UI components for file upload and preview.

The PDF preview is specifically a **QA/annotation step** — users visually inspect adapted templates, highlight issues, and prompt the LLM to fix them. This is the human-in-the-loop safety net ensuring templates are ready for production Ghostwriter use with real client reports.

## Essential Features

### DOCX Parsing & Generation (DOCP-01, DOCP-02)
- **Full structure extraction**: text, paragraphs, headings, tables, images, styles, headers/footers
- **Library**: python-docx in the existing sanitization-service (FastAPI)
- Expanding the sanitization service avoids a new container; keeps all Python/NLP/document processing together

### PDF Generation (DOCP-03, DOCP-04)
- **Engine**: Gotenberg (LibreOffice wrapper) running as a Docker container
- Same in dev and production — Docker Compose for both
- PDF generation queued (LibreOffice is not thread-safe)

### Jinja2 Rendering (DOCP-05)
- Render Jinja2 templates with real Ghostwriter data for preview
- Python Jinja2 engine in the sanitization service

### Ghostwriter Integration (GHST-01, GHST-02)
- **GraphQL client** connecting to Ghostwriter at `https://localhost` (dev), dedicated instance in prod
- Ghostwriter is **always available** — no offline/fallback mode needed (dev=localhost, prod=VPN-internal dedicated instance)
- Fetch all data included in a report: metadata, client, findings, assessors, etc.
- **Map Jinja2 placeholders** in reference templates to determine exact GraphQL fields needed
- Static fixture JSON files for unit/integration tests only (tests must not depend on running GW)
- **API reference**: https://www.ghostwriter.wiki/features/graphql-api/common-api-actions, https://www.ghostwriter.wiki/features/graphql-api/using-the-hasura-console, https://www.ghostwriter.wiki/features/graphql-api/graphql-usage-examples
- **Test credentials**: Report ID 1, JWT token in backend/.env

### Reference Templates (GHST-03)
- The 8 templates in `test-templates/ghost-templates/` are **development references only**
- They teach the LLM what Jinja2 placeholder patterns to use (placement, naming, structure)
- They are NOT user-facing and do NOT appear in the app UI
- They stay in `test-templates/` as build/development artifacts
- Covers: Internal, Web, Mobile report types x EN, PT languages (plus PT client variants)

### Document UI (UIUX-07, UIUX-08)
- **File upload**: Reusable drag-and-drop component with file type validation and progress
- **PDF preview**: react-pdf (pdf.js wrapper) with page navigation
- Preview is foundation for Phase 5's annotation canvas (UIUX-10)

## Technical Preferences

- python-docx for all DOCX operations (parse, generate, modify)
- Gotenberg Docker container for DOCX-to-PDF conversion
- GraphQL client in Node.js backend (proxies to GW, caches results)
- react-pdf for browser-side PDF rendering
- Strict file upload validation: .docx/.pdf whitelist, 50MB max, MIME verification, randomised filenames, stored outside webroot in backend/uploads/, auto-cleanup on session expiry

## Boundaries

- No user-facing reference template management (they're dev-only assets)
- No offline/fallback mode for Ghostwriter (always reachable)
- PDF annotation is Phase 5 (UIUX-10), not Phase 4
- No template adaptation logic — that's Phase 5

## Acceptance Criteria

1. Upload a .docx file and get structured content extraction (text, headings, tables, styles, images)
2. Generate a .docx file with Jinja2 placeholders correctly placed
3. Convert .docx to pixel-perfect PDF via Gotenberg
4. Fetch real report data from Ghostwriter GraphQL API
5. Render a Jinja2 template with Ghostwriter data to produce a preview-ready document
6. Frontend file upload component with drag-and-drop, validation, progress
7. Frontend PDF viewer with page navigation
8. Static GW fixtures for test suite

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| python-docx in sanitization service | Best DOCX library; keeps Python processing co-located |
| Gotenberg for PDF | Pixel-perfect LibreOffice rendering; same in dev and prod |
| No GW offline mode | Dedicated GW instance always available in both environments |
| Reference templates as dev-only | Users never see them; LLM uses them to learn placeholder patterns |
| react-pdf for preview | Lightweight, good page navigation, foundation for annotation in Phase 5 |
| Strict upload validation | Security team's tool — MIME verification, size limits, randomised storage |
| GW GraphQL fields from template analysis | Examine actual Jinja2 placeholders to determine exact API fields needed |
