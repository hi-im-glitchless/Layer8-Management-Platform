"""Template-type-aware rules engine for marker injection and feature enrichment.

Rewrites plain Jinja2 expressions with correct rich text markers ({{p}}, {{r}},
{%tr%}) based on the GW field data type, and injects template-type-specific
features (filter_type for internal, scope loops for web/mobile).
"""
import copy
import re

from app.models.adapter import (
    FIELD_MARKER_MAP,
    TEMPLATE_TYPE_FEATURES,
    Instruction,
    InstructionSet,
)

# ---------------------------------------------------------------------------
# Marker rewriting
# ---------------------------------------------------------------------------

# Pattern to detect a plain {{ var }} expression (no p/r marker)
_PLAIN_VAR_RE = re.compile(r"^\{\{\s*([^{}]+?)\s*\}\}$")
# Pattern to detect an already-marked expression {{p var }} or {{r var }}
_MARKED_VAR_RE = re.compile(r"^\{\{([pr])\s+(.+?)\s*\}\}$")


def _get_marker_type(gw_field: str) -> str | None:
    """Look up the marker type for a GW field path.

    Returns 'paragraph_rt', 'run_rt', 'text', or None if not found.
    """
    return FIELD_MARKER_MAP.get(gw_field)


def _rewrite_marker(replacement_text: str, gw_field: str) -> str:
    """Rewrite a Jinja2 variable expression with the correct marker prefix.

    If the field requires paragraph-level rich text ({{p ...}}) or run-level
    ({{r ...}}), rewrite accordingly. If already marked correctly, leave as-is.

    Args:
        replacement_text: The current replacement_text from the instruction.
        gw_field: The GW field path for marker lookup.

    Returns:
        The (possibly rewritten) replacement_text.
    """
    marker_type = _get_marker_type(gw_field)
    if marker_type is None or marker_type == "text":
        return replacement_text

    # Check if it's already correctly marked
    marked_match = _MARKED_VAR_RE.match(replacement_text.strip())
    if marked_match:
        existing_marker = marked_match.group(1)
        if marker_type == "paragraph_rt" and existing_marker == "p":
            return replacement_text
        if marker_type == "run_rt" and existing_marker == "r":
            return replacement_text

    # Check if it's a plain variable expression
    plain_match = _PLAIN_VAR_RE.match(replacement_text.strip())
    if plain_match:
        var_expr = plain_match.group(1).strip()
        if marker_type == "paragraph_rt":
            return "{{p " + var_expr + " }}"
        elif marker_type == "run_rt":
            return "{{r " + var_expr + " }}"

    # If already marked but with wrong marker, fix it
    if marked_match:
        var_expr = marked_match.group(2).strip()
        if marker_type == "paragraph_rt":
            return "{{p " + var_expr + " }}"
        elif marker_type == "run_rt":
            return "{{r " + var_expr + " }}"

    return replacement_text


def apply_marker_rules(instructions: InstructionSet) -> InstructionSet:
    """Rewrite instruction replacement_text with correct rich text markers.

    For each instruction:
      - Check gw_field against FIELD_MARKER_MAP
      - Rewrite plain {{ field }} to {{p field }} or {{r field }} as needed
      - paragraph_rt fields get {{p ... }}
      - run_rt fields get {{r ... }}
      - Table row loops get {%tr %} wrappers

    Args:
        instructions: The instruction set to process.

    Returns:
        A new InstructionSet with rewritten replacement_text values.
    """
    updated = copy.deepcopy(instructions)
    new_instructions: list[Instruction] = []

    for inst in updated.instructions:
        # Rewrite variable markers based on field type
        new_text = _rewrite_marker(inst.replacement_text, inst.gw_field)

        # For wrap_table_row actions, ensure {%tr %} markers
        if inst.action == "wrap_table_row":
            new_text = _ensure_table_row_markers(new_text)

        new_instructions.append(
            Instruction(
                action=inst.action,
                paragraph_index=inst.paragraph_index,
                original_text=inst.original_text,
                replacement_text=new_text,
                marker_type=inst.marker_type,
                gw_field=inst.gw_field,
            )
        )

    updated.instructions = new_instructions
    return updated


