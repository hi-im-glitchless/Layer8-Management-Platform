"""LLM analysis prompt builder for template adapter Pass 1.

Builds structured prompts that instruct the LLM to map client template
sections to Ghostwriter (GW) field placeholders by comparing client DOCX
structure against reference template patterns.
"""
import json
import logging

from app.models.adapter import (
    FIELD_MARKER_MAP,
    TEMPLATE_TYPE_FEATURES,
    FewShotExample,
    ReferenceTemplateInfo,
    TemplateLanguage,
    TemplateType,
)
from app.models.docx import DocxStructure

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# GW field descriptions (derived from TemplateContext interface)
# ---------------------------------------------------------------------------

_GW_FIELD_DESCRIPTIONS: dict[str, str] = {
    "client.short_name": "Client short name (text)",
    "project.start_date": "Project start date (text, YYYY-MM-DD)",
    "project.end_date": "Project end date (text, YYYY-MM-DD)",
    "report_date": "Report creation date (text, YYYY-MM-DD)",
    "team[0].name": "Lead assessor name (text)",
    "team[0].email": "Lead assessor email (text)",
    "finding.title": "Finding title (text, used inside finding loops)",
    "finding['title']": "Finding title alternate syntax (text)",
    "finding.severity_rt": "Finding severity with color formatting (run rich text)",
    "finding.description_rt": "Finding description (paragraph rich text, HTML)",
    "finding.impact_rt": "Finding impact analysis (paragraph rich text, HTML)",
    "finding.recommendation_rt": "Finding remediation recommendation (paragraph rich text, HTML)",
    "finding.replication_steps_rt": "Finding replication steps (paragraph rich text, HTML)",
    "finding.classification_rt": "Finding type classification (text)",
    "finding.affected_entities_rt": "Affected entities list (text)",
    "finding.cvss_vector_link_rt": "CVSS vector with hyperlink (text)",
    "item.scope": "Scope entry (text, used inside scope table loop)",
    "totals.findings": "Total number of findings (text, computed)",
    "scope": "Scope entries (iterated via {%tr for item in scope %})",
    "findings": "Finding entries (iterated via loops)",
}


def build_analysis_system_prompt() -> str:
    """Return the system prompt establishing the LLM role.

    Kept separate so the Node.js backend can send it as the system message
    while the user message contains the analysis prompt.
    """
    return (
        "You are a document structure analyst specializing in penetration testing "
        "report templates. Your task is to analyze a client's DOCX template and map "
        "its sections to the correct Ghostwriter (GW) Jinja2 placeholders from a "
        "reference template.\n\n"
        "You must return ONLY valid JSON -- no markdown fences, no commentary outside "
        "the JSON structure. Be precise: only map sections that clearly correspond to "
        "a GW field. When uncertain, use a lower confidence score rather than guessing."
    )


def build_analysis_prompt(
    doc_structure: DocxStructure,
    reference_info: ReferenceTemplateInfo,
    template_type: TemplateType,
    language: TemplateLanguage,
    few_shot_examples: list[FewShotExample] | None = None,
) -> str:
    """Build the full analysis prompt for LLM Pass 1.

    The prompt contains five sections (plus an optional few-shot section):
    1. Condensed client DOCX structure (numbered paragraphs)
    2. Reference template patterns
    2b. Previous Successful Mappings (few-shot, only when examples provided)
    3. Available GW fields
    4. Output format specification (JSON schema + example)
    5. Mapping rules

    Args:
        doc_structure: Parsed structure of the client's DOCX template.
        reference_info: Patterns from the matching reference template.
        template_type: web, internal, or mobile.
        language: en or pt-pt.
        few_shot_examples: Optional list of confirmed mappings for few-shot learning.

    Returns:
        Complete prompt string ready for LLM consumption.
    """
    sections: list[str] = []

    # Section 1: Client document structure
    sections.append(_build_doc_structure_section(doc_structure))

    # Section 2: Reference template patterns
    sections.append(_build_reference_patterns_section(reference_info))

    # Section 2b: Few-shot examples (optional, between reference patterns and GW fields)
    if few_shot_examples:
        few_shot = _build_few_shot_section(few_shot_examples)
        if few_shot:
            sections.append(few_shot)

    # Section 3: Available GW fields
    sections.append(_build_gw_fields_section(template_type))

    # Section 4: Output format
    sections.append(_build_output_format_section())

    # Section 5: Rules
    sections.append(_build_rules_section(template_type, language))

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


def _build_doc_structure_section(doc: DocxStructure) -> str:
    """Section 1: Numbered, condensed client document paragraphs."""
    lines = ["## Client Template Structure\n"]
    lines.append("Below are the non-empty paragraphs from the client's DOCX template. "
                 "Each line shows: index | heading level (if any) | text (truncated to 200 chars).\n")

    para_count = 0
    for i, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue
        para_count += 1
        heading = f"H{para.heading_level}" if para.heading_level else "  "
        truncated = text[:200] + ("..." if len(text) > 200 else "")
        lines.append(f"[{i:3d}] {heading:3s} | {truncated}")

    # Include table locations
    if doc.tables:
        lines.append(f"\nTables found: {len(doc.tables)}")
        for ti, table in enumerate(doc.tables):
            row_count = len(table.rows)
            col_count = len(table.rows[0].cells) if table.rows else 0
            first_cell = ""
            if table.rows and table.rows[0].cells:
                first_cell = table.rows[0].cells[0].text.strip()[:80]
            lines.append(f"  Table {ti}: {row_count}x{col_count}, starts with: \"{first_cell}\"")

    lines.append(f"\nTotal non-empty paragraphs: {para_count}")
    return "\n".join(lines)


