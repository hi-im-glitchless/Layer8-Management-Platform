"""Unit tests for reference template loader and Jinja2 pattern extractor."""
import os

import pytest

from app.services.reference_loader import (
    TEMPLATE_DIR,
    TEMPLATE_MAP,
    extract_jinja2_patterns,
    load_reference_template,
)

TEMPLATES_DIR = os.path.join(
    os.path.dirname(__file__), os.pardir, os.pardir,
    "test-templates", "ghost-templates",
)


class TestLoadReferenceTemplate:
    """Tests for load_reference_template()."""

    def test_web_en_returns_correct_filename(self):
        info = load_reference_template("web", "en")
        assert info.filename == "Web_-_EN_2025_-_v2.0_m6w3nHW_FuwLOkd.docx"
        assert info.template_type == "web"
        assert info.language == "en"

    def test_web_en_has_non_empty_patterns(self):
        info = load_reference_template("web", "en")
        assert len(info.patterns) > 0
        assert info.placeholder_count == len(info.patterns)

    def test_web_en_has_24_patterns(self):
        info = load_reference_template("web", "en")
        assert info.placeholder_count == 24

    def test_internal_en_has_32_patterns(self):
        info = load_reference_template("internal", "en")
        assert info.placeholder_count == 32

    def test_mobile_en_has_24_patterns(self):
        info = load_reference_template("mobile", "en")
        assert info.placeholder_count == 24

    def test_all_mapped_templates_load(self):
        """Verify every (type, language) in TEMPLATE_MAP loads successfully."""
        for (ttype, lang) in TEMPLATE_MAP:
            info = load_reference_template(ttype, lang)
            assert info.placeholder_count > 0, f"No patterns for {ttype}/{lang}"

    def test_invalid_type_raises_value_error(self):
        with pytest.raises(ValueError, match="No reference template mapped"):
            load_reference_template("invalid", "en")  # type: ignore

    def test_invalid_language_raises_value_error(self):
        with pytest.raises(ValueError, match="No reference template mapped"):
            load_reference_template("web", "fr")  # type: ignore


class TestExtractJinja2Patterns:
    """Tests for extract_jinja2_patterns()."""

    @pytest.fixture
    def web_en_bytes(self):
        path = os.path.join(
            TEMPLATES_DIR,
            "Web_-_EN_2025_-_v2.0_m6w3nHW_FuwLOkd.docx",
        )
        with open(path, "rb") as f:
            return f.read()

    @pytest.fixture
    def internal_en_bytes(self):
        path = os.path.join(TEMPLATES_DIR, "Interna_-_EN_2025_-_v2.0.docx")
        with open(path, "rb") as f:
            return f.read()

    def test_web_en_finds_all_marker_types(self, web_en_bytes):
        patterns = extract_jinja2_patterns(web_en_bytes)
        marker_types = {p.marker_type for p in patterns}
        assert "text" in marker_types
        assert "paragraph_rt" in marker_types
        assert "run_rt" in marker_types
        assert "table_row_loop" in marker_types
        assert "control_flow" in marker_types

    def test_web_en_finds_text_placeholders(self, web_en_bytes):
        patterns = extract_jinja2_patterns(web_en_bytes)
        text_fields = {p.gw_field for p in patterns if p.marker_type == "text"}
        assert "client.short_name" in text_fields
        assert "project.start_date" in text_fields
        assert "report_date" in text_fields

    def test_web_en_finds_paragraph_rt(self, web_en_bytes):
        patterns = extract_jinja2_patterns(web_en_bytes)
        p_rt = {p.gw_field for p in patterns if p.marker_type == "paragraph_rt"}
        assert "finding.description_rt" in p_rt
        assert "finding.recommendation_rt" in p_rt

    def test_web_en_finds_table_row_loops(self, web_en_bytes):
        patterns = extract_jinja2_patterns(web_en_bytes)
        tr = [p for p in patterns if p.marker_type == "table_row_loop"]
        assert len(tr) > 0

    def test_internal_en_finds_filter_type_patterns(self, internal_en_bytes):
        patterns = extract_jinja2_patterns(internal_en_bytes)
        cf = [p for p in patterns if p.marker_type == "control_flow"]
        filter_patterns = [
            p for p in cf if "filter_type" in p.gw_field
        ]
        assert len(filter_patterns) > 0, "Internal templates should have filter_type patterns"

    def test_internal_en_finds_namespace_patterns(self, internal_en_bytes):
        patterns = extract_jinja2_patterns(internal_en_bytes)
        cf = [p for p in patterns if p.marker_type == "control_flow"]
        ns_patterns = [p for p in cf if "namespace" in p.gw_field]
        assert len(ns_patterns) > 0, "Internal templates should have namespace patterns"

    def test_patterns_have_context(self, web_en_bytes):
        patterns = extract_jinja2_patterns(web_en_bytes)
        # At least some patterns should have context text
        with_context = [p for p in patterns if p.context]
        assert len(with_context) > 0

    def test_patterns_are_deduplicated(self, web_en_bytes):
        patterns = extract_jinja2_patterns(web_en_bytes)
        keys = [(p.marker_type, p.gw_field) for p in patterns]
        # Some gw_fields may appear with different marker types, but
        # (marker_type, raw_match) should be unique
        seen = set()
        for p in patterns:
            key = (p.marker_type, p.pattern)
            assert key not in seen, f"Duplicate pattern: {key}"
            seen.add(key)
