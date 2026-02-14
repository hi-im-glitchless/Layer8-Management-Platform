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
    KBContext,
    ReferenceTemplateInfo,
    TemplateLanguage,
    TemplateType,
)
from app.models.docx import DocxStructure

import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token estimation helpers
# ---------------------------------------------------------------------------


def _estimate_tokens(text: str) -> int:
    """Estimate token count from text using word-count heuristic.

    Rough approximation: 1 token ~= 0.75 words for English text.
    """
    word_count = len(text.split())
    return int(word_count / 0.75)


def _enforce_token_budget(
    kb_block: str,
    other_sections_text: str,
    kb_context: "KBContext",
    min_pct: float = 0.15,
    max_pct: float = 0.25,
    hard_cap: int = 1500,
) -> str:
    """Enforce dynamic token budget on the KB context block.

    Calculates a budget between min_pct and max_pct of total prompt tokens,
    hard-capped at hard_cap tokens. When the KB block exceeds the budget,
    progressively trims content in this order:
    1. Remove Confidence Notes section
    2. Reduce entries per zone from 5 to 3
    3. Remove cross-type fallback entries (when is_cross_type_fallback)
    4. Truncate by removing lowest-confidence entries

    Args:
        kb_block: The full KB context block string.
        other_sections_text: All other prompt sections joined together.
        kb_context: The original KBContext data for rebuilding trimmed versions.
        min_pct: Minimum percentage of total prompt for KB block.
        max_pct: Maximum percentage of total prompt for KB block.
        hard_cap: Absolute maximum tokens for KB block.

    Returns:
        The KB block, trimmed if necessary to fit the budget.
    """
    total_other_tokens = _estimate_tokens(other_sections_text)
    kb_tokens = _estimate_tokens(kb_block)

    # Calculate dynamic budget
    total_tokens = total_other_tokens + kb_tokens
    dynamic_budget = max(min_pct * total_tokens, min(max_pct * total_tokens, hard_cap))
    budget = min(dynamic_budget, hard_cap)

    if kb_tokens <= budget:
        return kb_block

    logger.info(
        "KB context block (%d tokens) exceeds budget (%d tokens), trimming",
        kb_tokens, int(budget),
    )

    # Progressive trimming: rebuild from kb_context with stricter limits

    # Step 1: Remove Confidence Notes section
    trimmed = re.sub(r"\n### Confidence Notes\n.*", "", kb_block, flags=re.DOTALL)
    if _estimate_tokens(trimmed) <= budget:
        return trimmed

    # Step 2: Reduce entries per zone from 5 to 3 (rebuild Zone Distribution)
    trimmed = _rebuild_kb_block_with_limit(kb_context, entries_per_zone=3, include_confidence_notes=False)
    if _estimate_tokens(trimmed) <= budget:
        return trimmed

    # Step 3: Remove cross-type fallback entries entirely if applicable
    if kb_context.is_cross_type_fallback:
        # With cross-type fallback, everything is fallback data -- just reduce further
        trimmed = _rebuild_kb_block_with_limit(kb_context, entries_per_zone=2, include_confidence_notes=False)
        if _estimate_tokens(trimmed) <= budget:
            return trimmed

    # Step 4: Truncate by keeping only highest-confidence entries globally
    trimmed = _rebuild_kb_block_with_limit(kb_context, entries_per_zone=1, include_confidence_notes=False)
    if _estimate_tokens(trimmed) <= budget:
        return trimmed

    # Final fallback: just take the first `budget` tokens worth of the block
    words = trimmed.split()
    target_words = int(budget * 0.75)
    return " ".join(words[:target_words])