def _ensure_table_row_markers(text: str) -> str:
    """Ensure table row loop expressions use {%tr %} markers.

    Rewrites {% for ... %} to {%tr for ... %} if not already using tr marker.
    """
    # If already has {%tr, leave as-is
    if "{%tr" in text:
        return text

    # Rewrite {% for %} to {%tr for %}
    text = re.sub(
        r"\{%\s*(for\s+.+?)\s*%\}",
        r"{%tr \1 %}",
        text,
    )
    text = re.sub(
        r"\{%\s*(endfor)\s*%\}",
        r"{%tr \1 %}",
        text,
    )
    return text


# ---------------------------------------------------------------------------
# Template-type feature injection
# ---------------------------------------------------------------------------


def inject_type_features(instructions: InstructionSet) -> InstructionSet:
    """Inject template-type-specific Jinja2 features into the instruction set.

    Based on template_type:
      - "internal": Add filter_type() categorisation and namespace counters
      - "web"/"mobile": Add scope table loops and affected_entities markers

    Features are added to the additional_blocks list for the orchestration
    layer to insert at appropriate positions.

    Args:
        instructions: The instruction set to enrich.

    Returns:
        A new InstructionSet with additional_blocks populated.
    """
    updated = copy.deepcopy(instructions)
    template_type = updated.template_type
    features = TEMPLATE_TYPE_FEATURES.get(template_type, [])

    if not features:
        return updated

    additional: list[str] = list(updated.additional_blocks)

    if "filter_type" in features:
        additional.extend(_internal_filter_type_blocks())

    if "namespace_counters" in features:
        additional.extend(_namespace_counter_blocks())

    if "scope_loops" in features:
        additional.extend(_scope_loop_blocks())

    if "affected_entities" in features:
        additional.extend(_affected_entities_blocks())

    updated.additional_blocks = additional

    # Also enrich individual instructions for loop numbering
    updated.instructions = _add_loop_numbering(updated.instructions, template_type)

    return updated


def _internal_filter_type_blocks() -> list[str]:
    """Generate filter_type categorisation blocks for internal templates.

    Internal templates group findings by type using filter_type():
      findings|filter_type(["Web"]), findings|filter_type(["Infrastructure"]), etc.
    """
    categories = ["AD", "Infrastructure", "Physical", "Servers", "UAC", "Web"]
    blocks = []
    for category in categories:
        blocks.append(
            f'{{% for finding in findings|filter_type(["{category}"]) %}}'
        )
        blocks.append("{% endfor %}")
    return blocks


def _namespace_counter_blocks() -> list[str]:
    """Generate namespace counter initialisation blocks for internal templates."""
    return [
        "{% set ns = namespace(counter=0) %}",
        "{% set ns.counter = ns.counter + 1 %}",
    ]


def _scope_loop_blocks() -> list[str]:
    """Generate scope table loop blocks for web/mobile templates."""
    return [
        "{%tr for item in scope %}",
        "{%tr endfor %}",
    ]


def _affected_entities_blocks() -> list[str]:
    """Generate affected_entities marker blocks for web/mobile templates."""
    return [
        "{{ finding.affected_entities_rt }}",
    ]


def _add_loop_numbering(
    instructions: list[Instruction],
    template_type: str,
) -> list[Instruction]:
    """Add loop.index numbering format to finding loop instructions.

    For instructions inside finding loops, ensure the numbering format
    expression is available. This is a hint for the orchestration layer.
    """
    result: list[Instruction] = []
    for inst in instructions:
        # If the instruction references a loop counter field, ensure correct format
        if "loop.index" in inst.replacement_text:
            new_text = inst.replacement_text
            # Ensure proper formatting: {{ '%02d' % loop.index }}
            if "loop.index" in new_text and "%" not in new_text and "format" not in new_text:
                new_text = "{{ '%02d' % loop.index }}"
                inst = Instruction(
                    action=inst.action,
                    paragraph_index=inst.paragraph_index,
                    original_text=inst.original_text,
                    replacement_text=new_text,
                    marker_type=inst.marker_type,
                    gw_field=inst.gw_field,
                )
        result.append(inst)
    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def enrich_instructions(instructions: InstructionSet) -> InstructionSet:
    """Enrich an instruction set with marker rules and type-specific features.

    Pipeline: apply_marker_rules -> inject_type_features -> return

    This is the main entry point called by the orchestration layer.

    Args:
        instructions: The raw instruction set from the LLM.

    Returns:
        An enriched InstructionSet with correct markers and additional blocks.
    """
    result = apply_marker_rules(instructions)
    result = inject_type_features(result)
    return result
