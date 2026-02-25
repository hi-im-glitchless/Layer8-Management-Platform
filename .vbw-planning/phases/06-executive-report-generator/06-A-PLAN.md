---
phase: "06"
plan: "06-A"
title: "Python Report Foundation -- Theme, Charts, Compliance, Prompts"
wave: 1
depends_on: []
cross_phase_deps: []
skills_used:
  - fastapi-expert
  - python-testing-patterns
must_haves:
  - "matplotlib added to sanitization-service/requirements.txt"
  - "report_theme.py exports SEVERITY_COLORS, BRAND_COLORS, CHART_FONTS dicts"
  - "chart_renderer.py renders pie, horizontal bar, stacked bar, radar, score card to PNG bytes"
  - "compliance_matrix.py exports COMPLIANCE_MATRIX dict mapping category to frameworks"
  - "report_extraction_prompt.py builds Pass 1 system+user prompt from sanitized paragraphs"
  - "report_narrative_prompt.py builds Pass 2 system+user prompt from findings+metrics+chart data"
  - "report_builder.py has ReportBuilder class with build_report(skeleton_path, report_data) -> bytes"
  - "All new Python services have unit tests"
---

## Objective

Build the six core Python services that power the executive report pipeline. These are pure computation and prompt-building modules with no route wiring yet -- that happens in Plan 06-C. Every module is independently testable.

## Context

- `@sanitization-service/app/services/docx_parser.py` -- paragraph extraction pattern to reuse for parsing uploaded reports
- `@sanitization-service/app/services/analysis_prompt.py` -- prompt builder pattern (system + user prompts, structured output schema)
- `@sanitization-service/requirements.txt` -- add matplotlib dependency here
- `@06-CONTEXT.md` decisions: chart engine=matplotlib, skeleton DOCX per language, python-docx programmatic build, deterministic risk scoring, static compliance matrix + LLM refinement, 2-pass LLM pipeline
- Template Executivo.pdf at `test-templates/executive/` -- reference for chart colors and report structure

## Tasks

### Task 1: Add matplotlib dependency + report_theme.py constants

**Files:**
- `sanitization-service/requirements.txt` (modify)
- `sanitization-service/app/services/report_theme.py` (new)

