"""Unit and integration tests for the batch mapping prompt builder and validation endpoint."""
import json
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.adapter import (
    FewShotExample,
    BatchSelectionInput,
    BatchMappingRequest,
)
from app.services.batch_mapping_prompt import (
    build_batch_mapping_system_prompt,
    build_batch_mapping_user_prompt,
    build_remap_user_prompt,
)
from app.services.reference_loader import load_reference_template


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def web_en_ref():
    """Load Web EN reference template info."""
    return load_reference_template("web", "en")


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


_SAMPLE_FEW_SHOT = [
    FewShotExample(
        normalized_section_text="client name: ___________",
        gw_field="client.short_name",
        marker_type="text",
        usage_count=5,
    ),
    FewShotExample(
        normalized_section_text="assessment period",
        gw_field="project.start_date",
        marker_type="text",
        usage_count=3,
    ),
]

_SAMPLE_SELECTIONS = [
    {"selectionNumber": 1, "text": "Executive Summary of the Security Assessment", "paragraphIndex": 5},
    {"selectionNumber": 2, "text": "SQL Injection in login form", "paragraphIndex": 12},
    {"selectionNumber": 3, "text": "Client Name: Acme Corp", "paragraphIndex": 2},
]

_SAMPLE_PREVIOUS_MAPPINGS = [
    {"selectionNumber": 1, "gwField": "client.short_name"},
    {"selectionNumber": 3, "gwField": "project.start_date"},
]


# ---------------------------------------------------------------------------
# build_batch_mapping_system_prompt tests
# ---------------------------------------------------------------------------


class TestBuildBatchMappingSystemPrompt:
    def test_contains_role_description(self, web_en_ref):
        prompt = build_batch_mapping_system_prompt(web_en_ref)
        assert "mapping user-selected text" in prompt

    def test_contains_gw_field_info(self, web_en_ref):
        prompt = build_batch_mapping_system_prompt(web_en_ref)
        assert "client.short_name" in prompt
        assert "finding.description_rt" in prompt

    def test_contains_reference_patterns(self, web_en_ref):
        prompt = build_batch_mapping_system_prompt(web_en_ref)
        assert "Reference Template Patterns" in prompt

    def test_contains_json_output_format(self, web_en_ref):
        prompt = build_batch_mapping_system_prompt(web_en_ref)
        assert "selectionNumber" in prompt
        assert "gwField" in prompt
        assert "markerType" in prompt
        assert "confidence" in prompt
        assert "JSON array" in prompt

    def test_with_few_shot_includes_section(self, web_en_ref):
        prompt = build_batch_mapping_system_prompt(web_en_ref, few_shot_examples=_SAMPLE_FEW_SHOT)
        assert "Previous Successful Mappings" in prompt
        assert "client name: ___________" in prompt
        assert "(confirmed 5 times)" in prompt

    def test_without_few_shot_no_section(self, web_en_ref):
        prompt = build_batch_mapping_system_prompt(web_en_ref)
        assert "Previous Successful Mappings" not in prompt

    def test_with_empty_few_shot_no_section(self, web_en_ref):
        prompt = build_batch_mapping_system_prompt(web_en_ref, few_shot_examples=[])
        assert "Previous Successful Mappings" not in prompt


# ---------------------------------------------------------------------------
# build_batch_mapping_user_prompt tests
# ---------------------------------------------------------------------------


class TestBuildBatchMappingUserPrompt:
    def test_selections_formatted_as_numbered_list(self):
        prompt = build_batch_mapping_user_prompt(
            _SAMPLE_SELECTIONS,
            "Map each selection to the correct GW field",
        )
        assert '#1 (paragraph 5): "Executive Summary' in prompt
        assert '#2 (paragraph 12): "SQL Injection' in prompt
        assert '#3 (paragraph 2): "Client Name' in prompt

    def test_user_description_included_verbatim(self):
        description = "The first is a finding title, the second is the description"
        prompt = build_batch_mapping_user_prompt(_SAMPLE_SELECTIONS, description)
        assert description in prompt

    def test_multiple_selections_produce_multi_line_list(self):
        prompt = build_batch_mapping_user_prompt(_SAMPLE_SELECTIONS, "test")
        # Count number of selection lines (start with #N where N is a digit)
        import re
        lines = [l for l in prompt.split("\n") if re.match(r"^#\d+\s", l)]
        assert len(lines) == 3

    def test_single_selection(self):
        prompt = build_batch_mapping_user_prompt(
            [{"selectionNumber": 1, "text": "Test text", "paragraphIndex": 0}],
            "Map this",
        )
        assert '#1 (paragraph 0): "Test text"' in prompt

    def test_long_text_truncated(self):
        long_text = "A" * 300
        prompt = build_batch_mapping_user_prompt(
            [{"selectionNumber": 1, "text": long_text, "paragraphIndex": 0}],
            "Map",
        )
        assert "..." in prompt
        # Truncated to 200 chars + "..."
        assert "A" * 200 in prompt

    def test_snake_case_keys_accepted(self):
        """Accept both camelCase and snake_case keys in selection dicts."""
        prompt = build_batch_mapping_user_prompt(
            [{"selection_number": 1, "text": "Test", "paragraph_index": 5}],
            "Map",
        )
        assert '#1 (paragraph 5): "Test"' in prompt


