"""Jinja2 template renderer service -- renders DOCX templates with rich text support."""
import logging
import re
from html.parser import HTMLParser
from io import BytesIO
from typing import Any

from docxtpl import DocxTemplate, RichText
from jinja2 import Environment, UndefinedError, Undefined

logger = logging.getLogger(__name__)

# Fields that contain HTML and need rich text conversion
RICH_TEXT_FIELDS = frozenset({
    "description",
    "impact",
    "recommendation",
    "replication_steps",
    "affected_entities",
})

# CVSS calculator base URL
CVSS_CALCULATOR_URL = "https://www.first.org/cvss/calculator/3.1#"


class _HTMLToRichTextParser(HTMLParser):
    """Stdlib HTMLParser that builds a docxtpl RichText from simple HTML tags.

    Supported tags: <p>, <b>/<strong>, <i>/<em>, <a href>, <br>, <ul>, <ol>, <li>,
    <div> (stripped), plus XHTML namespace attributes are ignored.
    """

    def __init__(self, tpl: DocxTemplate) -> None:
        super().__init__(convert_charrefs=True)
        self._tpl = tpl
        self._rt = RichText()
        self._bold = False
        self._italic = False
        self._href: str | None = None
        self._in_list = False
        self._list_ordered = False
        self._list_counter = 0
        self._pending_newline = False
        self._has_content = False

    @property
    def result(self) -> RichText:
        return self._rt

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        # Filter out xmlns attributes (XHTML namespace declarations)
        attrs = [(k, v) for k, v in attrs if not k.startswith("xmlns")]

        if tag in ("b", "strong"):
            self._bold = True
        elif tag in ("i", "em"):
            self._italic = True
        elif tag == "a":
            for k, v in attrs:
                if k == "href" and v:
                    self._href = v
        elif tag == "p":
            if self._has_content:
                self._pending_newline = True
        elif tag == "br":
            self._pending_newline = True
        elif tag == "ul":
            self._in_list = True
            self._list_ordered = False
            self._list_counter = 0
        elif tag == "ol":
            self._in_list = True
            self._list_ordered = True
            self._list_counter = 0
        elif tag == "li":
            if self._has_content:
                self._pending_newline = True
            self._list_counter += 1
            if self._list_ordered:
                prefix = f"{self._list_counter}. "
            else:
                prefix = "- "
            self._rt.add(prefix, bold=False, italic=False)
            self._has_content = True
        # div and other container tags: silently ignore

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in ("b", "strong"):
            self._bold = False
        elif tag in ("i", "em"):
            self._italic = False
        elif tag == "a":
            self._href = None
        elif tag == "p":
            self._pending_newline = True
        elif tag in ("ul", "ol"):
            self._in_list = False
            self._list_ordered = False

    def handle_data(self, data: str) -> None:
        text = data
        if not text:
            return

        if self._pending_newline and self._has_content:
            self._rt.add("\n", bold=False, italic=False)
            self._pending_newline = False

        if self._href:
            url_id = self._tpl.build_url_id(self._href)
            self._rt.add(text, bold=self._bold, italic=self._italic, url_id=url_id)
        else:
            self._rt.add(text, bold=self._bold, italic=self._italic)

        self._has_content = True


def html_to_richtext(html_string: str, tpl: DocxTemplate) -> RichText:
    """Convert an HTML string to a docxtpl RichText object.

    Handles <p>, <b>/<strong>, <i>/<em>, <a href>, <br>, <ul>, <ol>, <li>.
    Strips <div> containers and XHTML namespace declarations.

    Args:
        html_string: HTML content from Ghostwriter findings.
        tpl: The DocxTemplate instance (needed for hyperlink URL IDs).

    Returns:
        A docxtpl RichText object suitable for ``{{r ...}}`` or ``{{p ...}}`` markers.
    """
    if not html_string or not html_string.strip():
        return RichText()

    # Strip XHTML namespace declarations from the HTML
    cleaned = re.sub(r'\s+xmlns\s*=\s*"[^"]*"', "", html_string)
    cleaned = re.sub(r'\s+xmlns\s*=\s*\'[^\']*\'', "", cleaned)

    parser = _HTMLToRichTextParser(tpl)
    parser.feed(cleaned)
    return parser.result


def _make_severity_rt(severity: str, color: str, tpl: DocxTemplate) -> RichText:
    """Create a coloured RichText object for a finding severity label.

    Args:
        severity: Severity label (e.g. "Critical", "High").
        color: Hex colour string from GW (e.g. "FF0000" or "#FF0000").
        tpl: The DocxTemplate instance.

    Returns:
        RichText with the severity text in the specified colour.
    """
    rt = RichText()
    # Normalise colour -- strip leading '#' if present
    hex_color = color.lstrip("#") if color else None
    rt.add(severity, bold=True, color=hex_color)
    return rt


