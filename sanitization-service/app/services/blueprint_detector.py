"""Blueprint detection and style hint collection for the Knowledge Base.

Heuristic (no LLM) analysis of completed mapping plans to detect:
- Loop patterns (consecutive table_row_loop / control_flow entries sharing a field prefix)
- Group patterns (entries sharing a gw_field prefix within the same zone and close proximity)
- Conditional patterns (control_flow if/endif brackets around other entries)
"""
import logging
from collections import defaultdict

from app.models.adapter import MappingEntry, MappingPlan
from app.models.docx import DocxStructure

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Blueprint detection
# ---------------------------------------------------------------------------


def detect_blueprints(
    mapping_plan: MappingPlan, doc_structure: DocxStructure
) -> list[dict]:
    """Detect structural blueprint patterns from a completed mapping plan.

    Implements three heuristic rules (Decision #9):
      1. Loop detection  -- consecutive table_row_loop / control_flow entries
         sharing a loop variable prefix
      2. Group detection -- entries sharing a gw_field prefix within the same
         zone and within 10 paragraph indices of each other
      3. Conditional detection -- control_flow if/endif brackets around other
         mapping entries

    Args:
        mapping_plan: A validated MappingPlan with entries.
        doc_structure: The parsed DocxStructure (for zone lookup).

    Returns:
        A list of blueprint dicts with keys: templateType, zone, patternType,
        markers, anchorStyle.
    """
    blueprints: list[dict] = []

    # Build a zone lookup from doc_structure paragraphs
    zone_by_index = _build_zone_lookup(doc_structure)

    entries = mapping_plan.entries

    # Rule 1: Loop detection
    loops = _detect_loops(entries, zone_by_index, mapping_plan.template_type)
    blueprints.extend(loops)

    # Rule 2: Group detection
    groups = _detect_groups(entries, zone_by_index, doc_structure, mapping_plan.template_type)
    blueprints.extend(groups)

    # Rule 3: Conditional detection
    conditionals = _detect_conditionals(entries, zone_by_index, mapping_plan.template_type)
    blueprints.extend(conditionals)

    logger.info(
        "Detected %d blueprints (loops=%d, groups=%d, conditionals=%d) for template_type=%s",
        len(blueprints),
        len(loops),
        len(groups),
        len(conditionals),
        mapping_plan.template_type,
    )

    return blueprints


def _build_zone_lookup(doc_structure: DocxStructure) -> dict[int, str]:
    """Build a mapping from paragraph index to zone string."""
    lookup: dict[int, str] = {}
    for idx, para in enumerate(doc_structure.paragraphs):
        lookup[idx] = para.zone or "unknown"
    return lookup


def _get_field_prefix(gw_field: str) -> str:
    """Extract the top-level prefix from a gw_field path.

    Examples:
        "finding.title"        -> "finding"
        "finding.severity_rt"  -> "finding"
        "client.short_name"    -> "client"
        "report_date"          -> "report_date"
    """
    dot_pos = gw_field.find(".")
    bracket_pos = gw_field.find("[")
    if dot_pos == -1 and bracket_pos == -1:
        return gw_field
    positions = [p for p in (dot_pos, bracket_pos) if p != -1]
    return gw_field[:min(positions)]


def _get_anchor_style(
    entries: list[MappingEntry], doc_structure: DocxStructure
) -> str | None:
    """Get the style_name of the paragraph at the first entry's section_index."""
    if not entries:
        return None
    first_idx = entries[0].section_index
    if 0 <= first_idx < len(doc_structure.paragraphs):
        return doc_structure.paragraphs[first_idx].style_name
    return None


def _detect_loops(
    entries: list[MappingEntry],
    zone_by_index: dict[int, str],
    template_type: str,
) -> list[dict]:
    """Rule 1: Detect loop patterns.

    Find consecutive entries where marker_type is "table_row_loop" or
    "control_flow" and they share a loop variable prefix.
    """
    blueprints: list[dict] = []
    loop_types = {"table_row_loop", "control_flow"}

    # Sort entries by section_index for consecutive detection
    sorted_entries = sorted(entries, key=lambda e: e.section_index)

    # Group consecutive loop-type entries by prefix
    current_group: list[MappingEntry] = []
    current_prefix: str | None = None

    for entry in sorted_entries:
        if entry.marker_type not in loop_types:
            # Flush current group if we have one
            if len(current_group) >= 2:
                zone = zone_by_index.get(current_group[0].section_index, "unknown")
                blueprints.append({
                    "templateType": template_type,
                    "zone": zone,
                    "patternType": "loop",
                    "markers": [
                        {"gwField": e.gw_field, "markerType": e.marker_type}
                        for e in current_group
                    ],
                    "anchorStyle": None,
                })
            current_group = []
            current_prefix = None
            continue

        prefix = _get_field_prefix(entry.gw_field)
        if current_prefix is None or prefix == current_prefix:
            current_group.append(entry)
            current_prefix = prefix
        else:
            # Different prefix -- flush and start new group
            if len(current_group) >= 2:
                zone = zone_by_index.get(current_group[0].section_index, "unknown")
                blueprints.append({
                    "templateType": template_type,
                    "zone": zone,
                    "patternType": "loop",
                    "markers": [
                        {"gwField": e.gw_field, "markerType": e.marker_type}
                        for e in current_group
                    ],
                    "anchorStyle": None,
                })
            current_group = [entry]
            current_prefix = prefix

    # Flush final group
    if len(current_group) >= 2:
        zone = zone_by_index.get(current_group[0].section_index, "unknown")
        blueprints.append({
            "templateType": template_type,
            "zone": zone,
            "patternType": "loop",
            "markers": [
                {"gwField": e.gw_field, "markerType": e.marker_type}
                for e in current_group
            ],
            "anchorStyle": None,
        })

    return blueprints


