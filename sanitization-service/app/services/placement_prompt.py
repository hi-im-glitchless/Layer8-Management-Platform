"""Placement prompt builder for LLM-powered placeholder placement.

Generates structured zone-aware prompts that instruct the LLM to produce
precise DOCX modification instructions (InstructionSet) from an approved
mapping plan and the parsed document structure. Creates a NEW file rather
than modifying insertion_prompt.py because the old insertion prompt is
still used by autoMapTemplate() until Plan 05.5-03 unifies the pipelines.
"""
from app.models.adapter import MappingPlan
from app.models.docx import DocxParagraph, DocxStructure


def _format_paragraph(idx: int, para: DocxParagraph, is_mapped: bool) -> str:
    """Format a single paragraph for the zone map.

    Args:
        idx: Paragraph index in the document body.
        para: The paragraph model.
        is_mapped: Whether this paragraph has a mapping entry.

    Returns:
        Formatted string like ``[5][Normal](H1): Executive Summary``.
    """
    text = para.text.strip()
    if not text:
        return ""

    max_len = 200 if is_mapped else 50
    display_text = text[:max_len]
    if len(text) > max_len:
        display_text += "..."

    style_label = f"[{para.style_name}]" if para.style_name else ""
    heading_label = f"(H{para.heading_level})" if para.heading_level else ""

    return f"  [{idx}]{style_label}{heading_label}: {display_text}"


def build_zone_map(doc_structure: DocxStructure, mapping_plan: MappingPlan) -> str:
    """Build a structured zone-grouped representation of the DOCX.

    Groups paragraphs by zone (cover, body, header, footer, table_cell)
    and includes paragraph indices, style names, and heading levels.
    Mapped paragraphs (those matching a section_index in mapping_plan)
    get full text (200 chars) plus context paragraphs; unmapped get
    truncated text (50 chars).

    Args:
        doc_structure: Parsed DOCX structure with zone-tagged paragraphs.
        mapping_plan: Approved mapping plan with section_index references.

    Returns:
        Formatted zone map string for the LLM prompt.
    """
    # Build set of mapped paragraph indices for quick lookup
    mapped_indices: set[int] = {e.section_index for e in mapping_plan.entries}

    # Also include 1-2 context paragraphs around mapped ones
    context_indices: set[int] = set()
    for idx in mapped_indices:
        context_indices.add(idx - 1)
        context_indices.add(idx - 2)
        context_indices.add(idx + 1)
        context_indices.add(idx + 2)

    # All indices that get full text treatment
    full_text_indices = mapped_indices | context_indices

    sections: list[str] = []

    # --- Body paragraphs grouped by zone ---
    zone_groups: dict[str, list[tuple[int, DocxParagraph]]] = {}
    for i, para in enumerate(doc_structure.paragraphs):
        zone = para.zone or "body"
        zone_groups.setdefault(zone, []).append((i, para))

    # Emit zones in a stable order
    zone_order = ["cover", "body", "unknown"]
    for zone in zone_order:
        if zone not in zone_groups:
            continue
        sections.append(f"## ZONE: {zone}")
        for idx, para in zone_groups[zone]:
            is_mapped = idx in full_text_indices
            line = _format_paragraph(idx, para, is_mapped)
            if line:
                sections.append(line)
        sections.append("")

    # --- Header/footer paragraphs from sections ---
    for sec_idx, section in enumerate(doc_structure.sections):
        if section.header_paragraphs:
            sections.append(f"## ZONE: header (Section {sec_idx + 1})")
            for h_idx, para in enumerate(section.header_paragraphs):
                text = para.text.strip()
                if not text:
                    continue
                style_label = f"[{para.style_name}]" if para.style_name else ""
                sections.append(f"  [H{h_idx}]{style_label}: {text[:200]}")
            sections.append("")

        if section.footer_paragraphs:
            sections.append(f"## ZONE: footer (Section {sec_idx + 1})")
            for f_idx, para in enumerate(section.footer_paragraphs):
                text = para.text.strip()
                if not text:
                    continue
                style_label = f"[{para.style_name}]" if para.style_name else ""
                sections.append(f"  [F{f_idx}]{style_label}: {text[:200]}")
            sections.append("")

    # --- Table cells ---
    for t_idx, table in enumerate(doc_structure.tables):
        sections.append(f"## ZONE: table_cell (Table {t_idx})")
        for r_idx, row in enumerate(table.rows):
            for c_idx, cell in enumerate(row.cells):
                text = cell.text.strip()
                if not text:
                    continue
                sections.append(f"  [T{t_idx}.R{r_idx}.C{c_idx}]: {text[:100]}")
        sections.append("")

    return "\n".join(sections)


