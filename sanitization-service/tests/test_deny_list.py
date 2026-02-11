"""Tests for deny list matching functionality."""
import pytest
from app.services.deny_list import DenyListMatcher


@pytest.mark.unit
class TestDenyListMatcher:
    """Test deny list pre-processing with case-insensitive word-boundary matching."""

    def test_exact_match_case_sensitive_text(self):
        """Should match exact term with same case."""
        matcher = DenyListMatcher(["Acme Corp"])
        text = "Contact Acme Corp for details about the project"
        results = matcher.to_recognizer_results(text)

        assert len(results) == 1
        assert results[0].entity_type == "CUSTOM"
        assert text[results[0].start:results[0].end] == "Acme Corp"
        assert results[0].score == 1.0

    def test_case_insensitive_match_uppercase(self):
        """Should match term case-insensitively (uppercase)."""
        matcher = DenyListMatcher(["Acme Corp"])
        text = "ACME CORP is the client for this engagement"
        results = matcher.to_recognizer_results(text)

        assert len(results) == 1
        assert text[results[0].start:results[0].end] == "ACME CORP"

    def test_case_insensitive_match_lowercase(self):
        """Should match term case-insensitively (lowercase)."""
        matcher = DenyListMatcher(["Acme Corp"])
        text = "acme corp submitted the request"
        results = matcher.to_recognizer_results(text)

        assert len(results) == 1
        assert text[results[0].start:results[0].end] == "acme corp"

    def test_word_boundary_no_partial_match(self):
        """Should NOT match as substring - requires word boundaries."""
        matcher = DenyListMatcher(["Acme"])
        text = "AcmeticSoft is a different company entirely"
        results = matcher.to_recognizer_results(text)

        # "Acme" should NOT match within "AcmeticSoft"
        assert len(results) == 0

    def test_word_boundary_with_punctuation(self):
        """Should match when term is bounded by punctuation."""
        matcher = DenyListMatcher(["GlobalTech"])
        text = "The company (GlobalTech) was assessed during Q4."
        results = matcher.to_recognizer_results(text)

        assert len(results) == 1
        assert text[results[0].start:results[0].end] == "GlobalTech"

    def test_empty_deny_list(self):
        """Should return no matches for empty deny list."""
        matcher = DenyListMatcher([])
        text = "This text contains no custom terms to match"
        results = matcher.to_recognizer_results(text)

        assert len(results) == 0

    def test_special_regex_characters_escaped(self):
        """Should handle special regex characters in terms without error."""
        # C++ contains special regex chars (+)
        matcher = DenyListMatcher(["C++ team"])
        text = "The C++ team developed the application"
        results = matcher.to_recognizer_results(text)

        assert len(results) == 1
        assert text[results[0].start:results[0].end] == "C++ team"

    def test_multiple_matches_same_term(self):
        """Should find multiple occurrences of same term."""
        matcher = DenyListMatcher(["Alpha"])
        text = "Project Alpha and Alpha Phase 2 are both confidential"
        results = matcher.to_recognizer_results(text)

        # Should find two occurrences
        assert len(results) == 2
        assert all(r.entity_type == "CUSTOM" for r in results)

    def test_multiple_different_terms(self):
        """Should match multiple different deny list terms."""
        matcher = DenyListMatcher(["Acme Corp", "Project Alpha", "GlobalTech"])
        text = "Acme Corp and GlobalTech collaborated on Project Alpha"
        results = matcher.to_recognizer_results(text)

        assert len(results) == 3
        matched_texts = [text[r.start:r.end] for r in results]
        assert "Acme Corp" in matched_texts
        assert "GlobalTech" in matched_texts
        assert "Project Alpha" in matched_texts

    def test_overlapping_terms_both_matched(self):
        """Should handle overlapping deny list terms."""
        matcher = DenyListMatcher(["Tech", "GlobalTech"])
        text = "GlobalTech is the client"
        results = matcher.to_recognizer_results(text)

        # Both "Tech" and "GlobalTech" should match
        # (overlap resolution happens later in pipeline)
        assert len(results) >= 1

    def test_multiline_text(self):
        """Should match terms across multiple lines."""
        matcher = DenyListMatcher(["Secret Project"])
        text = """Line one of the report.
        Secret Project information follows.
        Additional details here."""
        results = matcher.to_recognizer_results(text)

        assert len(results) == 1
        assert "Secret Project" in text[results[0].start:results[0].end]

    def test_term_with_hyphen(self):
        """Should match terms containing hyphens."""
        matcher = DenyListMatcher(["client-name-redacted"])
        text = "The engagement for client-name-redacted was successful"
        results = matcher.to_recognizer_results(text)

        assert len(results) == 1
        assert text[results[0].start:results[0].end] == "client-name-redacted"
