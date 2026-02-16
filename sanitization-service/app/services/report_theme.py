"""Report theme constants for executive report visualizations.

Defines color palettes that match the Template Executivo branding.
Used by chart_data.py for Chart.js config colors and by the report
builder for consistent visual identity.
"""

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