def _make_cvss_link_rt(cvss_vector: str, tpl: DocxTemplate) -> RichText:
    """Create a RichText hyperlink to the FIRST.org CVSS calculator for a vector.

    Args:
        cvss_vector: CVSS vector string (e.g. "CVSS:3.1/AV:N/AC:L/...").
        tpl: The DocxTemplate instance.

    Returns:
        RichText with the vector as a clickable hyperlink, or plain text if empty.
    """
    rt = RichText()
    if not cvss_vector:
        return rt
    url = f"{CVSS_CALCULATOR_URL}{cvss_vector}"
    url_id = tpl.build_url_id(url)
    rt.add(cvss_vector, url_id=url_id, italic=False, bold=False)
    return rt


def prepare_context(raw_context: dict, tpl: DocxTemplate) -> dict:
    """Walk the template context and convert HTML fields to RichText objects.

    For each finding in ``raw_context["findings"]``:
      - Adds ``_rt`` suffixed versions of known HTML fields
      - Adds ``severity_rt`` (coloured RichText)
      - Adds ``cvss_vector_link_rt`` (hyperlink RichText)

    Other top-level keys are passed through unchanged.

    Args:
        raw_context: The template context dict from ghostwriterMapper.
        tpl: The DocxTemplate instance.

    Returns:
        A new dict with RichText objects added alongside raw HTML strings.
    """
    ctx = dict(raw_context)

    findings = ctx.get("findings", [])
    enriched_findings = []

    for finding in findings:
        f = dict(finding)

        # Convert known HTML fields to RichText
        for field in RICH_TEXT_FIELDS:
            html_value = f.get(field, "")
            if html_value:
                f[f"{field}_rt"] = html_to_richtext(html_value, tpl)
            else:
                f[f"{field}_rt"] = RichText()

        # Severity as coloured RichText
        severity_label = f.get("severity", "")
        severity_color = f.get("severity_color", "")
        f["severity_rt"] = _make_severity_rt(severity_label, severity_color, tpl)

        # Classification as plain text (not rich text, just the type string)
        f["classification_rt"] = f.get("finding_type", "")

        # CVSS vector as clickable hyperlink
        cvss_vector = f.get("cvss_vector", "")
        f["cvss_vector_link_rt"] = _make_cvss_link_rt(cvss_vector, tpl)

        enriched_findings.append(f)

    ctx["findings"] = enriched_findings
    return ctx


def _filter_type(findings: list[dict], types: list[str]) -> list[dict]:
    """Custom Jinja2 filter: filter findings by finding_type.

    Used by Internal templates to categorise findings:
        ``findings|filter_type(["Web"])``

    Args:
        findings: List of finding dicts.
        types: List of type strings to match against ``finding_type``.

    Returns:
        Filtered list of findings whose ``finding_type`` matches any of the given types.
    """
    if not types:
        return findings
    type_set = {t.lower() for t in types}
    return [f for f in findings if f.get("finding_type", "").lower() in type_set]


class TemplateRendererService:
    """Renders DOCX Jinja2 templates with Ghostwriter report data.

    Handles:
    - Loading DOCX templates via docxtpl
    - HTML-to-RichText conversion for findings fields
    - Custom Jinja2 filters (filter_type)
    - Error handling for undefined variables and malformed templates
    """

    def render(self, template_bytes: bytes, context: dict) -> bytes:
        """Render a DOCX template with the given context.

        The context is pre-processed to convert HTML strings in known fields
        to docxtpl RichText objects. Custom Jinja2 filters are registered.

        Args:
            template_bytes: Raw bytes of a .docx template with Jinja2 markers.
            context: Template context dict (from ghostwriterMapper or test fixture).

        Returns:
            Rendered DOCX file as bytes.

        Raises:
            ValueError: If the template cannot be loaded or rendered.
        """
        # Load the template and initialise the underlying Document
        # so we can call build_url_id and prepare RichText objects.
        try:
            tpl = DocxTemplate(BytesIO(template_bytes))
            tpl.init_docx()
        except Exception as exc:
            raise ValueError(f"Failed to load DOCX template: {exc}") from exc

        # Build a custom Jinja2 environment with our filters.
        # docxtpl.render() accepts a jinja_env parameter that overrides
        # its default jinja2.Template usage.
        jinja_env = Environment(undefined=Undefined)
        jinja_env.filters["filter_type"] = _filter_type

        # Prepare context: convert HTML to RichText
        prepared = prepare_context(context, tpl)

        # Render
        try:
            tpl.render(prepared, jinja_env=jinja_env)
        except UndefinedError as exc:
            raise ValueError(f"Template rendering error -- undefined variable: {exc}") from exc
        except Exception as exc:
            raise ValueError(f"Failed to render DOCX template: {exc}") from exc

        # Save to bytes
        output = BytesIO()
        tpl.save(output)
        return output.getvalue()