def _rebuild_kb_block_with_limit(
    kb_context: "KBContext",
    entries_per_zone: int = 5,
    include_confidence_notes: bool = True,
) -> str:
    """Rebuild the KB context block with a limited number of entries per zone.

    Used by the token budget enforcer to progressively reduce block size.
    """
    lines: list[str] = ["## Knowledge Base Context\n"]

    if kb_context.is_cross_type_fallback:
        lines.append(
            "NOTE: These patterns are from other template types "
            "(0.7x confidence penalty applied). Adapt with caution.\n"
        )

    lines.append("### Zone Distribution\n")

    for zone, mappings in sorted(kb_context.zone_mappings.items()):
        lines.append(f"Zone: {zone} ({len(mappings)} patterns)")
        top_entries = sorted(mappings, key=lambda m: m.confidence, reverse=True)[:entries_per_zone]
        for m in top_entries:
            lines.append(
                f"  - \"{m.normalized_section_text[:80]}\" -> "
                f"{m.gw_field} [{m.marker_type}] (conf: {m.confidence:.2f})"
            )

    # Include repetition hints (compact, low token cost)
    if kb_context.repetition_summary:
        lines.append("")
        for rep in kb_context.repetition_summary:
            gw_field = rep.get("gw_field", "unknown")
            zone = rep.get("zone", "unknown")
            total = rep.get("total_count", 0)
            if total > 1:
                lines.append(f"  {gw_field} appears {total}x in {zone}")

    # Blueprints (compact)
    if kb_context.blueprints:
        lines.append("\n### Blueprints\n")
        for bp in kb_context.blueprints:
            marker_names = [f"{m.get('gwField', '?')}" for m in bp.markers]
            markers_str = ", ".join(marker_names)
            anchor = f" (anchor: {bp.anchor_style})" if bp.anchor_style else ""
            lines.append(
                f"  {bp.pattern_type.capitalize()}: [{markers_str}] "
                f"in zone {bp.zone}{anchor}"
            )

    # Confidence Notes (optional)
    if include_confidence_notes:
        low_confidence: list[str] = []
        for _zone, mappings in kb_context.zone_mappings.items():
            for m in mappings:
                if m.confidence < 0.5:
                    low_confidence.append(
                        f"  Low confidence: \"{m.normalized_section_text[:60]}\" -> "
                        f"{m.gw_field} ({m.confidence:.2f})"
                    )
        if low_confidence:
            lines.append("\n### Confidence Notes\n")
            lines.extend(low_confidence)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# GW field descriptions (derived from TemplateContext interface)
# ---------------------------------------------------------------------------

_GW_FIELD_DESCRIPTIONS: dict[str, str] = {
    "client.short_name": "Client short name (text)",
    "project.start_date": "Project start date (text, YYYY-MM-DD)",
    "project.end_date": "Project end date (text, YYYY-MM-DD)",
    "project.codename": "Project codename / internal project identifier (text)",
    "report_date": "Report creation date (text, YYYY-MM-DD)",
    "title": "Report title (text, often in header/footer/frontpage text box)",
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
    kb_context: KBContext | None = None,
) -> str:
    """Build the full analysis prompt for LLM Pass 1.

    The prompt contains five sections (plus an optional KB/few-shot section):
    1. Condensed client DOCX structure (numbered paragraphs)
    2. Reference template patterns
    2b. KB Context Block (zone distribution + blueprints + confidence notes)
        OR Previous Successful Mappings (flat few-shot, backward compat)
    3. Available GW fields
    4. Output format specification (JSON schema + example)
    5. Mapping rules

    When kb_context is provided and non-empty, uses the structured KB context
    block instead of the flat few-shot section. Falls back to few-shot when
    kb_context is None or has no zone_mappings.

    Args:
        doc_structure: Parsed structure of the client's DOCX template.
        reference_info: Patterns from the matching reference template.
        template_type: web, internal, or mobile.
        language: en or pt-pt.
        few_shot_examples: Optional list of confirmed mappings for few-shot learning.
        kb_context: Optional enriched KB context with zone-grouped data.

    Returns:
        Complete prompt string ready for LLM consumption.
    """
    # Extract boilerplate styles from kb_context for doc structure filtering
    boilerplate_styles = kb_context.boilerplate_styles if kb_context else []

    sections: list[str] = []

    # Section 1: Client document structure (with optional boilerplate filtering)
    sections.append(
        _build_doc_structure_section(doc_structure, boilerplate_styles=boilerplate_styles)
    )

    # Section 2: Reference template patterns
    sections.append(_build_reference_patterns_section(reference_info))

    # Section 2b: KB context block OR few-shot examples (backward compat)
    kb_block: str | None = None
    if kb_context and kb_context.zone_mappings:
        kb_block = _build_kb_context_block(kb_context)
    elif few_shot_examples:
        few_shot = _build_few_shot_section(few_shot_examples)
        if few_shot:
            sections.append(few_shot)

    # Section 3: Available GW fields
    sections.append(_build_gw_fields_section(template_type))

    # Section 4: Output format
    sections.append(_build_output_format_section())

    # Section 5: Rules
    sections.append(_build_rules_section(template_type, language))

    # Apply token budget to KB block before including it
    if kb_block and kb_context:
        other_text = "\n\n".join(sections)
        kb_block = _enforce_token_budget(kb_block, other_text, kb_context)
        # Insert KB block after section 2 (reference patterns) at index 2
        sections.insert(2, kb_block)

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