**What:** Add `matplotlib>=3.9` to requirements.txt. Create `report_theme.py` with color constants matching Template Executivo: SEVERITY_COLORS (critical=#C62828, high=#E53935, medium=#FB8C00, low=#43A047, info=#1E88E5), BRAND_COLORS (primary=#1A237E, secondary=#283593, accent=#42A5F5, background=#F5F5F5, text=#212121, confidential=#C62828), CHART_FONTS (title_size=14, label_size=10, tick_size=8, font_family='Arial'). Also include a `configure_matplotlib()` function that sets the default rcParams for all charts (no GUI backend, font family, DPI=200).

**Acceptance:**
- [ ] `matplotlib>=3.9` present in requirements.txt
- [ ] `report_theme.py` exports SEVERITY_COLORS, BRAND_COLORS, CHART_FONTS as typed dicts
- [ ] `configure_matplotlib()` sets `matplotlib.use('Agg')` and applies rcParams
- [ ] Module imports without error

**Commit:** `feat(report): add matplotlib dependency and report theme constants`

### Task 2: chart_renderer.py -- five chart types to PNG

**Files:**
- `sanitization-service/app/services/chart_renderer.py` (new)
- `sanitization-service/tests/test_chart_renderer.py` (new)

**What:** Create `chart_renderer.py` with a `ChartRenderer` class that calls `configure_matplotlib()` on init and provides five methods, each returning PNG bytes via `BytesIO`:

1. `render_severity_pie(data: dict[str, int]) -> bytes` -- pie chart with severity colors, percentage labels, shadow effect
2. `render_category_bar(data: dict[str, int]) -> bytes` -- horizontal bar chart, sorted descending, category labels on y-axis
3. `render_stacked_severity_bar(data: dict[str, dict[str, int]]) -> bytes` -- stacked bar: categories on x-axis, severity segments stacked, legend
4. `render_compliance_radar(scores: dict[str, float]) -> bytes` -- radar/spider chart with 5 framework axes (ISO 27001, NIST CSF, GDPR, PCI-DSS, CIS Controls), filled polygon
5. `render_risk_score_card(score: float, label: str) -> bytes` -- circular gauge/donut chart with score number in center, color gradient (green->yellow->red)

All charts use SEVERITY_COLORS/BRAND_COLORS from report_theme. Each chart renders at 6x4 inches, 200 DPI, tight_layout. Unit tests verify each method returns valid PNG bytes (check PNG header `\x89PNG`).

**Acceptance:**
- [ ] All five render methods exist and return bytes starting with PNG header
- [ ] Charts use colors from report_theme.py
- [ ] Unit tests pass for all five chart types
- [ ] No GUI backend used (Agg only)

**Commit:** `feat(report): add chart renderer with five chart types`

### Task 3: compliance_matrix.py -- static framework mapping

**Files:**
- `sanitization-service/app/services/compliance_matrix.py` (new)
- `sanitization-service/tests/test_compliance_matrix.py` (new)

**What:** Create `compliance_matrix.py` with:

1. `COMPLIANCE_MATRIX: dict[str, list[str]]` -- maps vulnerability categories to affected compliance frameworks. Categories: Authentication, Authorization, Injection, XSS, CSRF, Cryptography, Configuration, Information Disclosure, Session Management, File Upload, API Security, Network Security, Access Control, Logging/Monitoring. Each maps to subset of [ISO 27001, NIST CSF, GDPR, PCI-DSS, CIS Controls].

2. `compute_compliance_scores(findings: list[dict]) -> dict[str, float]` -- takes extracted findings (each with category, severity), computes per-framework risk score 0-100 based on how many findings affect that framework weighted by severity.

3. `compute_risk_score(severity_counts: dict[str, int]) -> float` -- deterministic formula: `(critical*15 + high*10 + medium*5 + low*2) / max_possible * 100` where max_possible = total_findings * 15. Returns 0-100 float.

4. `RISK_LEVEL_THRESHOLDS` -- dict mapping score ranges to risk levels (Critical: 75-100, High: 50-74, Medium: 25-49, Low: 0-24).

Unit tests verify score computation with known inputs and framework mapping completeness.

**Acceptance:**
- [ ] COMPLIANCE_MATRIX covers 14+ vulnerability categories, each with 1-5 frameworks
- [ ] `compute_compliance_scores()` returns scores for all 5 frameworks
- [ ] `compute_risk_score()` matches deterministic formula
- [ ] Unit tests pass with edge cases (empty findings, all-critical, single finding)

**Commit:** `feat(report): add compliance matrix and risk scoring`

### Task 4: report_extraction_prompt.py -- Pass 1 LLM prompt builder

**Files:**
- `sanitization-service/app/services/report_extraction_prompt.py` (new)
- `sanitization-service/tests/test_report_extraction_prompt.py` (new)

**What:** Create prompt builder for LLM Pass 1 (extraction). The prompt instructs the LLM to extract structured findings data from a sanitized technical report. Pattern follows `analysis_prompt.py`.

Functions:
1. `build_extraction_system_prompt(language: str) -> str` -- system prompt instructing the LLM to extract findings as JSON. Specifies output schema: `{ findings: [{ title, description, severity, cvss_score, category, affected_systems, remediation, business_impact }], metadata: { client_name, project_code, start_date, end_date, scope_summary }, warnings: [str] }`. Language parameter controls output language for warnings.

2. `build_extraction_user_prompt(sanitized_paragraphs: list[str], skeleton_schema: dict | None) -> str` -- user prompt containing: the sanitized report text (joined paragraphs with index markers), instruction to extract ALL findings including severity when available, instruction to flag missing data as warnings, skeleton schema if available (for structure awareness).

3. `validate_extraction_response(raw_json: str) -> dict` -- parse and validate the LLM response JSON against expected schema. Raise ValueError on invalid structure. Fill defaults for optional fields (cvss_score=None if missing, severity='medium' if unclear).

Unit tests verify prompt contains key instructions and validation handles valid/invalid JSON.

**Acceptance:**
- [ ] System prompt includes complete JSON output schema
- [ ] User prompt includes sanitized paragraph text with index markers
- [ ] `validate_extraction_response()` handles valid JSON, invalid JSON, missing fields
- [ ] Unit tests cover prompt structure and validation edge cases

**Commit:** `feat(report): add Pass 1 extraction prompt builder`

### Task 5: report_narrative_prompt.py + report_builder.py stubs

**Files:**
- `sanitization-service/app/services/report_narrative_prompt.py` (new)
- `sanitization-service/app/services/report_builder.py` (new)
- `sanitization-service/tests/test_report_narrative_prompt.py` (new)
- `sanitization-service/tests/test_report_builder.py` (new)

**What:** Create the Pass 2 prompt builder and the DOCX report builder.

**report_narrative_prompt.py:**
1. `build_narrative_system_prompt(language: str) -> str` -- system prompt for narrative generation. Output is JSON with ~12 section keys: executive_summary, risk_score_explanation, key_metrics_text, severity_analysis, category_analysis, key_threats, compliance_risk_text, top_vulnerabilities_text, strategic_recommendations (immediate/short/long/board), positive_aspects, conclusion. Style: executive-level, no jargon, business impact focus. Language drives output language.

2. `build_narrative_user_prompt(findings: list[dict], metrics: dict, compliance_scores: dict[str, float], risk_score: float, chart_descriptions: dict[str, str]) -> str` -- user prompt with all computed data: findings summary, severity counts, risk score, compliance scores, chart data descriptions. Instructs LLM to generate narrative for each section.

3. `validate_narrative_response(raw_json: str) -> dict` -- validate all 12 sections present, fill empty strings for missing optional sections.

**report_builder.py:**
1. `ReportBuilder` class with:
   - `__init__(self, skeleton_path: str)` -- loads skeleton DOCX into memory with python-docx
   - `build_report(self, report_data: dict, chart_images: dict[str, bytes]) -> bytes` -- fills skeleton with narrative text, replaces `[CHART: ...]` placeholders with chart images via `add_picture()`, populates cover page metadata (client, date, project code), returns DOCX bytes. Stub implementation that creates a minimal working DOCX.
   - `_replace_chart_placeholder(self, placeholder_text: str, image_bytes: bytes)` -- find paragraph containing placeholder text, replace with inline image
   - `_fill_text_section(self, section_key: str, text: str)` -- find heading matching section key, insert text paragraphs after it with skeleton body style

Unit tests verify prompt structure for narrative, validation for 12 sections, and ReportBuilder creates valid DOCX bytes.

**Acceptance:**
- [ ] Narrative system prompt specifies all 12 section keys
- [ ] Narrative user prompt includes findings, metrics, compliance scores
- [ ] `validate_narrative_response()` validates 12 sections
- [ ] `ReportBuilder.build_report()` returns valid DOCX bytes (ZIP signature check)
- [ ] Unit tests pass

**Commit:** `feat(report): add narrative prompt builder and report builder`

## Verification

```bash
cd /home/rl/Documents/Projects/Layer8/sanitization-service
pip install matplotlib>=3.9
python -c "from app.services.report_theme import SEVERITY_COLORS, BRAND_COLORS, configure_matplotlib; configure_matplotlib(); print('OK')"
python -c "from app.services.chart_renderer import ChartRenderer; r = ChartRenderer(); png = r.render_severity_pie({'High': 5, 'Medium': 10, 'Low': 3}); assert png[:4] == b'\\x89PNG'; print('OK')"
python -c "from app.services.compliance_matrix import compute_risk_score; assert 0 <= compute_risk_score({'critical': 2, 'high': 5, 'medium': 10, 'low': 3}) <= 100; print('OK')"
python -c "from app.services.report_extraction_prompt import build_extraction_system_prompt; p = build_extraction_system_prompt('en'); assert 'findings' in p; print('OK')"
python -c "from app.services.report_builder import ReportBuilder; print('OK')"
pytest tests/test_chart_renderer.py tests/test_compliance_matrix.py tests/test_report_extraction_prompt.py tests/test_report_narrative_prompt.py tests/test_report_builder.py -v
```

## Success Criteria

- All six Python service modules importable and functional
- matplotlib configured for headless rendering (Agg backend)
- Five chart types render to valid PNG bytes with correct colors
- Compliance matrix covers all major vulnerability categories
- Risk score formula is deterministic and auditable
- Both prompt builders produce structured prompts with complete JSON schemas
- ReportBuilder loads a skeleton DOCX and produces valid DOCX output
- All unit tests pass
