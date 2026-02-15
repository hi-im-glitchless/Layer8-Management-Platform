"""Unit tests for chart_renderer.py -- five chart types to PNG."""

import pytest

from app.services.chart_renderer import ChartRenderer


PNG_HEADER = b"\x89PNG"


@pytest.fixture
def renderer():
    """Provide a ChartRenderer instance."""
    return ChartRenderer()


# ---------------------------------------------------------------------------
# Severity pie chart
# ---------------------------------------------------------------------------


class TestRenderSeverityPie:
    def test_returns_png_bytes(self, renderer):
        data = {"Critical": 2, "High": 5, "Medium": 10, "Low": 3}
        result = renderer.render_severity_pie(data)
        assert isinstance(result, bytes)
        assert result[:4] == PNG_HEADER

    def test_single_severity(self, renderer):
        result = renderer.render_severity_pie({"High": 7})
        assert result[:4] == PNG_HEADER

    def test_empty_data_still_renders(self, renderer):
        result = renderer.render_severity_pie({})
        assert result[:4] == PNG_HEADER

    def test_filters_zero_values(self, renderer):
        data = {"Critical": 0, "High": 5, "Medium": 0, "Low": 3}
        result = renderer.render_severity_pie(data)
        assert result[:4] == PNG_HEADER


# ---------------------------------------------------------------------------
# Category horizontal bar chart
# ---------------------------------------------------------------------------


class TestRenderCategoryBar:
    def test_returns_png_bytes(self, renderer):
        data = {"Injection": 8, "XSS": 5, "CSRF": 3, "Config": 2}
        result = renderer.render_category_bar(data)
        assert isinstance(result, bytes)
        assert result[:4] == PNG_HEADER

    def test_single_category(self, renderer):
        result = renderer.render_category_bar({"Injection": 12})
        assert result[:4] == PNG_HEADER

    def test_empty_data(self, renderer):
        result = renderer.render_category_bar({})
        assert result[:4] == PNG_HEADER


# ---------------------------------------------------------------------------
# Stacked severity bar chart
# ---------------------------------------------------------------------------


class TestRenderStackedSeverityBar:
    def test_returns_png_bytes(self, renderer):
        data = {
            "Injection": {"critical": 1, "high": 3, "medium": 2},
            "XSS": {"high": 2, "medium": 4, "low": 1},
        }
        result = renderer.render_stacked_severity_bar(data)
        assert isinstance(result, bytes)
        assert result[:4] == PNG_HEADER

    def test_single_category(self, renderer):
        data = {"Auth": {"critical": 2, "high": 1}}
        result = renderer.render_stacked_severity_bar(data)
        assert result[:4] == PNG_HEADER

    def test_empty_data(self, renderer):
        result = renderer.render_stacked_severity_bar({})
        assert result[:4] == PNG_HEADER


# ---------------------------------------------------------------------------
# Compliance radar chart
# ---------------------------------------------------------------------------


class TestRenderComplianceRadar:
    def test_returns_png_bytes(self, renderer):
        scores = {
            "ISO 27001": 65.0,
            "NIST CSF": 72.0,
            "GDPR": 45.0,
            "PCI-DSS": 80.0,
            "CIS Controls": 55.0,
        }
        result = renderer.render_compliance_radar(scores)
        assert isinstance(result, bytes)
        assert result[:4] == PNG_HEADER

    def test_all_zero_scores(self, renderer):
        scores = {
            "ISO 27001": 0.0,
            "NIST CSF": 0.0,
            "GDPR": 0.0,
            "PCI-DSS": 0.0,
            "CIS Controls": 0.0,
        }
        result = renderer.render_compliance_radar(scores)
        assert result[:4] == PNG_HEADER

    def test_missing_frameworks_default_to_zero(self, renderer):
        scores = {"ISO 27001": 80.0, "GDPR": 60.0}
        result = renderer.render_compliance_radar(scores)
        assert result[:4] == PNG_HEADER


# ---------------------------------------------------------------------------
# Risk score card (donut gauge)
# ---------------------------------------------------------------------------


class TestRenderRiskScoreCard:
    def test_returns_png_bytes(self, renderer):
        result = renderer.render_risk_score_card(72.5, "Global Risk Score")
        assert isinstance(result, bytes)
        assert result[:4] == PNG_HEADER

    def test_zero_score(self, renderer):
        result = renderer.render_risk_score_card(0.0, "Risk")
        assert result[:4] == PNG_HEADER

    def test_max_score(self, renderer):
        result = renderer.render_risk_score_card(100.0, "Risk")
        assert result[:4] == PNG_HEADER

    def test_clamps_above_100(self, renderer):
        result = renderer.render_risk_score_card(150.0, "Risk")
        assert result[:4] == PNG_HEADER

    def test_clamps_below_zero(self, renderer):
        result = renderer.render_risk_score_card(-10.0, "Risk")
        assert result[:4] == PNG_HEADER

    def test_color_gradient_low(self, renderer):
        """Score < 25 should use low (green) color."""
        result = renderer.render_risk_score_card(15.0, "Low Risk")
        assert result[:4] == PNG_HEADER

    def test_color_gradient_critical(self, renderer):
        """Score >= 75 should use critical (red) color."""
        result = renderer.render_risk_score_card(90.0, "Critical Risk")
        assert result[:4] == PNG_HEADER


# ---------------------------------------------------------------------------
# Cross-cutting concerns
# ---------------------------------------------------------------------------


class TestChartRendererGeneral:
    def test_all_charts_produce_different_output(self, renderer):
        """Sanity check: different chart types produce different PNGs."""
        pie = renderer.render_severity_pie({"High": 5, "Low": 3})
        bar = renderer.render_category_bar({"Injection": 5})
        score = renderer.render_risk_score_card(50.0, "Risk")
        assert pie != bar
        assert bar != score

    def test_png_bytes_are_nonzero_length(self, renderer):
        result = renderer.render_severity_pie({"High": 5})
        assert len(result) > 100  # a real PNG is at least a few KB
