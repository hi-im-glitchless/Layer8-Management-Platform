"""Chart renderer for executive report visualizations.

Provides five chart types rendered as PNG bytes via matplotlib. All charts
use colors from report_theme.py and render at 6x4 inches, 200 DPI.
"""

import io
import math

import matplotlib.pyplot as plt
import numpy as np

from app.services.report_theme import (
    BRAND_COLORS,
    CHART_SIZE,
    SEVERITY_COLORS,
    configure_matplotlib,
)


class ChartRenderer:
    """Renders executive report charts to PNG bytes."""

    def __init__(self) -> None:
        configure_matplotlib()

    # ------------------------------------------------------------------
    # 1. Severity pie chart
    # ------------------------------------------------------------------

    def render_severity_pie(self, data: dict[str, int]) -> bytes:
        """Render a pie chart of findings by severity.

        Args:
            data: Mapping of severity label to count (e.g. {"High": 5}).

        Returns:
            PNG image bytes.
        """
        # Filter zero-value entries
        filtered = {k: v for k, v in data.items() if v > 0}
        if not filtered:
            filtered = {"No Findings": 1}

        labels = list(filtered.keys())
        sizes = list(filtered.values())
        colors = [
            SEVERITY_COLORS.get(label.lower(), BRAND_COLORS["accent"])
            for label in labels
        ]

        fig, ax = plt.subplots(figsize=CHART_SIZE)
        wedges, texts, autotexts = ax.pie(
            sizes,
            labels=labels,
            colors=colors,
            autopct="%1.1f%%",
            shadow=True,
            startangle=140,
        )

        for autotext in autotexts:
            autotext.set_fontsize(8)
            autotext.set_color("white")
            autotext.set_fontweight("bold")

        ax.set_title("Severity Distribution", pad=15)
        fig.tight_layout()

        return self._fig_to_png(fig)

    # ------------------------------------------------------------------
    # 2. Category horizontal bar chart
    # ------------------------------------------------------------------

    def render_category_bar(self, data: dict[str, int]) -> bytes:
        """Render a horizontal bar chart of findings by category.

        Args:
            data: Mapping of category name to finding count.

        Returns:
            PNG image bytes.
        """
        if not data:
            data = {"No Data": 0}

        # Sort descending by count
        sorted_items = sorted(data.items(), key=lambda x: x[1])
        labels = [item[0] for item in sorted_items]
        values = [item[1] for item in sorted_items]

        fig, ax = plt.subplots(figsize=CHART_SIZE)
        y_pos = range(len(labels))

        ax.barh(
            y_pos,
            values,
            color=BRAND_COLORS["secondary"],
            edgecolor=BRAND_COLORS["primary"],
            linewidth=0.5,
        )
        ax.set_yticks(y_pos)
        ax.set_yticklabels(labels)
        ax.set_xlabel("Number of Findings")
        ax.set_title("Vulnerabilities by Category", pad=15)
        ax.invert_yaxis()

        fig.tight_layout()
        return self._fig_to_png(fig)

    # ------------------------------------------------------------------
    # 3. Stacked severity bar chart
    # ------------------------------------------------------------------

    def render_stacked_severity_bar(
        self, data: dict[str, dict[str, int]]
    ) -> bytes:
        """Render a stacked bar chart: categories on x, severity segments.

        Args:
            data: Mapping of category -> {severity: count}.
                  Example: {"Injection": {"critical": 1, "high": 3, "medium": 2}}

        Returns:
            PNG image bytes.
        """
        if not data:
            data = {"No Data": {"info": 0}}

        categories = list(data.keys())
        severities = ["critical", "high", "medium", "low", "info"]
        x = np.arange(len(categories))

        fig, ax = plt.subplots(figsize=CHART_SIZE)
        bottom = np.zeros(len(categories))

        for severity in severities:
            values = [
                data[cat].get(severity, 0) for cat in categories
            ]
            if any(v > 0 for v in values):
                ax.bar(
                    x,
                    values,
                    bottom=bottom,
                    label=severity.capitalize(),
                    color=SEVERITY_COLORS[severity],
                    edgecolor="white",
                    linewidth=0.5,
                )
                bottom += np.array(values, dtype=float)

        ax.set_xticks(x)
        ax.set_xticklabels(categories, rotation=45, ha="right")
        ax.set_ylabel("Number of Findings")
        ax.set_title("Severity by Category", pad=15)
        ax.legend(loc="upper right", fontsize=8)

        fig.tight_layout()
        return self._fig_to_png(fig)

    # ------------------------------------------------------------------
    # 4. Compliance radar / spider chart
    # ------------------------------------------------------------------

    def render_compliance_radar(self, scores: dict[str, float]) -> bytes:
        """Render a radar chart with compliance framework scores.

        Args:
            scores: Mapping of framework name to score (0-100).
                    Expected keys: ISO 27001, NIST CSF, GDPR, PCI-DSS, CIS Controls.

        Returns:
            PNG image bytes.
        """
        frameworks = [
            "ISO 27001",
            "NIST CSF",
            "GDPR",
            "PCI-DSS",
            "CIS Controls",
        ]

        values = [scores.get(fw, 0) for fw in frameworks]
        num_vars = len(frameworks)

        # Compute angle for each axis
        angles = [n / float(num_vars) * 2 * math.pi for n in range(num_vars)]
        # Close the polygon
        values_closed = values + [values[0]]
        angles_closed = angles + [angles[0]]

        fig, ax = plt.subplots(
            figsize=CHART_SIZE, subplot_kw={"projection": "polar"}
        )

        ax.plot(
            angles_closed,
            values_closed,
            "o-",
            linewidth=2,
            color=BRAND_COLORS["primary"],
        )
        ax.fill(
            angles_closed,
            values_closed,
            alpha=0.25,
            color=BRAND_COLORS["accent"],
        )

        ax.set_xticks(angles)
        ax.set_xticklabels(frameworks, fontsize=8)
        ax.set_ylim(0, 100)
        ax.set_title("Compliance Risk Assessment", pad=20)

        fig.tight_layout()
        return self._fig_to_png(fig)

    # ------------------------------------------------------------------
    # 5. Risk score card (donut gauge)
    # ------------------------------------------------------------------

    def render_risk_score_card(self, score: float, label: str) -> bytes:
        """Render a circular donut gauge with score in center.

        Args:
            score: Risk score 0-100.
            label: Label text below the score (e.g. "Global Risk Score").

        Returns:
            PNG image bytes.
        """
        score = max(0.0, min(100.0, score))

        # Color gradient: green -> yellow -> red
        if score < 25:
            color = SEVERITY_COLORS["low"]
        elif score < 50:
            color = SEVERITY_COLORS["medium"]
        elif score < 75:
            color = SEVERITY_COLORS["high"]
        else:
            color = SEVERITY_COLORS["critical"]

        fig, ax = plt.subplots(figsize=CHART_SIZE)

        # Donut chart
        sizes = [score, 100 - score]
        colors = [color, BRAND_COLORS["background"]]

        wedges, _ = ax.pie(
            sizes,
            colors=colors,
            startangle=90,
            counterclock=False,
            wedgeprops={"width": 0.35, "edgecolor": "white"},
        )

        # Score text in center
        ax.text(
            0,
            0.05,
            f"{score:.0f}",
            ha="center",
            va="center",
            fontsize=36,
            fontweight="bold",
            color=color,
        )
        ax.text(
            0,
            -0.2,
            label,
            ha="center",
            va="center",
            fontsize=10,
            color=BRAND_COLORS["text"],
        )

        ax.set_title("Risk Score", pad=15)
        fig.tight_layout()
        return self._fig_to_png(fig)

    # ------------------------------------------------------------------
    # Internal helper
    # ------------------------------------------------------------------

    @staticmethod
    def _fig_to_png(fig: plt.Figure) -> bytes:
        """Render a matplotlib Figure to PNG bytes and close it."""
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