# ---------------------------------------------------------------------------
# build_remap_user_prompt tests
# ---------------------------------------------------------------------------


class TestBuildRemapUserPrompt:
    def test_only_includes_specified_selections(self):
        # Only selections 2 and 3 are being re-mapped
        rejected = [_SAMPLE_SELECTIONS[1], _SAMPLE_SELECTIONS[2]]
        prompt = build_remap_user_prompt(
            rejected,
            "#2 is the finding description, #3 is the client name",
            _SAMPLE_PREVIOUS_MAPPINGS,
        )
        assert "#2" in prompt
        assert "#3" in prompt
        # Selection #1 should only appear in confirmed context, not in re-map list
        lines_in_remap_section = False
        for line in prompt.split("\n"):
            if "Selections to Re-map" in line:
                lines_in_remap_section = True
            if lines_in_remap_section and line.startswith("#"):
                assert not line.startswith("#1 (paragraph")

    def test_includes_confirmed_mapping_context(self):
        prompt = build_remap_user_prompt(
            [_SAMPLE_SELECTIONS[1]],
            "This is the finding description",
            _SAMPLE_PREVIOUS_MAPPINGS,
        )
        assert "Already Confirmed Mappings" in prompt
        assert "#1 -> client.short_name" in prompt
        assert "#3 -> project.start_date" in prompt

    def test_empty_previous_mappings(self):
        prompt = build_remap_user_prompt(
            [_SAMPLE_SELECTIONS[0]],
            "Map this",
            [],
        )
        assert "Already Confirmed" not in prompt

    def test_re_map_instruction_present(self):
        prompt = build_remap_user_prompt(
            [_SAMPLE_SELECTIONS[0]],
            "Map this",
            [],
        )
        assert "Re-map only" in prompt


# ---------------------------------------------------------------------------
# POST /adapter/validate-batch-mapping tests
# ---------------------------------------------------------------------------