def _build_doc_structure_section(
    doc: DocxStructure,
    boilerplate_styles: list[str] | None = None,
) -> str:
    """Section 1: Numbered, condensed client document paragraphs.

    Includes body paragraphs, tables, and header/footer content.
    When boilerplate_styles is provided and non-empty, paragraphs whose
    style_name matches any entry in the list are skipped. Tables are never
    filtered by style. A summary note is appended showing how many paragraphs
    were filtered and which styles were excluded.
    """
    boilerplate_set = set(boilerplate_styles) if boilerplate_styles else set()

    lines = ["## Client Template Structure\n"]
    lines.append("Below are the non-empty paragraphs from the client's DOCX template. "
                 "Each line shows: index | heading level (if any) | text (truncated to 200 chars).\n")

    para_count = 0
    filtered_count = 0
    for i, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue

        # Filter boilerplate paragraphs by style name
        if boilerplate_set and para.style_name and para.style_name in boilerplate_set:
            filtered_count += 1
            continue

        para_count += 1
        heading = f"H{para.heading_level}" if para.heading_level else "  "
        truncated = text[:200] + ("..." if len(text) > 200 else "")
        lines.append(f"[{i:3d}] {heading:3s} | {truncated}")

    # Include table locations (tables are never filtered by style)
    if doc.tables:
        lines.append(f"\nTables found: {len(doc.tables)}")
        for ti, table in enumerate(doc.tables):
            row_count = len(table.rows)
            col_count = len(table.rows[0].cells) if table.rows else 0
            first_cell = ""
            if table.rows and table.rows[0].cells:
                first_cell = table.rows[0].cells[0].text.strip()[:80]
            lines.append(f"  Table {ti}: {row_count}x{col_count}, starts with: \"{first_cell}\"")

    # Include header/footer content -- these often contain report title,
    # dates, client names, and other fields that need placeholder mapping
    hf_lines: list[str] = []
    for sec_idx, section in enumerate(doc.sections):
        for hf_type in ("header", "footer"):
            paras = getattr(section, f"{hf_type}_paragraphs", [])
            for h_idx, para in enumerate(paras):
                text = para.text.strip()
                if not text:
                    continue
                truncated = text[:200] + ("..." if len(text) > 200 else "")
                hf_lines.append(
                    f"  [{hf_type.upper()} S{sec_idx + 1} P{h_idx}] {truncated}"
                )

    if hf_lines:
        lines.append("\n### Headers & Footers")
        lines.append("These appear on every page. Fields here (dates, titles, "
                     "client names) often need placeholders too.\n")
        lines.extend(hf_lines)

    # Include text box content -- these contain titles, dates, client names,
    # project codenames that are embedded in shapes/boxes on the pages
    txbx_lines: list[str] = []
    for tb_idx, text_box in enumerate(doc.text_boxes):
        for para in text_box.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            truncated = text[:200] + ("..." if len(text) > 200 else "")
            txbx_lines.append(
                f"  [TEXTBOX {tb_idx} in {text_box.location}] {truncated}"
            )

    if txbx_lines:
        lines.append("\n### Text Boxes")
        lines.append("Content inside text boxes/shapes (frontpage titles, footer fields, etc.).\n")
        lines.extend(txbx_lines)

    lines.append(f"\nTotal non-empty paragraphs: {para_count}")

    # Boilerplate filtering summary
    if filtered_count > 0:
        style_list = ", ".join(sorted(boilerplate_set))
        lines.append(
            f"Filtered {filtered_count} boilerplate paragraphs "
            f"(styles: {style_list})"
        )

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


