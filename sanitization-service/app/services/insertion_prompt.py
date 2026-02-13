"""Insertion prompt builder for LLM Pass 2.

Generates a structured prompt that instructs the LLM to produce precise
DOCX modification instructions (InstructionSet) from an approved mapping plan
and the parsed document structure.
"""
import json
from typing import Any

from app.models.adapter import MappingPlan
from app.models.docx import DocxStructure


def build_insertion_system_prompt() -> str:
    """Build the system prompt for LLM Pass 2 (instruction generation)."""
    return (
        "You are a DOCX template engineer. Your task is to generate precise "
        "document modification instructions that will insert Jinja2 placeholders "
        "into a client document template.\n\n"
        "You receive:\n"
        "1. The client document structure (numbered paragraphs with text, tables with cell content)\n"
        "2. An approved mapping plan that maps document sections to Ghostwriter (GW) template fields\n\n"
        "You must produce a JSON object with an 'instructions' array. Each instruction tells the "
        "applier exactly what text to find and replace in the document.\n\n"
        "CRITICAL RULES:\n"
        "- Be precise with original_text: it must be an exact substring of the paragraph text\n"
        "- Only replace the specific content that maps to a GW field -- preserve surrounding text\n"
        "- For rich text fields (descriptions, impacts), use {{p field }} paragraph markers\n"
        "- For severity badges, use {{r field }} run markers\n"
        "- For table row loops, use the wrap_table_row action\n"
        "- If a paragraph contains multiple mappable fields, generate separate instructions for each\n"
        "- Return ONLY valid JSON, no markdown fences or explanation text"
    )


def build_insertion_prompt(
    doc_structure: DocxStructure,
    mapping_plan: MappingPlan,
) -> str:
    """Build the user prompt for LLM Pass 2 (instruction generation).

    Args:
        doc_structure: Parsed structure of the client DOCX template.
        mapping_plan: Approved mapping plan from Pass 1 analysis.

    Returns:
        The formatted prompt string for the LLM.
    """
    sections: list[str] = []

    # Section 1: Client document structure
    sections.append("## SECTION 1: Client Document Structure\n")
    sections.append("Below are the numbered paragraphs from the client document.\n")

    for i, para in enumerate(doc_structure.paragraphs):
        text = para.text.strip()
        if not text:
            continue
        style_label = f" [{para.style_name}]" if para.style_name else ""
        heading_label = f" (H{para.heading_level})" if para.heading_level else ""
        sections.append(f"  [{i}]{style_label}{heading_label}: {text[:200]}")

    if doc_structure.tables:
        sections.append("\n### Tables\n")
        for t_idx, table in enumerate(doc_structure.tables):
            sections.append(f"  Table {t_idx}:")
            for r_idx, row in enumerate(table.rows):
                cells_text = " | ".join(
                    cell.text.strip()[:80] for cell in row.cells
                )
                sections.append(f"    Row {r_idx}: {cells_text}")

    # Section 2: Approved mapping plan
    sections.append("\n## SECTION 2: Approved Mapping Plan\n")
    sections.append(
        "Each entry maps a document section to a Ghostwriter template field.\n"
    )

    for entry in mapping_plan.entries:
        sections.append(
            f"  - section_index={entry.section_index}, "
            f"gw_field=\"{entry.gw_field}\", "
            f"placeholder=\"{entry.placeholder_template}\", "
            f"confidence={entry.confidence:.2f}, "
            f"marker_type=\"{entry.marker_type}\""
        )
        if entry.section_text:
            sections.append(f"    section_text: \"{entry.section_text[:100]}\"")

    # Section 3: Output format
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
        '      "gw_field": "client.short_name"\n'
        "    }\n"
        "  ],\n"
        f'  "template_type": "{mapping_plan.template_type}",\n'
        f'  "language": "{mapping_plan.language}"\n'
        "}\n"
        "```\n"
    )

    sections.append("Valid actions: replace_text, insert_before, insert_after, wrap_table_row\n")

    # Section 4: Rules
    sections.append("## SECTION 4: Rules\n")
    sections.append(
        "1. For each mapping entry, determine the exact text in the paragraph to replace.\n"
        "2. Use the original_text field to specify what to find (exact substring match).\n"
        "3. Use replacement_text for the Jinja2 expression.\n"
        "4. For table rows that need looping: use wrap_table_row action to add loop markers.\n"
        "5. Preserve surrounding text -- only replace the specific content that maps to a GW field.\n"
        "6. If a paragraph contains multiple mappable fields, generate separate instructions for each.\n"
        "7. Use the placeholder_template from the mapping plan as the replacement_text.\n"
        "8. Match the marker_type from the mapping plan.\n"
    )

    return "\n".join(sections)
