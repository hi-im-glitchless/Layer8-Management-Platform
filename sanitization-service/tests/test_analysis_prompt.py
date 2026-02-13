"""Unit tests for the LLM analysis prompt builder."""
import os

import pytest
from docx import Document as DocxDoc
from io import BytesIO

from app.models.adapter import FewShotExample
from app.models.docx import DocxStructure, DocxParagraph, DocxTable, DocxRow, DocxCell
from app.services.analysis_prompt import (
    _build_few_shot_section,
    build_analysis_prompt,
    build_analysis_system_prompt,
)
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


# ---------------------------------------------------------------------------
# Few-shot prompt tests
# ---------------------------------------------------------------------------

_SAMPLE_FEW_SHOT_EXAMPLES = [
    FewShotExample(
        normalized_section_text="client name: ___________",
        gw_field="client.short_name",
        marker_type="text",
        usage_count=5,
    ),
    FewShotExample(
        normalized_section_text="assessment period",
        gw_field="project.start_date",
        marker_type="text",
        usage_count=3,
    ),
    FewShotExample(
        normalized_section_text="detailed description of the vulnerability",
        gw_field="finding.description_rt",
        marker_type="paragraph_rt",
        usage_count=7,
    ),
]


class TestBuildFewShotSection:
    """Tests for _build_few_shot_section helper."""

    def test_few_shot_section_with_examples(self):
        result = _build_few_shot_section(_SAMPLE_FEW_SHOT_EXAMPLES)
        assert result is not None
        assert "## Previous Successful Mappings" in result
        # All 3 examples present
        assert 'Section: "client name: ___________"' in result
        assert "GW Field: client.short_name [text]" in result
        assert "(confirmed 5 times)" in result
        assert 'Section: "assessment period"' in result
        assert "GW Field: project.start_date [text]" in result
        assert "(confirmed 3 times)" in result
        assert 'Section: "detailed description of the vulnerability"' in result
        assert "GW Field: finding.description_rt [paragraph_rt]" in result
        assert "(confirmed 7 times)" in result

    def test_few_shot_section_empty_list_returns_none(self):
        result = _build_few_shot_section([])
        assert result is None

    def test_few_shot_section_includes_header_and_footer(self):
        result = _build_few_shot_section(_SAMPLE_FEW_SHOT_EXAMPLES)
        assert "confirmed correct in previous template adaptations" in result
        assert "high-confidence patterns" in result


class TestBuildAnalysisPromptFewShot:
    """Tests for build_analysis_prompt with few-shot examples."""

    def test_few_shot_section_included_when_examples_provided(
        self, sample_doc_structure, web_en_ref
    ):
        prompt = build_analysis_prompt(
            sample_doc_structure, web_en_ref, "web", "en",
            few_shot_examples=_SAMPLE_FEW_SHOT_EXAMPLES,
        )
        assert "## Previous Successful Mappings" in prompt

    def test_few_shot_section_between_reference_and_gw_fields(
        self, sample_doc_structure, web_en_ref
    ):
        prompt = build_analysis_prompt(
            sample_doc_structure, web_en_ref, "web", "en",
            few_shot_examples=_SAMPLE_FEW_SHOT_EXAMPLES,
        )
        ref_pos = prompt.index("## Reference Template Patterns")
        few_shot_pos = prompt.index("## Previous Successful Mappings")
        gw_pos = prompt.index("## Available GW Fields")
        assert ref_pos < few_shot_pos < gw_pos

    def test_no_few_shot_section_without_examples(
        self, sample_doc_structure, web_en_ref
    ):
        prompt = build_analysis_prompt(
            sample_doc_structure, web_en_ref, "web", "en",
        )
        assert "## Previous Successful Mappings" not in prompt

    def test_no_few_shot_section_with_empty_list(
        self, sample_doc_structure, web_en_ref
    ):
        prompt = build_analysis_prompt(
            sample_doc_structure, web_en_ref, "web", "en",
            few_shot_examples=[],
        )
        assert "## Previous Successful Mappings" not in prompt

    def test_prompt_without_few_shot_unchanged_from_phase5(
        self, sample_doc_structure, web_en_ref
    ):
        """Regression: prompt without few-shot is identical to Phase 5 behavior."""
        prompt_no_fewshot = build_analysis_prompt(
            sample_doc_structure, web_en_ref, "web", "en",
        )
        prompt_empty_fewshot = build_analysis_prompt(
            sample_doc_structure, web_en_ref, "web", "en",
            few_shot_examples=[],
        )
        # Both should produce identical output
        assert prompt_no_fewshot == prompt_empty_fewshot
