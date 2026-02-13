"""Unit tests for the Jinja2 syntax whitelist validator."""
import pytest

from app.models.adapter import Instruction, InstructionSet, ValidationResult
from app.services.jinja2_validator import (
    ALLOWED_FILTERS,
    ALLOWED_VARIABLES,
    validate_instruction,
    validate_instruction_set,
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
# validate_instruction tests
# ---------------------------------------------------------------------------


class TestValidateInstruction:
    """Tests for validate_instruction()."""

    def test_valid_simple_variable(self):
        """Plain {{ client.short_name }} passes validation."""
        inst = _make_instruction("{{ client.short_name }}")
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_rich_text_paragraph_marker(self):
        """{{p finding.description_rt }} passes validation."""
        inst = _make_instruction(
            "{{p finding.description_rt }}",
            gw_field="finding.description_rt",
            marker_type="paragraph_rt",
        )
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_rich_text_run_marker(self):
        """{{r finding.severity_rt }} passes validation."""
        inst = _make_instruction(
            "{{r finding.severity_rt }}",
            gw_field="finding.severity_rt",
            marker_type="run_rt",
        )
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_filter_type(self):
        """{{ findings|filter_type(["Web"]) }} passes validation."""
        inst = _make_instruction(
            '{% for finding in findings|filter_type(["Web"]) %}',
            gw_field="findings",
        )
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_default_filter(self):
        """{{ client.short_name|default("N/A") }} passes validation."""
        inst = _make_instruction('{{ client.short_name|default("N/A") }}')
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_loop_counter(self):
        """{{ '%02d' % loop.index }} passes validation."""
        inst = _make_instruction(
            "{{ '%02d' % loop.index }}",
            gw_field="'%02d' % loop.index",
        )
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_namespace_set(self):
        """{% set ns = namespace(counter=0) %} passes validation."""
        inst = _make_instruction(
            "{% set ns = namespace(counter=0) %}",
            gw_field="ns.counter",
        )
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_table_row_loop(self):
        """{%tr for item in scope %} passes validation."""
        inst = _make_instruction(
            "{%tr for item in scope %}",
            gw_field="item.scope",
            action="wrap_table_row",
        )
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_endfor(self):
        """{%tr endfor %} passes validation."""
        inst = _make_instruction(
            "{%tr endfor %}",
            gw_field="item.scope",
        )
        errors = validate_instruction(inst)
        assert errors == []

    def test_disallowed_os_system(self):
        """{{ os.system("rm -rf /") }} is rejected."""
        inst = _make_instruction('{{ os.system("rm -rf /") }}')
        errors = validate_instruction(inst)
        assert len(errors) > 0
        assert any("Dangerous" in e or "os" in e.lower() for e in errors)

    def test_disallowed_eval_filter(self):
        """{{ x|eval }} is rejected."""
        inst = _make_instruction("{{ x|eval }}")
        errors = validate_instruction(inst)
        assert len(errors) > 0
        assert any("eval" in e.lower() for e in errors)

    def test_disallowed_import(self):
        """{% import os %} is rejected."""
        inst = _make_instruction("{% import os %}")
        errors = validate_instruction(inst)
        assert len(errors) > 0
        assert any("import" in e.lower() or "Dangerous" in e for e in errors)

    def test_disallowed_dunder_access(self):
        """{{ ''.__class__.__mro__ }} is rejected."""
        inst = _make_instruction("{{ ''.__class__.__mro__ }}")
        errors = validate_instruction(inst)
        assert len(errors) > 0

    def test_disallowed_subprocess(self):
        """{{ subprocess.run(...) }} is rejected."""
        inst = _make_instruction('{{ subprocess.run("ls") }}')
        errors = validate_instruction(inst)
        assert len(errors) > 0

    def test_plain_text_no_jinja(self):
        """Plain text with no Jinja2 syntax passes."""
        inst = _make_instruction("Just some plain text")
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_for_loop_findings(self):
        """{% for finding in findings %} passes."""
        inst = _make_instruction("{% for finding in findings %}")
        errors = validate_instruction(inst)
        assert errors == []

    def test_valid_for_loop_scope(self):
        """{%tr for item in scope %} passes."""
        inst = _make_instruction("{%tr for item in scope %}")
        errors = validate_instruction(inst)
        assert errors == []

    def test_disallowed_loop_iterable(self):
        """{% for x in evil_data %} is rejected."""
        inst = _make_instruction("{% for x in evil_data %}")
        errors = validate_instruction(inst)
        assert len(errors) > 0


# ---------------------------------------------------------------------------
# validate_instruction_set tests
# ---------------------------------------------------------------------------


class TestValidateInstructionSet:
    """Tests for validate_instruction_set()."""

    def test_empty_instruction_set_is_valid(self):
        """An empty instruction set should validate successfully."""
        iset = _make_instruction_set([])
        result = validate_instruction_set(iset)
        assert result.valid is True
        assert result.errors == []
        assert result.sanitized_instructions is not None
        assert len(result.sanitized_instructions.instructions) == 0

    def test_all_valid_instructions(self):
        """A set of valid instructions all pass."""
        instructions = [
            _make_instruction("{{ client.short_name }}", paragraph_index=0),
            _make_instruction(
                "{{p finding.description_rt }}",
                gw_field="finding.description_rt",
                paragraph_index=5,
            ),
        ]
        iset = _make_instruction_set(instructions)
        result = validate_instruction_set(iset)
        assert result.valid is True
        assert len(result.sanitized_instructions.instructions) == 2

    def test_negative_paragraph_index_rejected(self):
        """Negative paragraph_index triggers an error."""
        instructions = [
            _make_instruction("{{ client.short_name }}", paragraph_index=-1),
        ]
        iset = _make_instruction_set(instructions)
        result = validate_instruction_set(iset)
        assert result.valid is False
        assert any("non-negative" in e for e in result.errors)
        assert len(result.sanitized_instructions.instructions) == 0

    def test_duplicate_paragraph_action_detected(self):
        """Duplicate paragraph_index + action combinations are detected."""
        instructions = [
            _make_instruction("{{ client.short_name }}", paragraph_index=3, action="replace_text"),
            _make_instruction("{{ project.start_date }}", paragraph_index=3, action="replace_text"),
        ]
        iset = _make_instruction_set(instructions)
        result = validate_instruction_set(iset)
        assert result.valid is False
        assert any("duplicate" in e.lower() for e in result.errors)
        # First instruction should still be valid (only the duplicate fails)
        assert len(result.sanitized_instructions.instructions) == 1

    def test_mixed_valid_and_invalid(self):
        """Valid instructions are kept even when some are invalid."""
        instructions = [
            _make_instruction("{{ client.short_name }}", paragraph_index=0),
            _make_instruction('{{ os.system("rm") }}', paragraph_index=1),
            _make_instruction("{{ project.start_date }}", paragraph_index=2),
        ]
        iset = _make_instruction_set(instructions)
        result = validate_instruction_set(iset)
        assert result.valid is False
        assert len(result.sanitized_instructions.instructions) == 2

    def test_sanitized_preserves_template_type(self):
        """Sanitized instruction set preserves template_type and language."""
        iset = _make_instruction_set([], template_type="internal", language="pt-pt")
        result = validate_instruction_set(iset)
        assert result.sanitized_instructions.template_type == "internal"
        assert result.sanitized_instructions.language == "pt-pt"

    def test_different_actions_same_paragraph_allowed(self):
        """Different actions on the same paragraph_index are allowed."""
        instructions = [
            _make_instruction("{{ client.short_name }}", paragraph_index=3, action="replace_text"),
            _make_instruction("{% for finding in findings %}", paragraph_index=3, action="insert_before"),
        ]
        iset = _make_instruction_set(instructions)
        result = validate_instruction_set(iset)
        assert result.valid is True
        assert len(result.sanitized_instructions.instructions) == 2
