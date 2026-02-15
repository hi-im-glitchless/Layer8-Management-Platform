"""Unit tests for report_extraction_prompt.py -- Pass 1 extraction prompt builder."""

import json

import pytest

from app.services.report_extraction_prompt import (
    build_extraction_system_prompt,
    build_extraction_user_prompt,
    validate_extraction_response,
)


# ---------------------------------------------------------------------------
# System prompt tests
# ---------------------------------------------------------------------------


class TestBuildExtractionSystemPrompt:
    def test_returns_non_empty_string(self):
        prompt = build_extraction_system_prompt("en")
        assert isinstance(prompt, str)
        assert len(prompt) > 0

    def test_contains_json_schema(self):
        prompt = build_extraction_system_prompt("en")
        assert "findings" in prompt
        assert "metadata" in prompt
        assert "warnings" in prompt

    def test_contains_severity_levels(self):
        prompt = build_extraction_system_prompt("en")
        assert "critical" in prompt
        assert "high" in prompt
        assert "medium" in prompt
        assert "low" in prompt

    def test_english_language(self):
        prompt = build_extraction_system_prompt("en")
        assert "Respond in English" in prompt

    def test_portuguese_language(self):
        prompt = build_extraction_system_prompt("pt-pt")
        assert "pt-pt" in prompt

    def test_mentions_json_only(self):
        prompt = build_extraction_system_prompt("en")
        assert "ONLY valid JSON" in prompt

    def test_mentions_sanitized_placeholders(self):
        prompt = build_extraction_system_prompt("en")
        assert "sanitized" in prompt
        assert "placeholder" in prompt.lower()

    def test_includes_category_list(self):
        prompt = build_extraction_system_prompt("en")
        assert "Authentication" in prompt
        assert "Injection" in prompt
        assert "XSS" in prompt

    def test_mentions_cvss(self):
        prompt = build_extraction_system_prompt("en")
        assert "CVSS" in prompt

    def test_mentions_business_impact(self):
        prompt = build_extraction_system_prompt("en")
        # Schema includes business_impact field
        assert "business_impact" in prompt


# ---------------------------------------------------------------------------
# User prompt tests
# ---------------------------------------------------------------------------


class TestBuildExtractionUserPrompt:
    def test_includes_indexed_paragraphs(self):
        paragraphs = [
            "Executive Summary",
            "This report covers the security assessment.",
            "Finding 1: SQL Injection in login endpoint.",
        ]
        prompt = build_extraction_user_prompt(paragraphs)
        assert "[  0]" in prompt
        assert "[  1]" in prompt
        assert "[  2]" in prompt
        assert "Executive Summary" in prompt
        assert "SQL Injection" in prompt

    def test_skips_empty_paragraphs_in_output(self):
        paragraphs = ["Text", "", "More text", "   "]
        prompt = build_extraction_user_prompt(paragraphs)
        assert "[  0] Text" in prompt
        assert "[  2] More text" in prompt

    def test_shows_total_paragraph_count(self):
        paragraphs = ["A", "B", "C"]
        prompt = build_extraction_user_prompt(paragraphs)
        assert "Total paragraphs: 3" in prompt

    def test_empty_paragraphs_list(self):
        prompt = build_extraction_user_prompt([])
        assert "Total paragraphs: 0" in prompt

    def test_includes_skeleton_schema_when_provided(self):
        schema = {"sections": ["Executive Summary", "Findings", "Recommendations"]}
        prompt = build_extraction_user_prompt(["text"], skeleton_schema=schema)
        assert "Executive Report Structure" in prompt
        assert "Executive Summary" in prompt

    def test_no_skeleton_section_when_none(self):
        prompt = build_extraction_user_prompt(["text"], skeleton_schema=None)
        assert "Executive Report Structure" not in prompt

    def test_includes_extraction_instructions(self):
        prompt = build_extraction_user_prompt(["text"])
        assert "Instructions" in prompt
        assert "vulnerability" in prompt.lower() or "finding" in prompt.lower()

    def test_preserves_sanitized_placeholders_instruction(self):
        prompt = build_extraction_user_prompt(["[PERSON_1] found an issue."])
        assert "[PERSON_1]" in prompt


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


