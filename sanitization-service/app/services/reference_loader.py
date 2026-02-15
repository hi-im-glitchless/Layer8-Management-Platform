"""Reference template loader and Jinja2 pattern extractor.

Loads the matching GW reference template by (type, language), parses it,
and extracts all Jinja2 placeholder patterns with their marker types and
surrounding context.
"""
import hashlib
import logging
import re
from pathlib import Path

from app.models.adapter import (
    FIELD_MARKER_MAP,
    Jinja2Pattern,
    ReferenceTemplateInfo,
    TemplateLanguage,
    TemplateType,
)
from app.services.docx_parser import DocxParserService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Template directory and file mapping
# ---------------------------------------------------------------------------

# Resolve relative to project root (two levels up from this file)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
TEMPLATE_DIR = _PROJECT_ROOT / "test-templates" / "ghost-templates"

# Maps (type, language) -> filename. For pt-pt, use "O Cliente" variants as default.
TEMPLATE_MAP: dict[tuple[str, str], str] = {
    ("web", "en"): "Web_-_EN_2025_-_v2.0_m6w3nHW_FuwLOkd.docx",
    ("web", "pt-pt"): "Web_-_O_Cliente_-_PT_2025_-_v2.0.docx",
    ("internal", "en"): "Interna_-_EN_2025_-_v2.0.docx",
    ("internal", "pt-pt"): "Interna_-_O_Cliente_-_PT_2025_-_v2.0_yejFaQl.docx",
    ("mobile", "en"): "Mobile_-_EN_2025_v2.0.docx",
    ("mobile", "pt-pt"): "Mobile_-_O_Cliente_-_PT_2025_v2.0.docx",
}

# Alternate PT variants ("A Cliente" gendered forms) -- identical placeholder
# structure, only static text differs. All 8 template files are accounted for.
PT_ALTERNATE_MAP: dict[tuple[str, str], str] = {
    ("web", "pt-pt"): "Web_-_A_Cliente_-_PT_2025_-_v2.0.docx",
    ("internal", "pt-pt"): "Interna_-_A_Cliente_-_PT_2025_-_v2.0_dnZFPJ2.docx",
}

# ---------------------------------------------------------------------------
# Static field-path lookup for placeholder names
# ---------------------------------------------------------------------------

# Map raw placeholder text to canonical GW field paths.
# Covers common patterns found across all 8 reference templates.
_PLACEHOLDER_TO_GW_FIELD: dict[str, str] = {
    # Simple text
    "client.short_name": "client.short_name",
    "project.start_date": "project.start_date",
    "project.end_date": "project.end_date",
    "report_date": "report_date",
    "team[0].name": "team[0].name",
    "team[0].email": "team[0].email",
    "totals.findings": "totals.findings",
    "item.scope": "item.scope",
    # Findings
    "finding.title": "finding.title",
    "finding['title']": "finding['title']",
    "finding.cvss_score": "finding.cvss_score",
    "finding.severity_rt": "finding.severity_rt",
    "finding.classification_rt": "finding.classification_rt",
    "finding.affected_entities_rt": "finding.affected_entities_rt",
    "finding.cvss_vector_link_rt": "finding.cvss_vector_link_rt",
    # Rich text paragraph
    "finding.description_rt": "finding.description_rt",
    "finding.impact_rt": "finding.impact_rt",
    "finding.recommendation_rt": "finding.recommendation_rt",
    "finding.replication_steps_rt": "finding.replication_steps_rt",
    # Loop counters / namespace
    "'%02d' % loop.index": "'%02d' % loop.index",
    '"%02d"|format(ns.counter + 1)': '"%02d"|format(ns.counter + 1)',
    '"%02d"|format(ns1.counter)': '"%02d"|format(ns1.counter)',
}

# ---------------------------------------------------------------------------
# Jinja2 pattern regexes
# ---------------------------------------------------------------------------