def build_placement_system_prompt() -> str:
    """Build the system prompt for LLM placement (instruction generation).

    Defines the DOCX template engineer role with critical rules for
    zone-aware placement, exact substring matching, and format preservation.

    Returns:
        System prompt string for the LLM.
    """
    return (
        "You are a DOCX template engineer specializing in Jinja2 placeholder placement. "
        "Your task is to generate precise document modification instructions that will "
        "insert Jinja2 placeholders into a client document template.\n\n"
        "You receive:\n"
        "1. A zone-grouped document structure with numbered paragraphs, styles, and headings\n"
        "2. A mapping plan that maps document sections to Ghostwriter (GW) template fields\n\n"
        "You must produce a JSON object with an 'instructions' array. Each instruction "
        "tells the applier exactly what text to find and replace in the document.\n\n"
        "CRITICAL RULES:\n"
        "1. Each instruction's original_text MUST be an exact substring of the paragraph "
        "text at paragraph_index. Do not fabricate or approximate text.\n"
        "2. Only replace the specific content that maps to a GW field -- preserve "
        "surrounding text, formatting, and structure.\n"
        "3. Use the correct marker_type from the mapping plan:\n"
        "   - text: simple inline replacement with {{ field }}\n"
        "   - paragraph_rt: replace entire paragraph content with {{p field }}\n"
        "   - run_rt: replace a run with {{r field }}\n"
        "   - table_row_loop: use wrap_table_row action with {%tr for ... %}\n"
        "   - control_flow: use {% if ... %} / {% endif %} blocks\n"
        "4. For paragraph_rt fields (descriptions, impacts), replace the entire "
        "paragraph content -- original_text should be the full paragraph text.\n"
        "5. For table_row_loop fields, use the wrap_table_row action.\n"
        "6. When multiple fields map to the same paragraph, generate separate "
        "instructions for each field.\n"
        "7. Include a confidence score (0.0 to 1.0) for each instruction reflecting "
        "how certain you are about the placement.\n"
        "8. Return ONLY valid JSON. No markdown fences, no explanation text, no comments."
    )


def build_placement_prompt(
    doc_structure: DocxStructure,
    mapping_plan: MappingPlan,
) -> str:
    """Build the user prompt for LLM placement (instruction generation).

    Produces a prompt with 4 sections:
    1. Zone map -- structured document representation
    2. Mapping entries -- fields to place with gw_field, placeholder, marker_type
    3. Output format -- InstructionSet JSON schema with confidence
    4. Placement rules -- how to handle each marker type with zone guidance

    Args:
        doc_structure: Parsed structure of the client DOCX template.
        mapping_plan: Approved mapping plan from analysis.

    Returns:
        The formatted prompt string for the LLM.
    """
    sections: list[str] = []

    # Section 1: Zone map
    sections.append("## SECTION 1: Document Structure (Zone Map)\n")
    sections.append(
        "Below is the zone-grouped document structure. Each paragraph is "
        "numbered with its index, style, and heading level.\n"
    )
    sections.append(build_zone_map(doc_structure, mapping_plan))

    # Section 2: Mapping entries to place
    sections.append("\n## SECTION 2: Mapping Entries to Place\n")
    sections.append(
        "Each entry below maps a document section to a Ghostwriter template field. "
        "You must generate an instruction for each entry.\n"
    )

    for entry in mapping_plan.entries:
        sections.append(
            f"  - section_index={entry.section_index}, "
            f'gw_field="{entry.gw_field}", '
            f'placeholder="{entry.placeholder_template}", '
            f'marker_type="{entry.marker_type}"'
        )
        if entry.section_text:
            sections.append(f'    section_text: "{entry.section_text[:100]}"')

    # Section 3: Required output format
    sections.append("\n## SECTION 3: Required Output Format\n")
    sections.append(
        "Return a JSON object with this exact structure:\n"
        "```\n"
        "{\n"
        '  "instructions": [\n'
        "    {\n"
        '      "action": "replace_text",\n'
        '      "paragraph_index": 5,\n'
        '      "original_text": "Acme Corp",\n'
        '      "replacement_text": "{{ client.short_name }}",\n'
        '      "marker_type": "text",\n'
        '      "gw_field": "client.short_name",\n'
        '      "confidence": 0.95\n'
        "    }\n"
        "  ],\n"
        f'  "template_type": "{mapping_plan.template_type}",\n'
        f'  "language": "{mapping_plan.language}"\n'
        "}\n"
        "```\n"
    )

    sections.append(
        "Valid actions: replace_text, insert_before, insert_after, wrap_table_row\n"
    )

    # Section 4: Placement rules
    sections.append("## SECTION 4: Placement Rules\n")
    sections.append(
        "1. For each mapping entry, locate the paragraph at section_index in the zone map.\n"
        "2. Use the section_text hint to find the exact substring to replace.\n"
        "3. For 'text' marker_type: find the specific text snippet and replace with "
        "the placeholder_template. Preserve surrounding text.\n"
        "4. For 'paragraph_rt' marker_type: the original_text should be the full "
        "paragraph text. The entire paragraph content is replaced with the placeholder.\n"
        "5. For 'run_rt' marker_type: find the specific run text (e.g., a severity "
        "badge) and replace with {{r field }} notation.\n"
        "6. For 'table_row_loop' marker_type: use wrap_table_row action. The "
        "replacement_text should be the loop expression (e.g., '{%tr for item in scope %}').\n"
        "7. For 'control_flow' marker_type: use insert_before/insert_after to add "
        "{% if ... %} / {% endif %} blocks around the target paragraph.\n"
        "8. Headers and footers often contain run_rt fields (logos, company names). "
        "Pay attention to the zone when placing these.\n"
        "9. If the section_text does not match the paragraph text at section_index, "
        "search ALL zones (body, headers, footers) in the zone map for the text. "
        "For header/footer content, use the original section_index as paragraph_index -- "
        "the applier will locate the text by content matching.\n"
        "10. Set confidence to 1.0 when original_text is an exact match. Lower it "
        "when you had to search or approximate.\n"
    )

    return "\n".join(sections)