def _detect_groups(
    entries: list[MappingEntry],
    zone_by_index: dict[int, str],
    doc_structure: DocxStructure,
    template_type: str,
) -> list[dict]:
    """Rule 2: Detect group patterns.

    Find entries sharing a gw_field prefix within the same zone and within
    10 paragraph indices of each other.
    """
    blueprints: list[dict] = []

    # Exclude loop/control_flow entries (handled by Rule 1)
    non_loop_entries = [e for e in entries if e.marker_type not in {"table_row_loop", "control_flow"}]

    # Group by (prefix, zone)
    groups: dict[tuple[str, str], list[MappingEntry]] = defaultdict(list)
    for entry in non_loop_entries:
        prefix = _get_field_prefix(entry.gw_field)
        zone = zone_by_index.get(entry.section_index, "unknown")
        groups[(prefix, zone)].append(entry)

    for (prefix, zone), group_entries in groups.items():
        if len(group_entries) < 2:
            continue

        # Sort by section_index
        sorted_group = sorted(group_entries, key=lambda e: e.section_index)

        # Check proximity: all entries must be within 10 indices of each other
        min_idx = sorted_group[0].section_index
        max_idx = sorted_group[-1].section_index
        if max_idx - min_idx > 10:
            # Split into sub-groups within 10 indices
            sub_groups = _split_by_proximity(sorted_group, max_gap=10)
            for sub in sub_groups:
                if len(sub) >= 2:
                    anchor = _get_anchor_style(sub, doc_structure)
                    blueprints.append({
                        "templateType": template_type,
                        "zone": zone,
                        "patternType": "group",
                        "markers": [
                            {"gwField": e.gw_field, "markerType": e.marker_type}
                            for e in sub
                        ],
                        "anchorStyle": anchor,
                    })
        else:
            anchor = _get_anchor_style(sorted_group, doc_structure)
            blueprints.append({
                "templateType": template_type,
                "zone": zone,
                "patternType": "group",
                "markers": [
                    {"gwField": e.gw_field, "markerType": e.marker_type}
                    for e in sorted_group
                ],
                "anchorStyle": anchor,
            })

    return blueprints


def _split_by_proximity(
    entries: list[MappingEntry], max_gap: int
) -> list[list[MappingEntry]]:
    """Split a sorted list of entries into sub-groups where consecutive entries
    are within max_gap paragraph indices of each other."""
    if not entries:
        return []

    groups: list[list[MappingEntry]] = [[entries[0]]]
    for entry in entries[1:]:
        if entry.section_index - groups[-1][-1].section_index <= max_gap:
            groups[-1].append(entry)
        else:
            groups.append([entry])
    return groups


def _detect_conditionals(
    entries: list[MappingEntry],
    zone_by_index: dict[int, str],
    template_type: str,
) -> list[dict]:
    """Rule 3: Detect conditional patterns.

    Find control_flow entries with if/endif patterns that bracket other
    mapping entries.
    """
    blueprints: list[dict] = []

    # Find control_flow entries
    cf_entries = [e for e in entries if e.marker_type == "control_flow"]
    if len(cf_entries) < 2:
        return blueprints

    # Sort by section_index
    sorted_cf = sorted(cf_entries, key=lambda e: e.section_index)

    # Look for if/endif pairs: entries whose placeholder_template contains
    # {% if ...%} paired with {% endif %}
    if_stack: list[MappingEntry] = []
    all_indices = {e.section_index for e in entries}

    for cf in sorted_cf:
        tpl = cf.placeholder_template.lower().strip()
        if "endif" in tpl or "endfor" in tpl:
            # Close: pair with most recent if on stack
            if if_stack:
                opener = if_stack.pop()
                # Find entries bracketed between opener and this closer
                bracketed = [
                    e for e in entries
                    if opener.section_index < e.section_index < cf.section_index
                    and e.marker_type != "control_flow"
                ]
                if bracketed:
                    zone = zone_by_index.get(opener.section_index, "unknown")
                    all_markers = (
                        [{"gwField": opener.gw_field, "markerType": opener.marker_type}]
                        + [{"gwField": e.gw_field, "markerType": e.marker_type} for e in bracketed]
                        + [{"gwField": cf.gw_field, "markerType": cf.marker_type}]
                    )
                    blueprints.append({
                        "templateType": template_type,
                        "zone": zone,
                        "patternType": "conditional",
                        "markers": all_markers,
                        "anchorStyle": None,
                    })
        elif "if " in tpl or "for " in tpl:
            if_stack.append(cf)

    return blueprints
