"""Unit tests for report_narrative_prompt.py -- Pass 2 narrative prompt builder."""

import json

import pytest

from app.services.report_narrative_prompt import (
    NARRATIVE_SECTION_KEYS,
    STRATEGIC_RECOMMENDATION_KEYS,
    build_narrative_system_prompt,
    build_narrative_user_prompt,
    validate_narrative_response,
)


# ---------------------------------------------------------------------------
# System prompt tests
# ---------------------------------------------------------------------------


class TestBuildNarrativeSystemPrompt:
    def test_returns_non_empty_string(self):
        prompt = build_narrative_system_prompt("en")
        assert isinstance(prompt, str)
        assert len(prompt) > 0

    def test_mentions_executive_audience(self):
        prompt = build_narrative_system_prompt("en")
        assert "C-level" in prompt or "executive" in prompt.lower()

    def test_specifies_all_section_keys(self):
        prompt = build_narrative_system_prompt("en")
        for key in NARRATIVE_SECTION_KEYS:
            assert key in prompt, f"Section key '{key}' missing from system prompt"

    def test_specifies_strategic_recommendation_sub_keys(self):
        prompt = build_narrative_system_prompt("en")
        for key in STRATEGIC_RECOMMENDATION_KEYS:
            assert key in prompt, f"Recommendation sub-key '{key}' missing"

    def test_english_language(self):
        prompt = build_narrative_system_prompt("en")
        assert "English" in prompt

    def test_portuguese_language(self):
        prompt = build_narrative_system_prompt("pt-pt")
        assert "pt-pt" in prompt

    def test_mentions_json_only(self):
        prompt = build_narrative_system_prompt("en")
        assert "ONLY valid JSON" in prompt

    def test_mentions_business_impact_style(self):
        prompt = build_narrative_system_prompt("en")
        assert "business impact" in prompt.lower() or "Business impact" in prompt

    def test_mentions_bold_emphasis(self):
        prompt = build_narrative_system_prompt("en")
        assert "**bold**" in prompt

    def test_mentions_sanitized_placeholders(self):
        prompt = build_narrative_system_prompt("en")
        assert "sanitized" in prompt.lower()

    def test_has_12_sections(self):
        """The schema should define exactly 11 top-level keys + strategic_recommendations sub-keys."""
        assert len(NARRATIVE_SECTION_KEYS) == 11
        assert len(STRATEGIC_RECOMMENDATION_KEYS) == 4


# ---------------------------------------------------------------------------
# User prompt tests
# ---------------------------------------------------------------------------


class TestBuildNarrativeUserPrompt:
    @pytest.fixture
    def sample_findings(self):
        return [
            {
                "title": "SQL Injection in Login",
                "severity": "critical",
                "category": "Injection",
                "cvss_score": 9.8,
                "business_impact": "Full database compromise",
            },
            {
                "title": "Missing HSTS Header",
                "severity": "low",
                "category": "Configuration",
                "business_impact": "",
            },
        ]

    @pytest.fixture
    def sample_metrics(self):
        return {
            "severity_counts": {"critical": 1, "high": 3, "medium": 5, "low": 2},
            "category_counts": {"Injection": 3, "Configuration": 4, "XSS": 2},
            "total": 11,
        }

    @pytest.fixture
    def sample_compliance_scores(self):
        return {
            "ISO 27001": 65.0,
            "NIST CSF": 72.0,
            "GDPR": 45.0,
            "PCI-DSS": 80.0,
            "CIS Controls": 55.0,
        }

    def test_includes_risk_score(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 67.5, {}
        )
        assert "67.5" in prompt

    def test_includes_severity_counts(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, {}
        )
        assert "Critical: 1" in prompt
        assert "High: 3" in prompt

    def test_includes_total_findings(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, {}
        )
        assert "Total findings: 11" in prompt

    def test_includes_compliance_scores(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, {}
        )
        assert "ISO 27001" in prompt
        assert "NIST CSF" in prompt
        assert "GDPR" in prompt

    def test_includes_findings_summary(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, {}
        )
        assert "SQL Injection in Login" in prompt
        assert "CRITICAL" in prompt

    def test_includes_cvss_when_available(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, {}
        )
        assert "CVSS: 9.8" in prompt

    def test_includes_chart_descriptions(self, sample_findings, sample_metrics, sample_compliance_scores):
        charts = {"pie_chart": "Shows 60% high severity findings"}
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, charts
        )
        assert "pie_chart" in prompt
        assert "60% high severity" in prompt

    def test_includes_instructions(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, {}
        )
        assert "Instructions" in prompt

    def test_empty_findings(self):
        prompt = build_narrative_user_prompt(
            [], {"severity_counts": {}, "total": 0}, {}, 0.0, {}
        )
        assert "Total findings: 0" in prompt

    def test_category_distribution(self, sample_findings, sample_metrics, sample_compliance_scores):
        prompt = build_narrative_user_prompt(
            sample_findings, sample_metrics, sample_compliance_scores, 50.0, {}
        )
        assert "Injection: 3" in prompt
        assert "Configuration: 4" in prompt


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


