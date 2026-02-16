"""HTML report builder for executive reports.

Reads an HTML skeleton file and assembles a complete HTML document by
injecting LLM-generated narrative sections, Chart.js config attributes,
cover page metadata, and inlined CSS. No python-docx or DOCX construction
-- all output is HTML suitable for Gotenberg Chromium PDF conversion.
"""

import json
import logging
import os
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Skeleton path resolution
# ---------------------------------------------------------------------------

# Base directory for skeleton files (test-templates/executive/)
_SKELETON_DIR = os.path.join(
    os.path.dirname(__file__),  # sanitization-service/app/services/
    "..", "..", "..",            # -> project root
    "test-templates", "executive",
)

SKELETON_PATHS: dict[str, str] = {
    "en": os.path.normpath(os.path.join(_SKELETON_DIR, "skeleton-en.html")),
    "pt-pt": os.path.normpath(os.path.join(_SKELETON_DIR, "skeleton-pt-pt.html")),
    "pt": os.path.normpath(os.path.join(_SKELETON_DIR, "skeleton-pt-pt.html")),
}

CSS_PATH: str = os.path.normpath(os.path.join(_SKELETON_DIR, "report-template.css"))


def get_skeleton_path(language: str) -> str:
    """Resolve the skeleton HTML path for a given language.

    Args:
        language: Language code ("en", "pt-pt", or "pt").

    Returns:
        Absolute path to the skeleton HTML file.

    Raises:
        FileNotFoundError: If no skeleton exists for the language.
    """
    lang = language.lower()
    path = SKELETON_PATHS.get(lang)
    if not path or not os.path.isfile(path):
        raise FileNotFoundError(
            f"No skeleton HTML found for language '{language}'. "
            f"Expected at: {path or 'unknown'}"
        )
    return path


