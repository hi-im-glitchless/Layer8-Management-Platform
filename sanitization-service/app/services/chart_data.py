"""Chart.js configuration builder for executive report visualizations.

Computes Chart.js JSON config objects for 6 chart types. No server-side
rendering -- charts are rendered by Chart.js in the browser (frontend
iframe preview) and in Gotenberg's Chromium during PDF conversion.

All configs use colors from report_theme.py for visual consistency.
"""

import logging

from app.services.report_theme import BRAND_COLORS, SEVERITY_COLORS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CSS color map (hex values from report_theme for Chart.js configs)
# ---------------------------------------------------------------------------

CSS_COLORS: dict[str, str] = {
    **SEVERITY_COLORS,
    **{f"brand_{k}": v for k, v in BRAND_COLORS.items()},
}

# Severity ordering for consistent chart legends
_SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]


def compute_chart_configs(
    severity_counts: dict[str, int],
    category_counts: dict[str, int],
    stacked_data: dict[str, dict[str, int]],
    compliance_scores: dict[str, float],
    risk_score: float,
) -> dict[str, dict]:
    """Compute Chart.js JSON config objects for all 6 report charts.

    Args:
        severity_counts: Severity label -> finding count.
        category_counts: Category name -> finding count.
        stacked_data: Category -> {severity: count} for stacked bar.
        compliance_scores: Framework name -> score (0-100).
        risk_score: Global risk score (0-100).

    Returns:
        Dict mapping chart ID to Chart.js config object. Keys:
        severity_pie, category_bar, stacked_severity, compliance_radar,
        risk_score, top_vulnerabilities.
    """
    configs: dict[str, dict] = {}

    configs["severity_pie"] = _build_severity_pie(severity_counts)
    configs["category_bar"] = _build_category_bar(category_counts)
    configs["stacked_severity"] = _build_stacked_severity(stacked_data)
    configs["compliance_radar"] = _build_compliance_radar(compliance_scores)
    configs["risk_score"] = _build_risk_score(risk_score)
    configs["top_vulnerabilities"] = _build_top_vulnerabilities(severity_counts)

    logger.info("Computed %d Chart.js configs", len(configs))
    return configs


# ---------------------------------------------------------------------------
# 1. Severity pie chart
# ---------------------------------------------------------------------------


def _build_severity_pie(data: dict[str, int]) -> dict:
    """Build a pie chart config for severity distribution."""
    filtered = {k: v for k, v in data.items() if v > 0}
    if not filtered:
        filtered = {"No Findings": 1}

    labels = list(filtered.keys())
    values = list(filtered.values())
    colors = [
        SEVERITY_COLORS.get(label.lower(), BRAND_COLORS["accent"])
        for label in labels
    ]

    return {
        "type": "pie",
        "data": {
            "labels": [label.capitalize() for label in labels],
            "datasets": [
                {
                    "data": values,
                    "backgroundColor": colors,
                    "borderColor": "#FFFFFF",
                    "borderWidth": 2,
                }
            ],
        },
        "options": {
            "responsive": True,
            "maintainAspectRatio": True,
            "animation": {"duration": 0},
            "plugins": {
                "title": {
                    "display": True,
                    "text": "Severity Distribution",
                    "font": {"size": 16, "weight": "bold"},
                },
                "legend": {
                    "position": "bottom",
                    "labels": {"padding": 16, "usePointStyle": True},
                },
            },
        },
    }


# ---------------------------------------------------------------------------
# 2. Category horizontal bar chart
# ---------------------------------------------------------------------------


def _build_category_bar(data: dict[str, int]) -> dict:
    """Build a horizontal bar chart config for category distribution."""
    if not data:
        data = {"No Data": 0}

    # Sort descending by count
    sorted_items = sorted(data.items(), key=lambda x: x[1], reverse=True)
    labels = [item[0] for item in sorted_items]
    values = [item[1] for item in sorted_items]

    return {
        "type": "bar",
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "label": "Findings",
                    "data": values,
                    "backgroundColor": BRAND_COLORS["secondary"],
                    "borderColor": BRAND_COLORS["primary"],
                    "borderWidth": 1,
                }
            ],
        },
        "options": {
            "indexAxis": "y",
            "responsive": True,
            "maintainAspectRatio": True,
            "animation": {"duration": 0},
            "plugins": {
                "title": {
                    "display": True,
                    "text": "Vulnerabilities by Category",
                    "font": {"size": 16, "weight": "bold"},
                },
                "legend": {"display": False},
            },
            "scales": {
                "x": {
                    "beginAtZero": True,
                    "title": {
                        "display": True,
                        "text": "Number of Findings",
                    },
                },
            },
        },
    }


# ---------------------------------------------------------------------------
# 3. Stacked severity bar chart
# ---------------------------------------------------------------------------