class TestValidateNarrativeResponse:
    def test_valid_full_response(self):
        response_data = {
            "executive_summary": "This report summarizes...",
            "risk_score_explanation": "The risk score of 67.5...",
            "key_metrics_text": "Out of 11 findings...",
            "severity_analysis": "The majority of findings...",
            "category_analysis": "Injection vulnerabilities...",
            "key_threats": "The most critical threat...",
            "compliance_risk_text": "ISO 27001 compliance...",
            "top_vulnerabilities_text": "Top vulnerability...",
            "strategic_recommendations": {
                "immediate": "Patch SQL injection...",
                "short_term": "Implement WAF...",
                "long_term": "Security program...",
                "board_recommendations": "The board should...",
            },
            "positive_aspects": "Strong password policy...",
            "conclusion": "In conclusion...",
        }
        result = validate_narrative_response(json.dumps(response_data))

        for key in NARRATIVE_SECTION_KEYS:
            assert key in result

        assert result["executive_summary"] == "This report summarizes..."
        assert result["strategic_recommendations"]["immediate"] == "Patch SQL injection..."

    def test_invalid_json_raises(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            validate_narrative_response("not valid json")

    def test_not_dict_raises(self):
        with pytest.raises(ValueError, match="must be a JSON object"):
            validate_narrative_response('"just a string"')

    def test_fills_missing_sections_with_empty_string(self):
        response = json.dumps({"executive_summary": "Summary text"})
        result = validate_narrative_response(response)

        assert result["executive_summary"] == "Summary text"
        assert result["conclusion"] == ""
        assert result["severity_analysis"] == ""

    def test_fills_missing_recommendation_sub_keys(self):
        response = json.dumps({
            "strategic_recommendations": {"immediate": "Do this now"},
        })
        result = validate_narrative_response(response)

        assert result["strategic_recommendations"]["immediate"] == "Do this now"
        assert result["strategic_recommendations"]["short_term"] == ""
        assert result["strategic_recommendations"]["long_term"] == ""
        assert result["strategic_recommendations"]["board_recommendations"] == ""

    def test_handles_non_dict_recommendations(self):
        response = json.dumps({
            "strategic_recommendations": "not a dict",
        })
        result = validate_narrative_response(response)
        assert result["strategic_recommendations"]["immediate"] == ""

    def test_handles_non_string_section_values(self):
        response = json.dumps({
            "executive_summary": 42,
            "conclusion": ["not", "a", "string"],
        })
        result = validate_narrative_response(response)
        assert result["executive_summary"] == ""
        assert result["conclusion"] == ""

    def test_all_sections_present_in_result(self):
        result = validate_narrative_response("{}")
        for key in NARRATIVE_SECTION_KEYS:
            assert key in result

    def test_strategic_recommendations_has_all_sub_keys(self):
        result = validate_narrative_response("{}")
        for sub_key in STRATEGIC_RECOMMENDATION_KEYS:
            assert sub_key in result["strategic_recommendations"]
