"""Report theme constants and matplotlib configuration.

Defines color palettes, font settings, and chart defaults that match
the Template Executivo branding. All chart-rendering code imports
constants from this module to ensure visual consistency.
"""

import matplotlib

# ---------------------------------------------------------------------------
# Severity colors -- match Template Executivo severity badges
# ---------------------------------------------------------------------------

SEVERITY_COLORS: dict[str, str] = {
    "critical": "#C62828",
    "high": "#E53935",
    "medium": "#FB8C00",
    "low": "#43A047",
    "info": "#1E88E5",
}

# ---------------------------------------------------------------------------
# Brand colors -- Layer8 corporate palette from Template Executivo
# ---------------------------------------------------------------------------

BRAND_COLORS: dict[str, str] = {
    "primary": "#1A237E",
    "secondary": "#283593",
    "accent": "#42A5F5",
    "background": "#F5F5F5",
    "text": "#212121",
    "confidential": "#C62828",
}

# ---------------------------------------------------------------------------
# Chart font settings
# ---------------------------------------------------------------------------

CHART_FONTS: dict[str, int | str] = {
    "title_size": 14,
    "label_size": 10,
    "tick_size": 8,
    "font_family": "Arial",
}

# ---------------------------------------------------------------------------
# Chart rendering defaults
# ---------------------------------------------------------------------------

CHART_DPI: int = 200
CHART_SIZE: tuple[int, int] = (6, 4)


def configure_matplotlib() -> None:
    """Configure matplotlib for headless chart rendering.

    Sets the non-interactive Agg backend and applies default rcParams
    from the report theme (font family, sizes, DPI). Must be called
    before any Figure creation.
    """
    matplotlib.use("Agg")

    matplotlib.rcParams.update(
        {
            "font.family": CHART_FONTS["font_family"],
            "font.size": CHART_FONTS["label_size"],
            "axes.titlesize": CHART_FONTS["title_size"],
            "axes.labelsize": CHART_FONTS["label_size"],
            "xtick.labelsize": CHART_FONTS["tick_size"],
            "ytick.labelsize": CHART_FONTS["tick_size"],
            "figure.dpi": CHART_DPI,
            "savefig.dpi": CHART_DPI,
            "figure.figsize": list(CHART_SIZE),
        }
    )