# Order matters: check paragraph_rt and run_rt before generic text
_PATTERN_REGEXES: list[tuple[str, re.Pattern[str], str]] = [
    # Paragraph rich text markers: {{p field }}
    ("paragraph_rt", re.compile(r"\{\{p\s+(\S+)\s*\}\}"), "{{p %s }}"),
    # Run rich text markers: {{r field }}
    ("run_rt", re.compile(r"\{\{r\s+(\S+)\s*\}\}"), "{{r %s }}"),
    # Table row loop markers: {%tr ... %}
    ("table_row_loop", re.compile(r"\{%tr\s+(.+?)\s*%\}"), "{%%tr %s %%}"),
    # Other control flow: {% ... %} (excluding {%tr)
    ("control_flow", re.compile(r"\{%(?!tr)\s+(.+?)\s*%\}"), "{%% %s %%}"),
    # Simple text placeholders: {{ expr }} (excluding {{p and {{r)
    ("text", re.compile(r"\{\{(?!p\s)(?!r\s)\s*([^}]+?)\s*\}\}"), "{{ %s }}"),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def load_reference_template(
    template_type: TemplateType, language: TemplateLanguage
) -> ReferenceTemplateInfo:
    """Load and parse a reference template, returning extracted patterns.

    Args:
        template_type: One of "web", "internal", "mobile".
        language: One of "en", "pt-pt".

    Returns:
        ReferenceTemplateInfo with filename, patterns, and placeholder count.

    Raises:
        FileNotFoundError: If no template file exists for the given combo.
        ValueError: If the template type/language combination is not mapped.
    """
    key = (template_type, language)
    filename = TEMPLATE_MAP.get(key)
    if filename is None:
        raise ValueError(
            f"No reference template mapped for type={template_type!r}, "
            f"language={language!r}. Valid combos: {list(TEMPLATE_MAP.keys())}"
        )

    filepath = TEMPLATE_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(
            f"Reference template file not found: {filepath}"
        )

    file_bytes = filepath.read_bytes()
    patterns = extract_jinja2_patterns(file_bytes)

    return ReferenceTemplateInfo(
        template_type=template_type,
        language=language,
        filename=filename,
        patterns=patterns,
        placeholder_count=len(patterns),
    )


def get_reference_template_hash(
    template_type: TemplateType, language: TemplateLanguage
) -> str:
    """Return the SHA-256 hex digest of the reference template file."""
    key = (template_type, language)
    filename = TEMPLATE_MAP.get(key)
    if filename is None:
        raise ValueError(f"No reference template for {key}")

    filepath = TEMPLATE_DIR / filename
    return hashlib.sha256(filepath.read_bytes()).hexdigest()


def extract_jinja2_patterns(file_bytes: bytes) -> list[Jinja2Pattern]:
    """Parse a DOCX file and extract all Jinja2 placeholder patterns.

    Scans paragraph text, table cell text, and header/footer text for
    Jinja2 expressions. Deduplicates by (marker_type, raw_match) pair.

    Args:
        file_bytes: Raw bytes of the reference DOCX template.

    Returns:
        Sorted list of unique Jinja2Pattern objects.
    """
    parser = DocxParserService()
    doc = parser.parse(file_bytes)

    # Gather (paragraph_text, source_label) tuples from all document parts
    text_sources: list[tuple[str, str]] = []

    for i, para in enumerate(doc.paragraphs):
        if para.text.strip():
            text_sources.append((para.text, f"paragraph[{i}]"))

    for ti, table in enumerate(doc.tables):
        for ri, row in enumerate(table.rows):
            for ci, cell in enumerate(row.cells):
                for pi, para in enumerate(cell.paragraphs):
                    if para.text.strip():
                        text_sources.append(
                            (para.text, f"table[{ti}].row[{ri}].cell[{ci}].para[{pi}]")
                        )

    for si, section in enumerate(doc.sections):
        for pi, para in enumerate(section.header_paragraphs):
            if para.text.strip():
                text_sources.append(
                    (para.text, f"section[{si}].header[{pi}]")
                )
        for pi, para in enumerate(section.footer_paragraphs):
            if para.text.strip():
                text_sources.append(
                    (para.text, f"section[{si}].footer[{pi}]")
                )

    # Extract patterns using regexes
    seen: set[tuple[str, str]] = set()  # (marker_type, raw_match)
    patterns: list[Jinja2Pattern] = []

    for text, source in text_sources:
        for marker_type, regex, _fmt in _PATTERN_REGEXES:
            for match in regex.finditer(text):
                raw = match.group(1).strip()
                dedup_key = (marker_type, raw)
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                gw_field = _resolve_gw_field(raw, marker_type)
                context_text = text[:200] if len(text) > 200 else text

                patterns.append(
                    Jinja2Pattern(
                        pattern=match.group(0),
                        marker_type=marker_type,
                        gw_field=gw_field,
                        context=context_text,
                    )
                )

    # Sort by marker type then by gw_field for deterministic output
    patterns.sort(key=lambda p: (p.marker_type, p.gw_field))
    return patterns


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _resolve_gw_field(raw_placeholder: str, marker_type: str) -> str:
    """Map a raw placeholder expression to a canonical GW field path.

    Falls back to the raw expression if no static mapping exists.
    """
    # Direct lookup
    if raw_placeholder in _PLACEHOLDER_TO_GW_FIELD:
        return _PLACEHOLDER_TO_GW_FIELD[raw_placeholder]

    # For control flow / table row loops, use the expression itself
    if marker_type in ("control_flow", "table_row_loop"):
        return raw_placeholder

    # Fallback: return raw placeholder as the field path
    return raw_placeholder