class TestValidateBatchMappingEndpoint:
    def _make_selections(self):
        return [
            {"selection_number": 1, "text": "Executive Summary", "paragraph_index": 5},
            {"selection_number": 2, "text": "SQL Injection", "paragraph_index": 12},
            {"selection_number": 3, "text": "Client Name", "paragraph_index": 2},
        ]

    def test_valid_json_with_matching_numbers(self, client):
        llm_response = json.dumps([
            {"selectionNumber": 1, "gwField": "client.short_name", "markerType": "text", "confidence": 0.9, "rationale": "matches"},
            {"selectionNumber": 2, "gwField": "finding.title", "markerType": "text", "confidence": 0.85, "rationale": "finding"},
            {"selectionNumber": 3, "gwField": "project.start_date", "markerType": "text", "confidence": 0.7, "rationale": "date field"},
        ])
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": self._make_selections(),
                "template_type": "web",
                "language": "en",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert len(data["mappings"]) == 3
        assert data["errors"] == []

    def test_invalid_json_returns_error(self, client):
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": "not valid json at all",
                "selections": self._make_selections(),
                "template_type": "web",
                "language": "en",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert any("Invalid JSON" in e for e in data["errors"])

    def test_markdown_fenced_json_accepted(self, client):
        llm_response = "```json\n" + json.dumps([
            {"selectionNumber": 1, "gwField": "client.short_name", "markerType": "text", "confidence": 0.9, "rationale": "test"},
            {"selectionNumber": 2, "gwField": "finding.title", "markerType": "text", "confidence": 0.8, "rationale": "test"},
            {"selectionNumber": 3, "gwField": "report_date", "markerType": "text", "confidence": 0.7, "rationale": "test"},
        ]) + "\n```"
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": self._make_selections(),
                "template_type": "web",
                "language": "en",
            },
        )
        data = response.json()
        assert data["valid"] is True
        assert len(data["mappings"]) == 3

    def test_missing_selection_numbers_error(self, client):
        """When LLM doesn't resolve all selections, errors list unresolved."""
        llm_response = json.dumps([
            {"selectionNumber": 1, "gwField": "client.short_name", "markerType": "text", "confidence": 0.9, "rationale": "test"},
            # Selections 2 and 3 are missing
        ])
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": self._make_selections(),
                "template_type": "web",
                "language": "en",
            },
        )
        data = response.json()
        # Has valid mappings but also errors for unresolved
        assert data["valid"] is False  # unresolved selections make it invalid
        assert len(data["mappings"]) == 1
        assert any("Unresolved selections" in e for e in data["errors"])
        assert "#2" in str(data["errors"])
        assert "#3" in str(data["errors"])

    def test_unknown_gw_field_produces_warning(self, client):
        """Unknown gwField is a warning, not an error."""
        llm_response = json.dumps([
            {"selectionNumber": 1, "gwField": "some.unknown.field", "markerType": "text", "confidence": 0.9, "rationale": "test"},
            {"selectionNumber": 2, "gwField": "finding.title", "markerType": "text", "confidence": 0.8, "rationale": "test"},
            {"selectionNumber": 3, "gwField": "client.short_name", "markerType": "text", "confidence": 0.7, "rationale": "test"},
        ])
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": self._make_selections(),
                "template_type": "web",
                "language": "en",
            },
        )
        data = response.json()
        assert data["valid"] is True  # warnings don't prevent validity
        assert len(data["mappings"]) == 3
        assert any("unknown gwField" in w for w in data["warnings"])

    def test_mismatched_selection_number_error(self, client):
        """Selection number that doesn't match any input is an error."""
        llm_response = json.dumps([
            {"selectionNumber": 99, "gwField": "client.short_name", "markerType": "text", "confidence": 0.9, "rationale": "test"},
        ])
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": [{"selection_number": 1, "text": "Test", "paragraph_index": 0}],
                "template_type": "web",
                "language": "en",
            },
        )
        data = response.json()
        assert data["valid"] is False
        assert any("99" in e for e in data["errors"])

    def test_invalid_marker_type_error(self, client):
        llm_response = json.dumps([
            {"selectionNumber": 1, "gwField": "client.short_name", "markerType": "bogus_type", "confidence": 0.9, "rationale": "test"},
        ])
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": [{"selection_number": 1, "text": "Test", "paragraph_index": 0}],
                "template_type": "web",
                "language": "en",
            },
        )
        data = response.json()
        assert data["valid"] is False
        assert any("bogus_type" in e for e in data["errors"])

    def test_snake_case_llm_fields_accepted(self, client):
        """LLM may return snake_case field names -- should be accepted."""
        llm_response = json.dumps([
            {"selection_number": 1, "gw_field": "client.short_name", "marker_type": "text", "confidence": 0.9, "rationale": "test"},
            {"selection_number": 2, "gw_field": "finding.title", "marker_type": "text", "confidence": 0.8, "rationale": "test"},
            {"selection_number": 3, "gw_field": "report_date", "marker_type": "text", "confidence": 0.7, "rationale": "test"},
        ])
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": self._make_selections(),
                "template_type": "web",
                "language": "en",
            },
        )
        data = response.json()
        assert data["valid"] is True
        assert len(data["mappings"]) == 3

    def test_object_with_mappings_key_accepted(self, client):
        """LLM may wrap array in an object with a 'mappings' key."""
        llm_response = json.dumps({
            "mappings": [
                {"selectionNumber": 1, "gwField": "client.short_name", "markerType": "text", "confidence": 0.9, "rationale": "test"},
                {"selectionNumber": 2, "gwField": "finding.title", "markerType": "text", "confidence": 0.8, "rationale": "test"},
                {"selectionNumber": 3, "gwField": "report_date", "markerType": "text", "confidence": 0.7, "rationale": "test"},
            ]
        })
        response = client.post(
            "/adapter/validate-batch-mapping",
            json={
                "llm_response": llm_response,
                "selections": self._make_selections(),
                "template_type": "web",
                "language": "en",
            },
        )
        data = response.json()
        assert data["valid"] is True
        assert len(data["mappings"]) == 3
