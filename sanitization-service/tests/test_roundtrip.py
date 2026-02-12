"""End-to-end round-trip sanitization tests."""
import pytest
import re
from tests.conftest import requires_spacy
from tests.fixtures.synthetic_reports import (
    REPORT_SNIPPET_EN,
    REPORT_SNIPPET_PT,
    KNOWN_ENTITIES_EN,
)


@requires_spacy
class TestRoundTrip:
    """Test sanitize -> desanitize round-trip restores original text."""

    def test_roundtrip_english_report(self, sanitization_service):
        """Should sanitize and desanitize English report back to exact original."""
        original_text = REPORT_SNIPPET_EN

        # Sanitize
        sanitize_response = sanitization_service.sanitize(
            text=original_text,
            deny_list_terms=["GlobalTech"],
            language="en",
        )

        sanitized = sanitize_response.sanitized_text

        # Verify sanitization happened
        assert sanitized != original_text
        assert len(sanitize_response.entities) > 0

        # Verify no known PII remains in sanitized text
        assert "carlos.silva@globaltech-corp.com" not in sanitized.lower()
        assert "maria.santos@globaltech-corp.com" not in sanitized.lower()
        assert "Carlos Silva" not in sanitized
        assert "Maria Santos" not in sanitized

        # Verify placeholders are present
        assert "[PERSON_" in sanitized or "[EMAIL_ADDRESS_" in sanitized

        # Desanitize using reverse mappings
        from app.operators.mapping_replace import MappingReplaceOperator
        operator = MappingReplaceOperator()
        operator.load_mappings(sanitize_response.mappings, sanitize_response.counters)

        reverse_mappings = operator.get_reverse_mappings()
        desanitize_response = sanitization_service.desanitize(
            text=sanitized,
            reverse_mappings=reverse_mappings,
        )

        # Verify round-trip restoration
        assert desanitize_response.complete
        assert desanitize_response.text == original_text
        assert len(desanitize_response.unresolved_placeholders) == 0

    def test_roundtrip_portuguese_report(self, sanitization_service):
        """Should sanitize and desanitize Portuguese report back to exact original."""
        original_text = REPORT_SNIPPET_PT

        # Sanitize
        sanitize_response = sanitization_service.sanitize(
            text=original_text,
            deny_list_terms=[],
            language="pt",
        )

        sanitized = sanitize_response.sanitized_text

        # Verify sanitization happened
        assert sanitized != original_text
        assert len(sanitize_response.entities) > 0

        # Verify no PII in sanitized text
        assert "joao.ferreira@empresa-exemplo.com.br" not in sanitized.lower()
        assert "Joao Ferreira" not in sanitized

        # Desanitize
        from app.operators.mapping_replace import MappingReplaceOperator
        operator = MappingReplaceOperator()
        operator.load_mappings(sanitize_response.mappings, sanitize_response.counters)

        reverse_mappings = operator.get_reverse_mappings()
        desanitize_response = sanitization_service.desanitize(
            text=sanitized,
            reverse_mappings=reverse_mappings,
        )

        # Verify round-trip restoration
        assert desanitize_response.complete
        assert desanitize_response.text == original_text

    def test_roundtrip_with_deny_list(self, sanitization_service):
        """Should round-trip text with deny list terms correctly."""
        original_text = "Contact Acme Corp about the project. Email: admin@acme.com"

        sanitize_response = sanitization_service.sanitize(
            text=original_text,
            deny_list_terms=["Acme Corp"],
            language="en",
        )

        sanitized = sanitize_response.sanitized_text

        # Verify deny list term was replaced
        assert "Acme Corp" not in sanitized
        assert "[CUSTOM_" in sanitized

        # Desanitize
        from app.operators.mapping_replace import MappingReplaceOperator
        operator = MappingReplaceOperator()
        operator.load_mappings(sanitize_response.mappings, sanitize_response.counters)

        reverse_mappings = operator.get_reverse_mappings()
        desanitize_response = sanitization_service.desanitize(
            text=sanitized,
            reverse_mappings=reverse_mappings,
        )

        # Round-trip should be exact
        assert desanitize_response.complete
        assert desanitize_response.text == original_text

    def test_roundtrip_zero_pii_returns_unchanged(self, sanitization_service):
        """Should return text unchanged when no PII detected."""
        original_text = "This is a simple report with no personal information or technical details."

        sanitize_response = sanitization_service.sanitize(
            text=original_text,
            deny_list_terms=[],
            language="en",
        )

        # Should warn about no PII
        assert sanitize_response.warning is not None
        assert "No PII" in sanitize_response.warning

        # Text should be unchanged
        assert sanitize_response.sanitized_text == original_text
        assert len(sanitize_response.entities) == 0

    def test_incomplete_desanitization_reports_unresolved(self, sanitization_service):
        """Should detect and report unresolved placeholders."""
        # Create text with placeholder that won't be in mappings
        sanitized = "User [PERSON_99] accessed server [IP_ADDR_1]."

        # Provide mappings for only one placeholder
        reverse_mappings = {
            "[IP_ADDR_1]": "10.1.2.50",
        }

        desanitize_response = sanitization_service.desanitize(
            text=sanitized,
            reverse_mappings=reverse_mappings,
        )

        # Should be incomplete
        assert not desanitize_response.complete
        assert "[PERSON_99]" in desanitize_response.unresolved_placeholders
        # IP should be restored
        assert "10.1.2.50" in desanitize_response.text
        # Person should remain as placeholder
        assert "[PERSON_99]" in desanitize_response.text

    def test_placeholder_format_validation(self, sanitization_service):
        """Should validate that placeholders match expected format."""
        original_text = "Email the admin at admin@company.com for help."

        sanitize_response = sanitization_service.sanitize(
            text=original_text,
            deny_list_terms=[],
            language="en",
        )

        sanitized = sanitize_response.sanitized_text

        # Find all placeholders in sanitized text
        placeholder_pattern = re.compile(r'\[([A-Z_]+_\d+)\]')
        placeholders = placeholder_pattern.findall(sanitized)

        # Each placeholder should match format: TYPE_NUMBER
        for placeholder in placeholders:
            parts = placeholder.rsplit('_', 1)
            assert len(parts) == 2
            entity_type = parts[0]
            index = parts[1]

            # Type should be uppercase with underscores
            assert entity_type.isupper()
            assert '_' in placeholder or entity_type in ["CUSTOM", "PERSON"]

            # Index should be numeric
            assert index.isdigit()
            assert int(index) > 0

    def test_multiple_same_entity_same_placeholder(self, sanitization_service):
        """Should use same placeholder for repeated entities."""
        original_text = "John emailed John again. John's email is john@example.com"

        sanitize_response = sanitization_service.sanitize(
            text=original_text,
            deny_list_terms=[],
            language="en",
        )

        sanitized = sanitize_response.sanitized_text

        # Count PERSON_1 occurrences (all "John" should map to same placeholder)
        person_1_count = sanitized.count("[PERSON_1]")
        assert person_1_count == 3  # All three "John" instances

        # Desanitize
        from app.operators.mapping_replace import MappingReplaceOperator
        operator = MappingReplaceOperator()
        operator.load_mappings(sanitize_response.mappings, sanitize_response.counters)

        reverse_mappings = operator.get_reverse_mappings()
        desanitize_response = sanitization_service.desanitize(
            text=sanitized,
            reverse_mappings=reverse_mappings,
        )

        # Should restore all instances
        restored = desanitize_response.text
        assert restored.count("John") == 3