class ReportBuilder:
    """Builds executive report HTML from a skeleton template and data.

    The skeleton HTML defines branding (cover page, section layout, chart
    canvas elements) using CSS classes from report-template.css. This
    builder fills the skeleton with LLM-generated narrative HTML, Chart.js
    config attributes, and cover page metadata.
    """

    def __init__(self, skeleton_path: str) -> None:
        """Load the skeleton HTML into memory.

        Args:
            skeleton_path: Filesystem path to the skeleton HTML file.
        """
        self._skeleton_path = skeleton_path

    def build_report(
        self,
        report_data: dict,
        chart_configs: dict[str, dict],
    ) -> str:
        """Assemble the complete HTML report from skeleton + data + charts.

        Args:
            report_data: Dict with keys:
                - "narrative": dict mapping section_key -> HTML string
                - "metadata": dict with cover page fields
                - "risk_score": float (optional)
                - "risk_level": str (optional)
            chart_configs: Dict mapping chart ID to Chart.js config object
                          (e.g., "severity_pie" -> {type, data, options}).

        Returns:
            Complete HTML document string with inlined CSS.
        """
        # Step 1: Read skeleton HTML
        with open(self._skeleton_path, "r", encoding="utf-8") as f:
            html = f.read()

        # Step 2: Inline the CSS into <head>
        html = self._inline_css(html)

        # Step 3: Fill cover page metadata
        metadata = report_data.get("metadata", {})
        html = self._fill_cover_metadata(html, metadata)

        # Step 4: Fill risk score card values
        risk_score = report_data.get("risk_score")
        risk_level = report_data.get("risk_level", "")
        html = self._fill_risk_score(html, risk_score, risk_level)

        # Step 5: Fill metric values
        narrative = report_data.get("narrative", {})
        metrics = report_data.get("metrics", {})
        html = self._fill_metric_values(html, metrics)

        # Step 6: Fill section content (narrative HTML)
        for section_key, section_html in narrative.items():
            if isinstance(section_html, str) and section_html:
                html = self._fill_section_content(html, section_key, section_html)
            elif isinstance(section_html, dict):
                # Handle nested sections (e.g., strategic_recommendations)
                combined_parts = []
                for sub_key, sub_html in section_html.items():
                    if isinstance(sub_html, str) and sub_html:
                        combined_parts.append(sub_html)
                if combined_parts:
                    html = self._fill_section_content(
                        html, section_key, "\n".join(combined_parts)
                    )

        # Step 7: Embed Chart.js configs on canvas elements
        for chart_id, config in chart_configs.items():
            html = self._embed_chart_config(html, chart_id, config)

        logger.info("Built HTML report from skeleton: %s", self._skeleton_path)
        return html

    def _inline_css(self, html: str) -> str:
        """Read report-template.css and inject it into a <style> tag in <head>.

        This ensures Gotenberg's Chromium can render the CSS without needing
        to fetch an external stylesheet. The original <link> tag is replaced.
        """
        if not os.path.isfile(CSS_PATH):
            logger.warning("CSS file not found at %s, skipping inline", CSS_PATH)
            return html

        with open(CSS_PATH, "r", encoding="utf-8") as f:
            css_content = f.read()

        # Remove @import for Google Fonts (keep the <link> in head instead)
        css_no_import = re.sub(
            r'@import\s+url\([^)]+\)\s*;', '', css_content
        )

        style_tag = f"\n  <style>\n{css_no_import}\n  </style>"

        # Replace the <link rel="stylesheet" href="report-template.css"> with inline
        html = re.sub(
            r'<link\s+rel="stylesheet"\s+href="report-template\.css"\s*/?>',
            style_tag,
            html,
        )

        return html

    def _fill_cover_metadata(self, html: str, metadata: dict) -> str:
        """Replace cover page metadata placeholders."""
        replacements = {
            "[CLIENT_NAME]": metadata.get("client_name", ""),
            "[PROJECT_CODE]": metadata.get("project_code", ""),
            "[REPORT_DATE]": metadata.get("report_date", ""),
            "[START_DATE]": metadata.get("start_date", ""),
            "[END_DATE]": metadata.get("end_date", ""),
        }

        for placeholder, value in replacements.items():
            if value:
                html = html.replace(placeholder, value)

        return html

    def _fill_risk_score(
        self, html: str, risk_score: float | None, risk_level: str
    ) -> str:
        """Fill the risk score card numeric values."""
        if risk_score is not None:
            html = html.replace("[RISK_SCORE]", f"{risk_score:.0f}")
        if risk_level:
            html = html.replace("[RISK_LEVEL]", risk_level)
        return html

    def _fill_metric_values(self, html: str, metrics: dict) -> str:
        """Fill the metric card placeholder values."""
        severity_counts = metrics.get("severity_counts", {})
        category_counts = metrics.get("category_counts", {})
        total = metrics.get("total", 0)

        html = html.replace("[TOTAL]", str(total))
        html = html.replace("[CRITICAL]", str(severity_counts.get("critical", 0)))
        html = html.replace("[HIGH]", str(severity_counts.get("high", 0)))
        html = html.replace("[MEDIUM]", str(severity_counts.get("medium", 0)))
        html = html.replace("[LOW]", str(severity_counts.get("low", 0)))
        html = html.replace("[CATEGORIES]", str(len(category_counts)))

        return html

    def _fill_section_content(
        self, html: str, section_key: str, content_html: str
    ) -> str:
        """Find the <section data-section="key"> and fill its section-content div.

        Uses regex to find `<section data-section="{key}">` and then locate
        the first `<div class="section-content">...</div>` inside it, replacing
        its inner content with the generated HTML.
        """
        # Pattern: find the section, then its first section-content div
        # We look for <div class="section-content"> and replace everything
        # up to its closing </div> (non-greedy, allowing HTML comments)
        section_pattern = re.compile(
            rf'(<section\s+data-section="{re.escape(section_key)}"[^>]*>)'
            r'(.*?)'
            r'(</section>)',
            re.DOTALL,
        )

        match = section_pattern.search(html)
        if not match:
            logger.warning("Section not found in skeleton: %s", section_key)
            return html

        section_inner = match.group(2)

        # Find the first <div class="section-content"> in this section
        content_div_pattern = re.compile(
            r'(<div\s+class="section-content"[^>]*>)'
            r'(.*?)'
            r'(</div>)',
            re.DOTALL,
        )

        content_match = content_div_pattern.search(section_inner)
        if not content_match:
            logger.warning(
                "No section-content div found in section: %s", section_key
            )
            return html

        # Replace the inner content of the section-content div
        new_section_inner = (
            section_inner[:content_match.start()]
            + content_match.group(1)
            + "\n        " + content_html + "\n      "
            + content_match.group(3)
            + section_inner[content_match.end():]
        )

        html = (
            html[:match.start()]
            + match.group(1)
            + new_section_inner
            + match.group(3)
            + html[match.end():]
        )

        logger.debug("Filled section content: %s", section_key)
        return html

    def _embed_chart_config(
        self, html: str, chart_id: str, config: dict
    ) -> str:
        """Set data-config attribute on a <canvas data-chart="{chart_id}"> element."""
        config_json = json.dumps(config, separators=(",", ":"))

        # Escape single quotes in JSON for HTML attribute
        config_escaped = config_json.replace("'", "&#39;")

        # Replace the existing data-config="" with the actual config
        pattern = re.compile(
            rf'(<canvas\s+data-chart="{re.escape(chart_id)}")\s+data-config="[^"]*"',
        )

        replacement = rf"\1 data-config='{config_escaped}'"
        new_html, count = pattern.subn(replacement, html)

        if count == 0:
            logger.warning("Canvas element not found for chart: %s", chart_id)
        else:
            logger.debug("Embedded chart config: %s", chart_id)

        return new_html
