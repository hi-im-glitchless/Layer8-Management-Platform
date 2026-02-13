"""Unit tests for gap detection service."""
from unittest.mock import patch

import pytest

from app.models.adapter import (
    Jinja2Pattern,
    MappingEntry,
    MappingPlan,
    ReferenceTemplateInfo,
)
from app.models.gap_detection import GapDetectionResult
from app.services.gap_detector import detect_gaps


def _make_mapping_entry(
    gw_field: str,
    section_index: int = 0,
    marker_type: str = "text",
) -> MappingEntry:
    """Helper to create a MappingEntry with minimal required fields."""
    return MappingEntry(
        section_index=section_index,
        section_text=f"Test paragraph for {gw_field}",
        gw_field=gw_field,
        placeholder_template=f"{{{{ {gw_field} }}}}",
        confidence=0.9,
        marker_type=marker_type,
    )


def _make_reference_info(
    patterns: list[tuple[str, str, str]],
) -> ReferenceTemplateInfo:
    """Helper to build a ReferenceTemplateInfo from (gw_field, marker_type, context) tuples."""
    return ReferenceTemplateInfo(
        template_type="web",
        language="en",
        filename="test.docx",
        patterns=[
            Jinja2Pattern(
                pattern=f"{{{{ {gw} }}}}",
                marker_type=mt,
                gw_field=gw,
                context=ctx,
            )
            for gw, mt, ctx in patterns
        ],
        placeholder_count=len(patterns),
    )


class TestDetectGaps:
    """Tests for detect_gaps()."""

    @patch("app.services.gap_detector.load_reference_template")
    def test_complete_mapping_returns_no_gaps(self, mock_load):
        """When all expected fields are mapped, gaps list should be empty."""
        ref = _make_reference_info([
            ("client.short_name", "text", "Client: Acme"),
            ("project.start_date", "text", "Start: 2025-01-01"),
            ("finding.title", "text", "SQL Injection"),
        ])
        mock_load.return_value = ref

        plan = MappingPlan(
            entries=[
                _make_mapping_entry("client.short_name", section_index=0),
                _make_mapping_entry("project.start_date", section_index=1),
                _make_mapping_entry("finding.title", section_index=2),
            ],
            template_type="web",
            language="en",
        )

        result = detect_gaps(plan, "web", "en")

        assert len(result.gaps) == 0
        assert result.mapped_field_count == 3
        assert result.expected_field_count == 3
        assert result.coverage_percent == 100.0

    @patch("app.services.gap_detector.load_reference_template")
    def test_partial_mapping_returns_missing_fields(self, mock_load):
        """When some fields are missing from the mapping plan, they appear as gaps."""
        ref = _make_reference_info([
            ("client.short_name", "text", "Client: Acme"),
            ("project.start_date", "text", "Start: 2025-01-01"),
            ("project.end_date", "text", "End: 2025-02-01"),
            ("finding.title", "text", "SQL Injection"),
        ])
        mock_load.return_value = ref

        plan = MappingPlan(
            entries=[
                _make_mapping_entry("client.short_name", section_index=0),
                _make_mapping_entry("finding.title", section_index=3),
            ],
            template_type="web",
            language="en",
        )

        result = detect_gaps(plan, "web", "en")

        assert len(result.gaps) == 2
        gap_fields = {g.gw_field for g in result.gaps}
        assert "project.start_date" in gap_fields
        assert "project.end_date" in gap_fields
        assert result.mapped_field_count == 2
        assert result.expected_field_count == 4
        assert result.coverage_percent == 50.0

    @patch("app.services.gap_detector.load_reference_template")
    def test_control_flow_fields_excluded(self, mock_load):
        """Control flow and table row loop fields should not count as gaps."""
        ref = _make_reference_info([
            ("client.short_name", "text", "Client: Acme"),
            ("for finding in findings", "control_flow", "{% for finding in findings %}"),
            ("for item in scope", "table_row_loop", "{%tr for item in scope %}"),
        ])
        mock_load.return_value = ref

        plan = MappingPlan(
            entries=[
                _make_mapping_entry("client.short_name", section_index=0),
            ],
            template_type="web",
            language="en",
        )

        result = detect_gaps(plan, "web", "en")

        # Only client.short_name is expected (control_flow/table_row_loop excluded)
        assert len(result.gaps) == 0
        assert result.expected_field_count == 1
        assert result.mapped_field_count == 1
        assert result.coverage_percent == 100.0

    @patch("app.services.gap_detector.load_reference_template")
    def test_coverage_percent_calculation(self, mock_load):
        """Coverage percent should be mapped_count / expected_count * 100."""
        ref = _make_reference_info([
            ("client.short_name", "text", "Client"),
            ("project.start_date", "text", "Start"),
            ("project.end_date", "text", "End"),
            ("report_date", "text", "Report"),
            ("finding.title", "text", "Title"),
        ])
        mock_load.return_value = ref

        plan = MappingPlan(
            entries=[
                _make_mapping_entry("client.short_name", section_index=0),
                _make_mapping_entry("finding.title", section_index=4),
            ],
            template_type="web",
            language="en",
        )

        result = detect_gaps(plan, "web", "en")

        assert result.expected_field_count == 5
        assert result.mapped_field_count == 2
        assert result.coverage_percent == 40.0

    @patch("app.services.gap_detector.load_reference_template")
    def test_gap_entries_have_expected_context(self, mock_load):
        """Each gap entry should include the expected_context from the reference pattern."""
        ref = _make_reference_info([
            ("client.short_name", "text", "Client Name: Acme Corporation"),
            ("project.start_date", "text", "Assessment Period: January 2025"),
        ])
        mock_load.return_value = ref

        plan = MappingPlan(
            entries=[
                _make_mapping_entry("client.short_name", section_index=0),
            ],
            template_type="web",
            language="en",
        )

        result = detect_gaps(plan, "web", "en")

        assert len(result.gaps) == 1
        gap = result.gaps[0]
        assert gap.gw_field == "project.start_date"
        assert gap.expected_context == "Assessment Period: January 2025"
        assert gap.marker_type == "text"
        assert gap.estimated_paragraph_index is not None

    @patch("app.services.gap_detector.load_reference_template")
    def test_empty_mapping_plan(self, mock_load):
        """An empty mapping plan should report all reference fields as gaps."""
        ref = _make_reference_info([
            ("client.short_name", "text", "Client"),
            ("finding.title", "text", "Title"),
        ])
        mock_load.return_value = ref

        plan = MappingPlan(
            entries=[],
            template_type="web",
            language="en",
        )

        result = detect_gaps(plan, "web", "en")

        assert len(result.gaps) == 2
        assert result.mapped_field_count == 0
        assert result.coverage_percent == 0.0

    @patch("app.services.gap_detector.load_reference_template")
    def test_deduplicated_reference_fields(self, mock_load):
        """Duplicate gw_field values in reference patterns should count once."""
        ref = _make_reference_info([
            ("finding.title", "text", "Finding title context 1"),
            ("finding.title", "text", "Finding title context 2"),
            ("client.short_name", "text", "Client context"),
        ])
        mock_load.return_value = ref

        plan = MappingPlan(
            entries=[
                _make_mapping_entry("finding.title", section_index=0),
            ],
            template_type="web",
            language="en",
        )

        result = detect_gaps(plan, "web", "en")

        # finding.title counted once (deduplicated), client.short_name is the gap
        assert result.expected_field_count == 2
        assert result.mapped_field_count == 1
        assert len(result.gaps) == 1
        assert result.gaps[0].gw_field == "client.short_name"
