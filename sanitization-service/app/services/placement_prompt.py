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
