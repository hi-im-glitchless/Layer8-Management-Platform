"""Unit tests for the LLM analysis prompt builder."""
import os

import pytest
from docx import Document as DocxDoc
from io import BytesIO

from app.models.docx import DocxStructure, DocxParagraph, DocxTable, DocxRow, DocxCell
from app.services.analysis_prompt import build_analysis_prompt, build_analysis_system_prompt
from app.services.docx_parser import DocxParserService
from app.services.reference_loader import load_reference_template

TEMPLATES_DIR = os.path.join(
    os.path.dirname(__file__), os.pardir, os.pardir,
    "test-templates", "ghost-templates",
)


@pytest.fixture
def web_en_ref():
    """Load Web EN reference template info."""
    return load_reference_template("web", "en")


@pytest.fixture
def sample_doc_structure():
    """Create a minimal DocxStructure for prompt testing."""
    paragraphs = [
        DocxParagraph(text="", style_name="Normal"),  # empty, should be skipped
        DocxParagraph(text="Executive Summary", style_name="Heading 1", heading_level=1),
        DocxParagraph(text="This report presents findings from the security assessment of Client Corp.", style_name="Normal"),
        DocxParagraph(text="Scope", style_name="Heading 2", heading_level=2),
        DocxParagraph(text="The assessment covered the following systems.", style_name="Normal"),
        DocxParagraph(text="Findings", style_name="Heading 1", heading_level=1),
        DocxParagraph(text="SQL Injection in login form", style_name="Normal"),
        DocxParagraph(text="Description: The login endpoint is vulnerable to SQL injection.", style_name="Normal"),
    ]
    tables = [
        DocxTable(
            rows=[
                DocxRow(cells=[
                    DocxCell(text="System", paragraphs=[DocxParagraph(text="System")]),
                    DocxCell(text="Status", paragraphs=[DocxParagraph(text="Status")]),
                ]),
            ],
            style_name="Table Grid",
        )
    ]
    return DocxStructure(
        paragraphs=paragraphs,
        tables=tables,
        images=[],
        sections=[],
        styles=["Normal", "Heading 1", "Heading 2"],
        metadata={"title": "Test Report"},
    )


@pytest.fixture
def real_doc_structure():
    """Parse a real DOCX template for realistic prompt testing."""
    path = os.path.join(TEMPLATES_DIR, "Web_-_EN_2025_-_v2.0_m6w3nHW_FuwLOkd.docx")
    with open(path, "rb") as f:
        return DocxParserService().parse(f.read())


class TestBuildAnalysisSystemPrompt:
    def test_returns_non_empty_string(self):
        prompt = build_analysis_system_prompt()
        assert isinstance(prompt, str)
        assert len(prompt) > 0

    def test_mentions_json(self):
        prompt = build_analysis_system_prompt()
        assert "JSON" in prompt

    def test_mentions_document_analyst_role(self):
        prompt = build_analysis_system_prompt()
        assert "document structure analyst" in prompt


class TestBuildAnalysisPrompt:
    def test_includes_numbered_paragraphs(self, sample_doc_structure, web_en_ref):
        prompt = build_analysis_prompt(sample_doc_structure, web_en_ref, "web", "en")
        # Should include paragraph indices
        assert "[  1]" in prompt  # First non-empty paragraph (index 1)
        assert "Executive Summary" in prompt

    def test_skips_empty_paragraphs(self, sample_doc_structure, web_en_ref):
        prompt = build_analysis_prompt(sample_doc_structure, web_en_ref, "web", "en")
        # Index 0 has empty text, should not appear
        assert "[  0]" not in prompt

    def test_includes_reference_patterns(self, sample_doc_structure, web_en_ref):
        prompt = build_analysis_prompt(sample_doc_structure, web_en_ref, "web", "en")
        assert "Reference Template Patterns" in prompt
        assert "client.short_name" in prompt
        assert "finding.description_rt" in prompt

    def test_includes_gw_fields(self, sample_doc_structure, web_en_ref):
        prompt = build_analysis_prompt(sample_doc_structure, web_en_ref, "web", "en")
        assert "Available GW Fields" in prompt
        assert "client.short_name" in prompt
        assert "finding.severity_rt" in prompt

    def test_includes_json_schema(self, sample_doc_structure, web_en_ref):
        prompt = build_analysis_prompt(sample_doc_structure, web_en_ref, "web", "en")
        assert "Output Format" in prompt
        assert "section_index" in prompt
        assert "gw_field" in prompt
        assert "confidence" in prompt

    def test_includes_mapping_rules(self, sample_doc_structure, web_en_ref):
        prompt = build_analysis_prompt(sample_doc_structure, web_en_ref, "web", "en")
        assert "Mapping Rules" in prompt
        assert "Do NOT map boilerplate" in prompt

    def test_includes_table_info(self, sample_doc_structure, web_en_ref):
        prompt = build_analysis_prompt(sample_doc_structure, web_en_ref, "web", "en")
        assert "Tables found: 1" in prompt

    def test_internal_template_mentions_filter_type(self, sample_doc_structure):
        ref = load_reference_template("internal", "en")
        prompt = build_analysis_prompt(sample_doc_structure, ref, "internal", "en")
        assert "filter_type" in prompt

    def test_prompt_length_is_reasonable(self, real_doc_structure, web_en_ref):
        """Prompt should be under 8000 tokens (~32000 chars) for cost efficiency."""
        prompt = build_analysis_prompt(real_doc_structure, web_en_ref, "web", "en")
        estimated_tokens = len(prompt) / 4
        assert estimated_tokens < 8000, (
            f"Prompt is ~{estimated_tokens:.0f} tokens, should be under 8000"
        )