def _build_kb_context_block(kb_context: KBContext) -> str | None:
    """Build the structured KB context block replacing the flat few-shot section.

    Emits three subsections:
    - Zone Distribution: top-5 entries per zone sorted by confidence desc, with repetition hints
    - Blueprints: structural patterns (loops, conditionals, groups)
    - Confidence Notes: low-confidence entries the LLM should double-check

    Returns None if kb_context has no zone_mappings.
    """
    if not kb_context.zone_mappings:
        return None

    lines: list[str] = ["## Knowledge Base Context\n"]

    # Cross-type fallback warning
    if kb_context.is_cross_type_fallback:
        lines.append(
            "NOTE: These patterns are from other template types "
            "(0.7x confidence penalty applied). Adapt with caution.\n"
        )

    # --- Zone Distribution subsection ---
    lines.append("### Zone Distribution\n")

    for zone, mappings in sorted(kb_context.zone_mappings.items()):
        lines.append(f"Zone: {zone} ({len(mappings)} patterns)")
        # Top 5 entries per zone, sorted by confidence desc
        top_entries = sorted(mappings, key=lambda m: m.confidence, reverse=True)[:5]
        for m in top_entries:
            lines.append(
                f"  - \"{m.normalized_section_text[:80]}\" -> "
                f"{m.gw_field} [{m.marker_type}] (conf: {m.confidence:.2f})"
            )

    # Repetition hints
    if kb_context.repetition_summary:
        lines.append("")
        for rep in kb_context.repetition_summary:
            gw_field = rep.get("gw_field", "unknown")
            zone = rep.get("zone", "unknown")
            total = rep.get("total_count", 0)
            if total > 1:
                lines.append(f"  {gw_field} appears {total}x in {zone}")

    # --- Blueprints subsection ---
    if kb_context.blueprints:
        lines.append("\n### Blueprints\n")
        for bp in kb_context.blueprints:
            marker_names = [
                f"{m.get('gwField', '?')}" for m in bp.markers
            ]
            markers_str = ", ".join(marker_names)
            anchor = f" (anchor: {bp.anchor_style})" if bp.anchor_style else ""
            lines.append(
                f"  {bp.pattern_type.capitalize()}: [{markers_str}] "
                f"in zone {bp.zone}{anchor}"
            )

    # --- Confidence Notes subsection ---
    low_confidence: list[str] = []
    for _zone, mappings in kb_context.zone_mappings.items():
        for m in mappings:
            if m.confidence < 0.5:
                low_confidence.append(
                    f"  Low confidence: \"{m.normalized_section_text[:60]}\" -> "
                    f"{m.gw_field} ({m.confidence:.2f})"
                )

    if low_confidence:
        lines.append("\n### Confidence Notes\n")
        lines.extend(low_confidence)

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
        "9. MAP HEADER/FOOTER CONTENT: Fields in headers and footers (dates, titles, "
        "client names) must also be mapped. Use section_index=0 for header/footer entries "
        "and include the exact text in section_text -- the applier locates them by text search.",
        f"10. Target template type: {template_type}, language: {language}.",
    ]

    if template_type == "internal":
        lines.append(
            "11. Internal templates use filter_type() for category-based finding grouping "
            "(AD, Infrastructure, Physical, Servers, UAC, Web) and namespace counters."
        )
    else:
        lines.append(
            "11. This template type uses scope loops and affected_entities fields."
        )

    return "\n".join(lines)
