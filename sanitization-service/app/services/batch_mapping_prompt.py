"""LLM batch mapping prompt builder for interactive selection workflow.

Builds structured prompts that instruct the LLM to map user-selected text
from a document to Ghostwriter (GW) template fields. Used by the batch
selection flow in Phase 5.2 where users highlight multiple selections
and describe them in free-form chat.
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

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# GW field descriptions (shared with analysis_prompt)
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


def build_batch_mapping_system_prompt(
    reference_info: ReferenceTemplateInfo,
    few_shot_examples: list[FewShotExample] | None = None,
) -> str:
    """Build the system prompt for batch mapping of user-selected text.

    Establishes the LLM role, includes available GW fields from the
    reference template, and optional few-shot examples.

    Args:
        reference_info: Patterns from the matching reference template.
        few_shot_examples: Optional list of confirmed mappings for few-shot learning.

    Returns:
        System prompt string for LLM consumption.
    """
    sections: list[str] = []

    # Role establishment
    sections.append(
        "You are mapping user-selected text from a document to Ghostwriter "
        "template fields. The user has highlighted numbered selections from "
        "their penetration testing report template and described what each "
        "selection represents."
    )

    # Available GW fields
    sections.append(_build_gw_fields_section(reference_info.template_type))

    # Reference patterns
    sections.append(_build_reference_patterns_section(reference_info))

    # Few-shot examples (optional)
    if few_shot_examples:
        few_shot = _build_few_shot_section(few_shot_examples)
        if few_shot:
            sections.append(few_shot)

    # Output format
    sections.append(_build_output_format_section())

    return "\n\n".join(sections)


def build_batch_mapping_user_prompt(
    selections: list[dict],
    user_description: str,
) -> str:
    """Build the user prompt for initial batch mapping.

    Formats selections as a numbered list and appends the user's
    free-form description verbatim.

    Args:
        selections: List of dicts with selectionNumber, text, paragraphIndex.
        user_description: The user's free-form description of the selections.

    Returns:
        User prompt string for LLM consumption.
    """
    lines: list[str] = []

    lines.append("## Selections to Map\n")
    for sel in selections:
        num = sel.get("selectionNumber", sel.get("selection_number", 0))
        text = sel.get("text", "")
        para_idx = sel.get("paragraphIndex", sel.get("paragraph_index", 0))
        # Truncate long text for the prompt
        truncated = text[:200] + ("..." if len(text) > 200 else "")
        lines.append(f'#{num} (paragraph {para_idx}): "{truncated}"')

    lines.append("")
    lines.append("## User Description\n")
    lines.append(user_description)

    lines.append("")
    lines.append(
        "Map each numbered selection based on the user's description "
        "and the reference template fields. Return a JSON array."
    )

    return "\n".join(lines)


def build_remap_user_prompt(
    selections: list[dict],
    user_description: str,
    previous_mappings: list[dict],
) -> str:
    """Build the user prompt for re-mapping rejected selections.

    Similar to build_batch_mapping_user_prompt but only includes the
    specific selections being corrected and provides context of what
    was already confirmed.

    Args:
        selections: Only the rejected selections being re-described.
        user_description: The user's corrected description.
        previous_mappings: Context of already confirmed mappings.

    Returns:
        User prompt string for LLM consumption.
    """
    lines: list[str] = []

    # Confirmed context
    if previous_mappings:
        lines.append("## Already Confirmed Mappings\n")
        for mapping in previous_mappings:
            num = mapping.get("selectionNumber", mapping.get("selection_number", 0))
            gw_field = mapping.get("gwField", mapping.get("gw_field", ""))
            lines.append(f"#{num} -> {gw_field}")
        lines.append("")

    # Selections to re-map
    lines.append("## Selections to Re-map\n")
    lines.append(
        "The following selections were rejected and need to be re-mapped "
        "based on the user's updated description:"
    )
    lines.append("")

    for sel in selections:
        num = sel.get("selectionNumber", sel.get("selection_number", 0))
        text = sel.get("text", "")
        para_idx = sel.get("paragraphIndex", sel.get("paragraph_index", 0))
        truncated = text[:200] + ("..." if len(text) > 200 else "")
        lines.append(f'#{num} (paragraph {para_idx}): "{truncated}"')

    lines.append("")
    lines.append("## User Description\n")
    lines.append(user_description)

    lines.append("")
    lines.append(
        "Re-map only the listed selections based on the user's updated "
        "description. Return a JSON array with entries only for these "
        "selections."
    )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Section builders (internal helpers)
# ---------------------------------------------------------------------------


def _build_gw_fields_section(template_type: TemplateType) -> str:
    """Build the available GW fields section with descriptions and marker types."""
    lines = ["## Available GW Fields\n"]
    lines.append("Map selections to these fields. Use the correct marker_type for each.\n")

    features = TEMPLATE_TYPE_FEATURES.get(template_type, [])
    if features:
        lines.append(f"Template type '{template_type}' features: {', '.join(features)}\n")

    for field, desc in sorted(_GW_FIELD_DESCRIPTIONS.items()):
        marker = FIELD_MARKER_MAP.get(field, "text")
        lines.append(f"  {field:35s} [{marker:15s}] {desc}")

    return "\n".join(lines)


def _build_reference_patterns_section(ref: ReferenceTemplateInfo) -> str:
    """Build reference template patterns section."""
    lines = [
        f"## Reference Template Patterns ({ref.template_type}/{ref.language})\n",
        f"Total unique patterns: {ref.placeholder_count}\n",
    ]

    for p in ref.patterns:
        ctx = p.context[:120].replace("\n", " ") if p.context else ""
        lines.append(
            f"  {p.marker_type:15s} | {p.gw_field:35s} | {p.pattern:40s} | {ctx}"
        )

    return "\n".join(lines)


def _build_few_shot_section(examples: list[FewShotExample]) -> str | None:
    """Build the optional few-shot examples section.

    Returns None if examples list is empty.
    """
    if not examples:
        return None

    lines = [
        "## Previous Successful Mappings\n",
        "These section-to-field mappings were confirmed correct in previous "
        "template adaptations:\n",
    ]

    for i, ex in enumerate(examples, start=1):
        lines.append(
            f'  {i}. Section: "{ex.normalized_section_text}" -> '
            f"GW Field: {ex.gw_field} [{ex.marker_type}] "
            f"(confirmed {ex.usage_count} times)"
        )

    return "\n".join(lines)


def _build_output_format_section() -> str:
    """Build the JSON output format instruction."""
    schema = [
        {
            "selectionNumber": "int (the #N reference number)",
            "gwField": "str (GW field path from Available GW Fields)",
            "markerType": "str (text|paragraph_rt|run_rt|table_row_loop|control_flow)",
            "confidence": "float (0.0-1.0)",
            "rationale": "str (brief reason for this mapping)",
        }
    ]

    example = [
        {
            "selectionNumber": 1,
            "gwField": "client.short_name",
            "markerType": "text",
            "confidence": 0.95,
            "rationale": "Selection contains the client name placeholder",
        },
        {
            "selectionNumber": 2,
            "gwField": "finding.description_rt",
            "markerType": "paragraph_rt",
            "confidence": 0.85,
            "rationale": "Selection describes the vulnerability in detail",
        },
    ]

    lines = [
        "## Output Format\n",
        "Return ONLY a valid JSON array (no markdown fences, no commentary).\n",
        "Schema:\n",
        "```json",
        json.dumps(schema, indent=2),
        "```\n",
        "Example:\n",
        "```json",
        json.dumps(example, indent=2),
        "```",
    ]
    return "\n".join(lines)
