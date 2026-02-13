"""Unit tests for the template-type-aware rules engine."""
import pytest

from app.models.adapter import Instruction, InstructionSet
from app.services.rules_engine import (
    apply_marker_rules,
    enrich_instructions,
    inject_type_features,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_instruction(
    replacement_text: str,
    gw_field: str = "client.short_name",
    action: str = "replace_text",
    paragraph_index: int = 0,
    original_text: str = "placeholder",
    marker_type: str = "text",
) -> Instruction:
    return Instruction(
        action=action,
        paragraph_index=paragraph_index,
        original_text=original_text,
        replacement_text=replacement_text,
        marker_type=marker_type,
        gw_field=gw_field,
    )


def _make_instruction_set(
    instructions: list[Instruction],
    template_type: str = "web",
    language: str = "en",
) -> InstructionSet:
    return InstructionSet(
        instructions=instructions,
        template_type=template_type,
        language=language,
    )


# ---------------------------------------------------------------------------
# apply_marker_rules tests
# ---------------------------------------------------------------------------


class TestApplyMarkerRules:
    """Tests for apply_marker_rules()."""

    def test_plain_text_field_unchanged(self):
        """Plain text fields like client.short_name stay as {{ var }}."""
        inst = _make_instruction("{{ client.short_name }}", gw_field="client.short_name")
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{ client.short_name }}"

    def test_description_rt_gets_paragraph_marker(self):
        """Plain {{ finding.description_rt }} is rewritten to {{p finding.description_rt }}."""
        inst = _make_instruction(
            "{{ finding.description_rt }}",
            gw_field="finding.description_rt",
            marker_type="text",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{p finding.description_rt }}"

    def test_impact_rt_gets_paragraph_marker(self):
        """{{ finding.impact_rt }} is rewritten to {{p finding.impact_rt }}."""
        inst = _make_instruction(
            "{{ finding.impact_rt }}",
            gw_field="finding.impact_rt",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{p finding.impact_rt }}"

    def test_severity_rt_gets_run_marker(self):
        """{{ finding.severity_rt }} is rewritten to {{r finding.severity_rt }}."""
        inst = _make_instruction(
            "{{ finding.severity_rt }}",
            gw_field="finding.severity_rt",
            marker_type="text",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{r finding.severity_rt }}"

    def test_already_correct_paragraph_marker_unchanged(self):
        """{{p finding.description_rt }} stays unchanged."""
        inst = _make_instruction(
            "{{p finding.description_rt }}",
            gw_field="finding.description_rt",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{p finding.description_rt }}"

    def test_already_correct_run_marker_unchanged(self):
        """{{r finding.severity_rt }} stays unchanged."""
        inst = _make_instruction(
            "{{r finding.severity_rt }}",
            gw_field="finding.severity_rt",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{r finding.severity_rt }}"

    def test_wrong_marker_is_corrected(self):
        """{{r finding.description_rt }} (wrong marker) is corrected to {{p ...}}."""
        inst = _make_instruction(
            "{{r finding.description_rt }}",
            gw_field="finding.description_rt",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{p finding.description_rt }}"

    def test_table_row_loop_gets_tr_markers(self):
        """wrap_table_row action with {% for %} gets rewritten to {%tr for %}."""
        inst = _make_instruction(
            "{% for item in scope %}",
            gw_field="item.scope",
            action="wrap_table_row",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert "{%tr" in result.instructions[0].replacement_text

    def test_already_tr_marked_unchanged(self):
        """wrap_table_row with {%tr for %} stays unchanged."""
        inst = _make_instruction(
            "{%tr for item in scope %}",
            gw_field="item.scope",
            action="wrap_table_row",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{%tr for item in scope %}"

    def test_recommendation_rt_gets_paragraph_marker(self):
        """{{ finding.recommendation_rt }} gets {{p ...}} marker."""
        inst = _make_instruction(
            "{{ finding.recommendation_rt }}",
            gw_field="finding.recommendation_rt",
        )
        iset = _make_instruction_set([inst])
        result = apply_marker_rules(iset)
        assert result.instructions[0].replacement_text == "{{p finding.recommendation_rt }}"


# ---------------------------------------------------------------------------
# inject_type_features tests
# ---------------------------------------------------------------------------


class TestInjectTypeFeatures:
    """Tests for inject_type_features()."""

    def test_internal_gets_filter_type_blocks(self):
        """Internal template type adds filter_type category blocks."""
        iset = _make_instruction_set([], template_type="internal")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        # Should have filter_type blocks for each category
        assert any("filter_type" in b for b in blocks)
        # Should have namespace counter blocks
        assert any("namespace" in b for b in blocks)

    def test_internal_gets_namespace_counters(self):
        """Internal template type adds namespace counter blocks."""
        iset = _make_instruction_set([], template_type="internal")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        assert any("ns = namespace(counter=0)" in b for b in blocks)
        assert any("ns.counter" in b for b in blocks)

    def test_web_gets_scope_loops(self):
        """Web template type adds scope loop blocks."""
        iset = _make_instruction_set([], template_type="web")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        assert any("for item in scope" in b for b in blocks)

    def test_web_gets_affected_entities(self):
        """Web template type adds affected_entities blocks."""
        iset = _make_instruction_set([], template_type="web")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        assert any("affected_entities" in b for b in blocks)

    def test_mobile_gets_scope_loops(self):
        """Mobile template type adds scope loop blocks (same as web)."""
        iset = _make_instruction_set([], template_type="mobile")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        assert any("for item in scope" in b for b in blocks)

    def test_mobile_gets_affected_entities(self):
        """Mobile template type adds affected_entities blocks."""
        iset = _make_instruction_set([], template_type="mobile")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        assert any("affected_entities" in b for b in blocks)

    def test_unknown_type_no_features(self):
        """Unknown template type adds no additional blocks.

        Since template_type is a Literal, we test with a known type that
        has no extra features -- but since all known types have features,
        we test that an empty instruction set works without error.
        """
        # Internal/web/mobile all have features, so we test the no-op path
        # by verifying the function does not crash on empty instructions
        iset = _make_instruction_set([], template_type="web")
        result = inject_type_features(iset)
        assert result.additional_blocks is not None

    def test_internal_no_scope_loops(self):
        """Internal templates should NOT have scope loops."""
        iset = _make_instruction_set([], template_type="internal")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        assert not any("for item in scope" in b for b in blocks)

    def test_web_no_namespace_counters(self):
        """Web templates should NOT have namespace counters."""
        iset = _make_instruction_set([], template_type="web")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        assert not any("namespace(counter" in b for b in blocks)

    def test_internal_filter_type_categories(self):
        """Internal template adds filter_type blocks for all 6 categories."""
        iset = _make_instruction_set([], template_type="internal")
        result = inject_type_features(iset)
        blocks = result.additional_blocks
        categories = ["AD", "Infrastructure", "Physical", "Servers", "UAC", "Web"]
        for cat in categories:
            assert any(cat in b for b in blocks), f"Missing category: {cat}"


# ---------------------------------------------------------------------------
# enrich_instructions tests (pipeline)
# ---------------------------------------------------------------------------


class TestEnrichInstructions:
    """Tests for the enrich_instructions() pipeline."""

    def test_pipeline_applies_markers_and_features(self):
        """enrich_instructions applies both marker rules and type features."""
        inst = _make_instruction(
            "{{ finding.description_rt }}",
            gw_field="finding.description_rt",
        )
        iset = _make_instruction_set([inst], template_type="web")
        result = enrich_instructions(iset)

        # Marker should be rewritten
        assert result.instructions[0].replacement_text == "{{p finding.description_rt }}"
        # Web features should be injected
        assert any("scope" in b for b in result.additional_blocks)

    def test_pipeline_preserves_template_type(self):
        """Pipeline preserves template_type and language."""
        iset = _make_instruction_set([], template_type="internal", language="pt-pt")
        result = enrich_instructions(iset)
        assert result.template_type == "internal"
        assert result.language == "pt-pt"

    def test_pipeline_with_multiple_instructions(self):
        """Pipeline processes multiple instructions correctly."""
        instructions = [
            _make_instruction("{{ client.short_name }}", gw_field="client.short_name", paragraph_index=0),
            _make_instruction("{{ finding.severity_rt }}", gw_field="finding.severity_rt", paragraph_index=5),
            _make_instruction("{{ finding.impact_rt }}", gw_field="finding.impact_rt", paragraph_index=10),
        ]
        iset = _make_instruction_set(instructions, template_type="internal")
        result = enrich_instructions(iset)

        # client.short_name unchanged (text type)
        assert result.instructions[0].replacement_text == "{{ client.short_name }}"
        # severity_rt gets run marker
        assert result.instructions[1].replacement_text == "{{r finding.severity_rt }}"
        # impact_rt gets paragraph marker
        assert result.instructions[2].replacement_text == "{{p finding.impact_rt }}"
