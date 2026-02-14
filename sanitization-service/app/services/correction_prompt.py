"""LLM correction prompt builder for placeholder verification flow.

Builds structured prompts that instruct the LLM to correct placeholder mappings
in a document. Used when users select text on the placeholder PDF and describe
corrections in chat (e.g., "#1 should be {{title}}", "#2 remove this").

The LLM receives the current mapping plan + user corrections and returns a
FULL updated mapping plan as structured JSON (same schema as Pass 1 output).
"""
import json
import logging

logger = logging.getLogger(__name__)


def build_correction_system_prompt() -> str:
    """Build the system prompt for correction of placeholder mappings.

    Establishes the LLM role as a correction assistant that modifies
    existing mapping plans based on user feedback.

    Returns:
        System prompt string for LLM consumption.
    """
    return (
        "You are a template adaptation assistant correcting placeholder mappings "
        "in a penetration testing report document.\n\n"
        "You receive:\n"
        "1. The current mapping plan (all section-to-field mappings)\n"
        "2. User correction instructions (may reference #N numbered selections)\n"
        "3. Context: selected text passages and surrounding paragraphs\n\n"
        "Your task:\n"
        "- Apply the user's corrections to produce an UPDATED mapping plan\n"
        "- Return the COMPLETE mapping plan with ALL entries (not just changes)\n"
        "- Modified entries should reflect the corrections\n"
        "- Removed entries (user says 'remove this') should be omitted\n"
        "- Added entries should be included with appropriate field mappings\n"
        "- All unchanged entries must be preserved exactly as-is\n\n"
        "CRITICAL RULES:\n"
        "- Return ONLY valid JSON, no markdown fences, no commentary\n"
        "- Use the exact same schema as the input mapping plan\n"
        "- Validate field names against available GW fields\n"
        "- Preserve confidence scores for unchanged entries\n"
        "- Set confidence to 1.0 for user-corrected entries\n"
        "- If a correction is ambiguous, make your best judgment and note it in warnings"
    )


def build_correction_user_prompt(
    current_mapping_plan: dict,
    user_corrections: str,
    selections: list[dict] | None = None,
    doc_paragraphs: list[dict] | None = None,
) -> str:
    """Build the user prompt for correction of placeholder mappings.

    Combines the current mapping plan with user correction instructions
    and optional selection context to produce a prompt that asks the LLM
    to return a complete updated mapping plan.

    Args:
        current_mapping_plan: The full current mapping plan dict with
            'entries', 'template_type', 'language', 'warnings' keys.
        user_corrections: Verbatim user text describing corrections,
            may reference #N selections.
        selections: Optional list of dicts with selection_number, text,
            paragraph_index for numbered selections on the PDF.
        doc_paragraphs: Optional list of dicts with paragraph_index and
            text for document context around selections.

    Returns:
        User prompt string for LLM consumption.
    """
    sections: list[str] = []

    # Section 1: Current mapping plan
    sections.append(_build_current_plan_section(current_mapping_plan))

    # Section 2: User corrections (verbatim)
    sections.append(_build_corrections_section(user_corrections))

    # Section 3: Referenced selections context
    if selections:
        sections.append(_build_selections_context_section(selections))

    # Section 4: Document paragraphs around selections (surrounding context)
    if selections and doc_paragraphs:
        sections.append(
            _build_paragraph_context_section(selections, doc_paragraphs)
        )

    # Section 5: Output format instructions
    sections.append(_build_output_format_section())

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Section builders (internal helpers)
# ---------------------------------------------------------------------------