def _build_reference_patterns_section(ref: ReferenceTemplateInfo) -> str:
    """Section 2: Reference template Jinja2 patterns."""
    lines = [
        f"## Reference Template Patterns ({ref.template_type}/{ref.language})\n",
        f"File: {ref.filename}",
        f"Total unique patterns: {ref.placeholder_count}\n",
        "Each pattern shows: marker_type | GW field | raw pattern | context\n",
    ]

    for p in ref.patterns:
        ctx = p.context[:120].replace("\n", " ") if p.context else ""
        lines.append(
            f"  {p.marker_type:15s} | {p.gw_field:35s} | {p.pattern:40s} | {ctx}"
        )

    return "\n".join(lines)


def _build_few_shot_section(examples: list[FewShotExample]) -> str | None:
    """Build the optional few-shot examples section.

    Returns None if examples list is empty (no section injected).
    Inserted between Section 2 (reference patterns) and Section 3 (GW fields).
    """
    if not examples:
        return None

    lines = [
        "## Previous Successful Mappings\n",
        "These section-to-field mappings were confirmed correct in previous "
        "template adaptations for this type and language:\n",
    ]

    for i, ex in enumerate(examples, start=1):
        lines.append(
            f"  {i}. Section: \"{ex.normalized_section_text}\" -> "
            f"GW Field: {ex.gw_field} [{ex.marker_type}] "
            f"(confirmed {ex.usage_count} times)"
        )

    lines.append(
        "\nUse these as reference when mapping similar sections. "
        "They represent high-confidence patterns.\n"
    )

    return "\n".join(lines)


def _build_gw_fields_section(template_type: TemplateType) -> str:
    """Section 3: Available GW fields with descriptions and marker types."""
    lines = ["## Available GW Fields\n"]
    lines.append("Map client sections to these fields. Use the correct marker_type for each.\n")

    features = TEMPLATE_TYPE_FEATURES.get(template_type, [])
    if features:
        lines.append(f"Template type '{template_type}' features: {', '.join(features)}\n")

    for field, desc in sorted(_GW_FIELD_DESCRIPTIONS.items()):
        marker = FIELD_MARKER_MAP.get(field, "text")
        lines.append(f"  {field:35s} [{marker:15s}] {desc}")

    return "\n".join(lines)


def _build_output_format_section() -> str:
    """Section 4: JSON output schema with example."""
    schema = {
        "entries": [
            {
                "section_index": "int (paragraph index from Section 1)",
                "section_text": "str (first 100 chars of paragraph)",
                "gw_field": "str (GW field path from Section 3)",
                "placeholder_template": "str (Jinja2 expression, e.g. '{{ client.short_name }}')",
                "confidence": "float (0.0-1.0)",
                "marker_type": "str (text|paragraph_rt|run_rt|table_row_loop|control_flow)",
                "rationale": "str (brief reason for this mapping)",
            }
        ],
        "warnings": ["str (any ambiguities or unmapped sections worth noting)"],
    }

    example = {
        "entries": [
            {
                "section_index": 5,
                "section_text": "Client Name: ___________",
                "gw_field": "client.short_name",
                "placeholder_template": "{{ client.short_name }}",
                "confidence": 0.95,
                "marker_type": "text",
                "rationale": "Section contains a client name placeholder pattern",
            }
        ],
        "warnings": [],
    }

    lines = [
        "## Output Format\n",
        "Return a JSON object with this schema:\n",
        "```json",
        json.dumps(schema, indent=2),
        "```\n",
        "Example:\n",
        "```json",
        json.dumps(example, indent=2),
        "```",
    ]
    return "\n".join(lines)


def _build_rules_section(
    template_type: TemplateType, language: TemplateLanguage
) -> str:
    """Section 5: Mapping rules and constraints."""
    lines = [
        "## Mapping Rules\n",
        "1. Only map paragraphs that semantically match a GW field. Do NOT force mappings.",
        "2. Prefer high-confidence matches (>0.8). Use lower scores for partial matches.",
        "3. Flag ambiguous sections in the warnings array rather than guessing.",
        "4. Do NOT map boilerplate text, legal disclaimers, or purely structural headings.",
        "5. Use the correct marker_type for each GW field (see Available GW Fields).",
        "6. For rich text fields (_rt suffix), use {{p field }} or {{r field }} markers.",
        "7. For table row loops (scope, findings), use {%tr for ... %} markers.",
        "8. Multiple paragraphs may map to the same GW field if the document repeats it.",
        f"9. Target template type: {template_type}, language: {language}.",
    ]

    if template_type == "internal":
        lines.append(
            "10. Internal templates use filter_type() for category-based finding grouping "
            "(AD, Infrastructure, Physical, Servers, UAC, Web) and namespace counters."
        )
    else:
        lines.append(
            "10. This template type uses scope loops and affected_entities fields."
        )

    return "\n".join(lines)