class TestValidateExtractionResponse:
    def test_valid_full_response(self):
        response = json.dumps({
            "findings": [
                {
                    "title": "SQL Injection",
                    "description": "Login form vulnerable",
                    "severity": "high",
                    "cvss_score": 8.6,
                    "category": "Injection",
                    "affected_systems": ["web-app"],
                    "remediation": "Use parameterized queries",
                    "business_impact": "Data breach risk",
                }
            ],
            "metadata": {
                "client_name": "[ORG_1]",
                "project_code": "PT-2025-001",
                "start_date": "2025-01-15",
                "end_date": "2025-01-30",
                "scope_summary": "Web application assessment",
            },
            "warnings": ["CVSS score for finding 2 not provided"],
        })
        result = validate_extraction_response(response)
        assert len(result["findings"]) == 1
        assert result["findings"][0]["title"] == "SQL Injection"
        assert result["findings"][0]["severity"] == "high"
        assert result["findings"][0]["cvss_score"] == 8.6
        assert result["metadata"]["client_name"] == "[ORG_1]"
        # 1 original warning + auto-generated few_findings (only 1 finding)
        assert len(result["warnings"]) == 2
        assert any("few_findings" in w for w in result["warnings"])

    def test_invalid_json_raises_value_error(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            validate_extraction_response("not json at all")

    def test_not_a_dict_raises_value_error(self):
        with pytest.raises(ValueError, match="must be a JSON object"):
            validate_extraction_response('"just a string"')

    def test_missing_findings_key_raises(self):
        with pytest.raises(ValueError, match="Missing required key"):
            validate_extraction_response('{"metadata": {}}')

    def test_findings_not_a_list_raises(self):
        with pytest.raises(ValueError, match="must be a list"):
            validate_extraction_response('{"findings": "not a list"}')

    def test_finding_without_title_raises(self):
        response = json.dumps({
            "findings": [{"description": "no title here"}],
        })
        with pytest.raises(ValueError, match="missing required 'title'"):
            validate_extraction_response(response)

    def test_finding_not_dict_raises(self):
        response = json.dumps({
            "findings": ["string-not-dict"],
        })
        with pytest.raises(ValueError, match="must be a dict"):
            validate_extraction_response(response)

    def test_defaults_severity_to_medium(self):
        response = json.dumps({
            "findings": [{"title": "Test finding"}],
        })
        result = validate_extraction_response(response)
        assert result["findings"][0]["severity"] == "medium"

    def test_normalizes_severity_case(self):
        response = json.dumps({
            "findings": [{"title": "Test", "severity": "HIGH"}],
        })
        result = validate_extraction_response(response)
        assert result["findings"][0]["severity"] == "high"

    def test_invalid_severity_defaults_to_medium(self):
        response = json.dumps({
            "findings": [{"title": "Test", "severity": "extreme"}],
        })
        result = validate_extraction_response(response)
        assert result["findings"][0]["severity"] == "medium"

    def test_defaults_missing_optional_fields(self):
        response = json.dumps({
            "findings": [{"title": "Minimal finding"}],
        })
        result = validate_extraction_response(response)
        f = result["findings"][0]
        assert f["description"] == ""
        assert f["cvss_score"] is None
        assert f["affected_systems"] == []
        assert f["remediation"] == ""
        assert f["business_impact"] == ""

    def test_defaults_missing_metadata(self):
        response = json.dumps({
            "findings": [{"title": "Test"}],
        })
        result = validate_extraction_response(response)
        for key in ["client_name", "project_code", "start_date", "end_date", "scope_summary"]:
            assert key in result["metadata"]

    def test_defaults_missing_warnings(self):
        response = json.dumps({
            "findings": [{"title": "Test"}],
        })
        result = validate_extraction_response(response)
        # No explicit warnings, but auto-warnings are generated for:
        # missing_cvss (no cvss_score), few_findings (1 finding), incomplete_metadata
        assert len(result["warnings"]) == 3
        assert any("missing_cvss" in w for w in result["warnings"])
        assert any("few_findings" in w for w in result["warnings"])
        assert any("incomplete_metadata" in w for w in result["warnings"])

    def test_handles_metadata_not_dict(self):
        response = json.dumps({
            "findings": [{"title": "Test"}],
            "metadata": "not a dict",
        })
        result = validate_extraction_response(response)
        assert result["metadata"]["client_name"] is None

    def test_handles_warnings_not_list(self):
        response = json.dumps({
            "findings": [{"title": "Test"}],
            "warnings": "not a list",
        })
        result = validate_extraction_response(response)
        # Invalid warnings list is reset to [], then auto-warnings are added
        assert len(result["warnings"]) == 3
        assert any("missing_cvss" in w for w in result["warnings"])
        assert any("few_findings" in w for w in result["warnings"])
        assert any("incomplete_metadata" in w for w in result["warnings"])

    def test_multiple_findings(self):
        response = json.dumps({
            "findings": [
                {"title": "SQLi", "severity": "critical"},
                {"title": "XSS", "severity": "high"},
                {"title": "Config", "severity": "low"},
            ],
        })
        result = validate_extraction_response(response)
        assert len(result["findings"]) == 3
        assert result["findings"][0]["severity"] == "critical"
        assert result["findings"][1]["severity"] == "high"
        assert result["findings"][2]["severity"] == "low"