def _build_current_plan_section(mapping_plan: dict) -> str:
    """Section 1: Current mapping plan with all entries."""
    lines = ["## Current Mapping Plan\n"]

    entries = mapping_plan.get("entries", [])
    template_type = mapping_plan.get("template_type", "unknown")
    language = mapping_plan.get("language", "unknown")

    lines.append(
        f"Template type: {template_type}, Language: {language}"
    )
    lines.append(f"Total entries: {len(entries)}\n")

    for i, entry in enumerate(entries):
        section_index = entry.get("section_index", "?")
        gw_field = entry.get("gw_field", "?")
        marker_type = entry.get("marker_type", "?")
        section_text = entry.get("section_text", "")
        confidence = entry.get("confidence", 0)
        truncated = section_text[:100] + ("..." if len(section_text) > 100 else "")
        lines.append(
            f"  [{i}] section_index={section_index}, "
            f'gw_field="{gw_field}", '
            f'marker_type="{marker_type}", '
            f"confidence={confidence:.2f}"
        )
        if truncated:
            lines.append(f'      text: "{truncated}"')

    return "\n".join(lines)


def _build_corrections_section(user_corrections: str) -> str:
    """Section 2: User correction instructions (verbatim)."""
    lines = [
        "## User Corrections\n",
        "Apply these corrections to the mapping plan:\n",
        user_corrections,
    ]
    return "\n".join(lines)


def _build_selections_context_section(selections: list[dict]) -> str:
    """Section 3: Referenced selections with text and paragraph index."""
    lines = ["## Referenced Selections\n"]
    lines.append(
        "The user referenced these numbered selections from the document:\n"
    )

    for sel in selections:
        num = sel.get("selection_number", 0)
        text = sel.get("text", "")
        para_idx = sel.get("paragraph_index", 0)
        truncated = text[:200] + ("..." if len(text) > 200 else "")
        lines.append(f'  #{num} (paragraph {para_idx}): "{truncated}"')

    return "\n".join(lines)


def _build_paragraph_context_section(
    selections: list[dict],
    doc_paragraphs: list[dict],
) -> str:
    """Section 4: Document paragraphs surrounding the selections.

    Shows 5 paragraphs before and after each selection for context.
    """
    lines = ["## Document Context\n"]
    lines.append(
        "Paragraphs surrounding the referenced selections "
        "(5 before and after each):\n"
    )

    # Build a lookup of paragraph_index -> text
    para_lookup: dict[int, str] = {}
    for p in doc_paragraphs:
        idx = p.get("paragraph_index", p.get("index", -1))
        text = p.get("text", "")
        if idx >= 0:
            para_lookup[idx] = text

    if not para_lookup:
        lines.append("  (no paragraph context available)")
        return "\n".join(lines)

    # Collect unique paragraph indices to show
    context_indices: set[int] = set()
    for sel in selections:
        para_idx = sel.get("paragraph_index", 0)
        for offset in range(-5, 6):
            candidate = para_idx + offset
            if candidate in para_lookup:
                context_indices.add(candidate)

    # Display in order
    for idx in sorted(context_indices):
        text = para_lookup[idx]
        truncated = text[:150] + ("..." if len(text) > 150 else "")
        # Mark selection paragraphs
        is_selection = any(
            sel.get("paragraph_index", -1) == idx for sel in selections
        )
        marker = " <-- SELECTION" if is_selection else ""
        lines.append(f'  [{idx}] "{truncated}"{marker}')

    return "\n".join(lines)


def _build_output_format_section() -> str:
    """Section 5: Output format instructions."""
    schema = {
        "entries": [
            {
                "section_index": "int (paragraph index)",
                "section_text": "str (first 100 chars of paragraph)",
                "gw_field": "str (GW field path)",
                "placeholder_template": "str (Jinja2 expression)",
                "confidence": "float (0.0-1.0, use 1.0 for user-corrected)",
                "marker_type": "str (text|paragraph_rt|run_rt|table_row_loop|control_flow)",
                "rationale": "str (brief reason for this mapping)",
            }
        ],
        "warnings": ["str (any notes about applied corrections)"],
    }

    lines = [
        "## Output Format\n",
        "Return the COMPLETE updated mapping plan as a JSON object.\n",
        "Include ALL entries -- modified, added, and unchanged.\n",
        "Omit only entries the user explicitly asked to remove.\n",
        "Preserve the template_type and language from the current plan.\n",
        "Schema:\n",
        json.dumps(schema, indent=2),
    ]
    return "\n".join(lines)
