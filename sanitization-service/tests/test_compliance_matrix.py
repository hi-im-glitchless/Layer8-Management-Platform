"""Unit tests for compliance_matrix.py -- framework mapping and risk scoring."""

import pytest

from app.services.compliance_matrix import (
    ALL_FRAMEWORKS,
    COMPLIANCE_MATRIX,
    RISK_LEVEL_THRESHOLDS,
    SEVERITY_WEIGHTS,
    compute_compliance_scores,
    compute_risk_score,
    get_risk_level,
)


# ---------------------------------------------------------------------------
# COMPLIANCE_MATRIX structure tests
# ---------------------------------------------------------------------------


class TestComplianceMatrix:
    def test_has_at_least_14_categories(self):
        assert len(COMPLIANCE_MATRIX) >= 14

    def test_each_category_maps_to_frameworks(self):
        for category, frameworks in COMPLIANCE_MATRIX.items():
            assert isinstance(frameworks, list), f"{category} should map to a list"
            assert len(frameworks) >= 1, f"{category} should have at least 1 framework"
            assert len(frameworks) <= 5, f"{category} should have at most 5 frameworks"

    def test_all_frameworks_appear_at_least_once(self):
        all_mapped = set()
        for frameworks in COMPLIANCE_MATRIX.values():
            all_mapped.update(frameworks)
        for fw in ALL_FRAMEWORKS:
            assert fw in all_mapped, f"{fw} not mapped by any category"

    def test_only_known_frameworks_used(self):
        known = set(ALL_FRAMEWORKS)
        for category, frameworks in COMPLIANCE_MATRIX.items():
            for fw in frameworks:
                assert fw in known, f"Unknown framework '{fw}' in {category}"


# ---------------------------------------------------------------------------
# compute_risk_score tests
# ---------------------------------------------------------------------------


class TestComputeRiskScore:
    def test_all_critical(self):
        """All critical -> score 100.0."""
        result = compute_risk_score({"critical": 10})
        assert result == pytest.approx(100.0)

    def test_all_low(self):
        """All low -> score = 2/15 * 100 = 13.33."""
        result = compute_risk_score({"low": 10})
        assert result == pytest.approx(2 / 15 * 100, rel=1e-2)

    def test_empty_findings(self):
        """No findings -> 0.0."""
        result = compute_risk_score({})
        assert result == 0.0

    def test_zero_counts(self):
        """All zero counts -> 0.0."""
        result = compute_risk_score({"critical": 0, "high": 0, "medium": 0, "low": 0})
        assert result == 0.0

    def test_mixed_severities(self):
        """Known computation: 2 critical + 5 high + 10 medium + 3 low.

        weighted = 2*15 + 5*10 + 10*5 + 3*2 = 30 + 50 + 50 + 6 = 136
        max = 20 * 15 = 300
        score = 136/300 * 100 = 45.33
        """
        result = compute_risk_score({
            "critical": 2,
            "high": 5,
            "medium": 10,
            "low": 3,
        })
        expected = (2 * 15 + 5 * 10 + 10 * 5 + 3 * 2) / (20 * 15) * 100
        assert result == pytest.approx(expected, rel=1e-4)

    def test_single_finding(self):
        """Single high finding: 10/15 * 100 = 66.67."""
        result = compute_risk_score({"high": 1})
        assert result == pytest.approx(10 / 15 * 100, rel=1e-2)

    def test_result_between_0_and_100(self):
        """Score should always be in [0, 100]."""
        result = compute_risk_score({
            "critical": 100,
            "high": 100,
            "medium": 100,
            "low": 100,
        })
        assert 0.0 <= result <= 100.0

    def test_info_has_zero_weight(self):
        """Info findings contribute 0 weight but increase max_possible."""
        result = compute_risk_score({"info": 5})
        assert result == 0.0

    def test_deterministic(self):
        """Same input always produces same output."""
        counts = {"critical": 3, "high": 7, "medium": 15, "low": 5}
        r1 = compute_risk_score(counts)
        r2 = compute_risk_score(counts)
        assert r1 == r2


# ---------------------------------------------------------------------------
# get_risk_level tests
# ---------------------------------------------------------------------------


class TestGetRiskLevel:
    def test_critical_range(self):
        assert get_risk_level(75.0) == "Critical"
        assert get_risk_level(100.0) == "Critical"

    def test_high_range(self):
        assert get_risk_level(50.0) == "High"
        assert get_risk_level(74.0) == "High"

    def test_medium_range(self):
        assert get_risk_level(25.0) == "Medium"
        assert get_risk_level(49.0) == "Medium"

    def test_low_range(self):
        assert get_risk_level(0.0) == "Low"
        assert get_risk_level(24.0) == "Low"


# ---------------------------------------------------------------------------
# compute_compliance_scores tests
# ---------------------------------------------------------------------------


class TestComputeComplianceScores:
    def test_returns_scores_for_all_frameworks(self):
        findings = [
            {"category": "Injection", "severity": "high"},
        ]
        scores = compute_compliance_scores(findings)
        for fw in ALL_FRAMEWORKS:
            assert fw in scores

    def test_empty_findings(self):
        scores = compute_compliance_scores([])
        for fw in ALL_FRAMEWORKS:
            assert scores[fw] == 0.0

    def test_all_critical_injection(self):
        """All critical injection findings -> max score for affected frameworks."""
        findings = [
            {"category": "Injection", "severity": "critical"},
        ]
        scores = compute_compliance_scores(findings)
        # Injection affects ISO 27001, NIST CSF, PCI-DSS, CIS Controls
        assert scores["ISO 27001"] == pytest.approx(100.0)
        assert scores["NIST CSF"] == pytest.approx(100.0)
        assert scores["PCI-DSS"] == pytest.approx(100.0)
        assert scores["CIS Controls"] == pytest.approx(100.0)
        # GDPR not affected by Injection
        assert scores["GDPR"] == 0.0

    def test_unknown_category_ignored(self):
        """Findings with unknown categories should not affect any framework."""
        findings = [
            {"category": "UnknownCategory", "severity": "critical"},
        ]
        scores = compute_compliance_scores(findings)
        for fw in ALL_FRAMEWORKS:
            assert scores[fw] == 0.0

    def test_mixed_findings(self):
        """Multiple findings across categories compute correctly."""
        findings = [
            {"category": "Injection", "severity": "critical"},
            {"category": "Cryptography", "severity": "medium"},
        ]
        scores = compute_compliance_scores(findings)
        # Both categories affect ISO 27001
        # ISO: critical(15) + medium(5) / (15 + 15) = 20/30 = 66.67
        assert scores["ISO 27001"] == pytest.approx(20 / 30 * 100, rel=1e-2)
        # GDPR only affected by Cryptography
        # GDPR: medium(5) / 15 = 33.33
        assert scores["GDPR"] == pytest.approx(5 / 15 * 100, rel=1e-2)

    def test_scores_between_0_and_100(self):
        findings = [
            {"category": cat, "severity": "critical"}
            for cat in COMPLIANCE_MATRIX.keys()
        ]
        scores = compute_compliance_scores(findings)
        for fw, score in scores.items():
            assert 0.0 <= score <= 100.0, f"{fw} score {score} out of range"

    def test_missing_severity_defaults_to_medium(self):
        """Findings without severity key default to medium weight."""
        findings = [{"category": "Injection"}]
        scores = compute_compliance_scores(findings)
        # medium weight = 5, max = 15 -> 33.33%
        assert scores["ISO 27001"] == pytest.approx(5 / 15 * 100, rel=1e-2)