def _build_stacked_severity(data: dict[str, dict[str, int]]) -> dict:
    """Build a stacked bar chart config: categories on x, severity segments."""
    if not data:
        data = {"No Data": {"info": 0}}

    categories = list(data.keys())

    datasets = []
    for severity in _SEVERITY_ORDER:
        values = [data[cat].get(severity, 0) for cat in categories]
        if any(v > 0 for v in values):
            datasets.append(
                {
                    "label": severity.capitalize(),
                    "data": values,
                    "backgroundColor": SEVERITY_COLORS[severity],
                    "borderColor": "#FFFFFF",
                    "borderWidth": 1,
                }
            )

    return {
        "type": "bar",
        "data": {
            "labels": categories,
            "datasets": datasets,
        },
        "options": {
            "responsive": True,
            "maintainAspectRatio": True,
            "animation": {"duration": 0},
            "plugins": {
                "title": {
                    "display": True,
                    "text": "Severity by Category",
                    "font": {"size": 16, "weight": "bold"},
                },
                "legend": {
                    "position": "top",
                },
            },
            "scales": {
                "x": {"stacked": True},
                "y": {
                    "stacked": True,
                    "beginAtZero": True,
                    "title": {
                        "display": True,
                        "text": "Number of Findings",
                    },
                },
            },
        },
    }


# ---------------------------------------------------------------------------
# 4. Compliance radar chart
# ---------------------------------------------------------------------------


def _build_compliance_radar(scores: dict[str, float]) -> dict:
    """Build a radar chart config for compliance framework scores."""
    frameworks = [
        "ISO 27001",
        "NIST CSF",
        "GDPR",
        "PCI-DSS",
        "CIS Controls",
    ]

    values = [scores.get(fw, 0) for fw in frameworks]

    return {
        "type": "radar",
        "data": {
            "labels": frameworks,
            "datasets": [
                {
                    "label": "Compliance Score",
                    "data": values,
                    "backgroundColor": f"{BRAND_COLORS['accent']}40",
                    "borderColor": BRAND_COLORS["primary"],
                    "borderWidth": 2,
                    "pointBackgroundColor": BRAND_COLORS["primary"],
                    "pointBorderColor": "#FFFFFF",
                    "pointBorderWidth": 2,
                    "pointRadius": 4,
                }
            ],
        },
        "options": {
            "responsive": True,
            "maintainAspectRatio": True,
            "animation": {"duration": 0},
            "plugins": {
                "title": {
                    "display": True,
                    "text": "Compliance Risk Assessment",
                    "font": {"size": 16, "weight": "bold"},
                },
                "legend": {"display": False},
            },
            "scales": {
                "r": {
                    "min": 0,
                    "max": 100,
                    "ticks": {"stepSize": 20},
                },
            },
        },
    }


# ---------------------------------------------------------------------------
# 5. Risk score donut gauge
# ---------------------------------------------------------------------------


def _build_risk_score(score: float) -> dict:
    """Build a doughnut gauge config showing the global risk score."""
    score = max(0.0, min(100.0, score))

    # Color based on score threshold
    if score < 25:
        color = SEVERITY_COLORS["low"]
    elif score < 50:
        color = SEVERITY_COLORS["medium"]
    elif score < 75:
        color = SEVERITY_COLORS["high"]
    else:
        color = SEVERITY_COLORS["critical"]

    return {
        "type": "doughnut",
        "data": {
            "labels": ["Risk Score", "Remaining"],
            "datasets": [
                {
                    "data": [score, 100 - score],
                    "backgroundColor": [color, BRAND_COLORS["background"]],
                    "borderColor": "#FFFFFF",
                    "borderWidth": 2,
                    "cutout": "70%",
                }
            ],
        },
        "options": {
            "responsive": True,
            "maintainAspectRatio": True,
            "animation": {"duration": 0},
            "plugins": {
                "title": {
                    "display": True,
                    "text": "Risk Score",
                    "font": {"size": 16, "weight": "bold"},
                },
                "legend": {"display": False},
                "tooltip": {"enabled": False},
            },
        },
    }


# ---------------------------------------------------------------------------
# 6. Top vulnerabilities bar chart
# ---------------------------------------------------------------------------


def _build_top_vulnerabilities(severity_counts: dict[str, int]) -> dict:
    """Build a bar chart config for top vulnerability severity counts."""
    if not severity_counts:
        severity_counts = {"info": 0}

    # Use severity order for consistent display
    labels = []
    values = []
    colors = []
    for sev in _SEVERITY_ORDER:
        count = severity_counts.get(sev, 0)
        if count > 0:
            labels.append(sev.capitalize())
            values.append(count)
            colors.append(SEVERITY_COLORS[sev])

    if not labels:
        labels = ["No Findings"]
        values = [0]
        colors = [BRAND_COLORS["accent"]]

    return {
        "type": "bar",
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "label": "Findings",
                    "data": values,
                    "backgroundColor": colors,
                    "borderColor": colors,
                    "borderWidth": 1,
                }
            ],
        },
        "options": {
            "responsive": True,
            "maintainAspectRatio": True,
            "animation": {"duration": 0},
            "plugins": {
                "title": {
                    "display": True,
                    "text": "Top Vulnerabilities by Severity",
                    "font": {"size": 16, "weight": "bold"},
                },
                "legend": {"display": False},
            },
            "scales": {
                "y": {
                    "beginAtZero": True,
                    "title": {
                        "display": True,
                        "text": "Number of Findings",
                    },
                },
            },
        },
    }
