"""DOCX report builder for executive reports.

Loads a skeleton DOCX file and programmatically fills it with narrative
text, chart images, and cover page metadata using python-docx. No Jinja2
or docxtpl -- all construction is done via python-docx APIs directly.
"""

import io
import logging
from typing import Any

from docx import Document
from docx.shared import Inches

logger = logging.getLogger(__name__)


class ReportBuilder:
    """Builds executive report DOCX from a skeleton template and data.

    The skeleton DOCX defines branding (headers, footers, fonts, colors,
    logos) and contains section headings and chart placeholder paragraphs
    (e.g., ``[CHART: Severity Distribution]``). This builder fills the
    skeleton with computed narrative text and chart images.
    """

    def __init__(self, skeleton_path: str) -> None:
        """Load the skeleton DOCX into memory.

        Args:
            skeleton_path: Filesystem path to the skeleton DOCX file.
        """
        self._skeleton_path = skeleton_path
        self._doc = Document(skeleton_path)

    def build_report(
        self,
        report_data: dict[str, Any],
        chart_images: dict[str, bytes],
    ) -> bytes:
        """Fill the skeleton DOCX with report content and return bytes.

        This is a stub implementation that creates a minimal working DOCX
        with the provided data. Full layout matching Template Executivo
        will be implemented in Plan 06-C when routes are wired.

        Args:
            report_data: Dict with narrative sections keyed by section name,
                         plus "metadata" sub-dict with cover page fields.
            chart_images: Dict mapping chart placeholder names to PNG bytes.

        Returns:
            DOCX file as bytes (valid ZIP/DOCX).
        """
        # Work on a fresh copy of the skeleton
        doc = Document(self._skeleton_path)

        # Fill cover page metadata
        metadata = report_data.get("metadata", {})
        self._fill_cover_metadata(doc, metadata)

        # Fill text sections
        narrative = report_data.get("narrative", {})
        for section_key, text in narrative.items():
            if isinstance(text, str) and text:
                self._fill_text_section(doc, section_key, text)
            elif isinstance(text, dict):
                # Handle nested sections (e.g., strategic_recommendations)
                for sub_key, sub_text in text.items():
                    if isinstance(sub_text, str) and sub_text:
                        composite_key = f"{section_key}.{sub_key}"
                        self._fill_text_section(doc, composite_key, sub_text)

        # Replace chart placeholders with images
        for placeholder_name, image_bytes in chart_images.items():
            self._replace_chart_placeholder(doc, placeholder_name, image_bytes)

        # Serialize to bytes
        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return buf.read()

    def _fill_cover_metadata(self, doc: Document, metadata: dict) -> None:
        """Fill cover page fields (client name, date, project code).

        Searches all paragraphs for placeholder markers like
        ``[CLIENT_NAME]``, ``[PROJECT_CODE]``, ``[REPORT_DATE]``
        and replaces them with actual values.
        """
        replacements = {
            "[CLIENT_NAME]": metadata.get("client_name", ""),
            "[PROJECT_CODE]": metadata.get("project_code", ""),
            "[REPORT_DATE]": metadata.get("report_date", ""),
            "[START_DATE]": metadata.get("start_date", ""),
            "[END_DATE]": metadata.get("end_date", ""),
        }

        for paragraph in doc.paragraphs:
            for placeholder, value in replacements.items():
                if placeholder in paragraph.text and value:
                    for run in paragraph.runs:
                        if placeholder in run.text:
                            run.text = run.text.replace(placeholder, value)

    def _replace_chart_placeholder(
        self, doc: Document, placeholder_text: str, image_bytes: bytes
    ) -> None:
        """Find paragraph with chart placeholder and replace with image.

        Searches for paragraphs containing ``[CHART: <placeholder_text>]``
        and replaces the paragraph content with the chart image.

        Args:
            doc: The python-docx Document being built.
            placeholder_text: The chart name (e.g., "Severity Distribution").
            image_bytes: PNG image bytes to insert.
        """
        marker = f"[CHART: {placeholder_text}]"

        for paragraph in doc.paragraphs:
            if marker in paragraph.text:
                # Clear existing text
                for run in paragraph.runs:
                    run.text = ""

                # Insert image
                image_stream = io.BytesIO(image_bytes)
                run = paragraph.add_run()
                run.add_picture(image_stream, width=Inches(5.5))
                logger.info("Replaced chart placeholder: %s", marker)
                return

        logger.warning("Chart placeholder not found: %s", marker)

    def _fill_text_section(
        self, doc: Document, section_key: str, text: str
    ) -> None:
        """Find heading matching section key and insert text after it.

        Searches for a paragraph whose text loosely matches the section_key
        (case-insensitive, underscores to spaces), then inserts new paragraphs
        with the narrative text after that heading.

        Args:
            doc: The python-docx Document being built.
            section_key: The section identifier (e.g., "executive_summary").
            text: The narrative text to insert.
        """
        # Normalize section key for matching
        search_text = section_key.replace("_", " ").replace(".", " ").lower()

        for i, paragraph in enumerate(doc.paragraphs):
            para_text = paragraph.text.strip().lower()
            if search_text in para_text or para_text in search_text:
                # Insert text paragraphs after this heading
                # Split text by newlines to preserve paragraph structure
                lines = text.split("\n")
                for line in reversed(lines):
                    line = line.strip()
                    if line:
                        new_para = doc.add_paragraph(line)
                        # Move paragraph to after the heading
                        paragraph._element.addnext(new_para._element)
                logger.info("Filled text section: %s", section_key)
                return

        logger.warning("Section heading not found for: %s", section_key)
