"""Gap detection service -- compares mapping plan against reference template fields.

Identifies GW fields expected by the reference template that are missing from
the mapping plan. Control-flow and table-row-loop fields are excluded since
they are structural markers, not content placeholders.
"""
import logging

from app.models.adapter import (
    MappingPlan,
    TemplateLanguage,
    TemplateType,
)
from app.models.gap_detection import GapDetectionResult, GapEntry
from app.services.reference_loader import load_reference_template

logger = logging.getLogger(__name__)

# Marker types excluded from gap detection (structural, not content)
_EXCLUDED_MARKER_TYPES = {"control_flow", "table_row_loop"}


def detect_gaps(
    mapping_plan: MappingPlan,
    template_type: TemplateType,
    language: TemplateLanguage,
) -> GapDetectionResult:
    """Detect missing GW fields by comparing mapping plan against reference template.

    Args:
        mapping_plan: The validated mapping plan from LLM analysis.
        template_type: One of "web", "internal", "mobile".
        language: One of "en", "pt-pt".

    Returns:
        GapDetectionResult with gaps list, field counts, and coverage percent.
    """
    # Load reference template patterns
    ref_info = load_reference_template(template_type, language)

    # Extract expected GW fields from reference, excluding structural markers
    expected_fields: dict[str, tuple[str, str, int | None]] = {}
    for i, pattern in enumerate(ref_info.patterns):
        if pattern.marker_type in _EXCLUDED_MARKER_TYPES:
            continue
        if pattern.gw_field not in expected_fields:
            expected_fields[pattern.gw_field] = (
                pattern.marker_type,
                pattern.context,
                i,  # Use pattern index as estimated paragraph position
            )

    # Extract mapped GW fields from mapping plan (deduplicated)
    mapped_fields: set[str] = {entry.gw_field for entry in mapping_plan.entries}

    # Compute missing fields
    missing_field_names = set(expected_fields.keys()) - mapped_fields

    # Build gap entries
    gaps: list[GapEntry] = []
    for field_name in sorted(missing_field_names):
        marker_type, context, estimated_idx = expected_fields[field_name]
        gaps.append(
            GapEntry(
                gw_field=field_name,
                marker_type=marker_type,
                expected_context=context,
                estimated_paragraph_index=estimated_idx,
            )
        )

    expected_count = len(expected_fields)
    mapped_count = len(mapped_fields & set(expected_fields.keys()))
    coverage = (mapped_count / expected_count * 100) if expected_count > 0 else 100.0

    logger.info(
        "Gap detection: %d expected, %d mapped, %d gaps, %.1f%% coverage",
        expected_count,
        mapped_count,
        len(gaps),
        coverage,
    )

    return GapDetectionResult(
        gaps=gaps,
        mapped_field_count=mapped_count,
        expected_field_count=expected_count,
        coverage_percent=round(coverage, 1),
    )
