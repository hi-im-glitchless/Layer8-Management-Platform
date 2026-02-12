"""Integration tests for sanitization service."""
import pytest
import re
from tests.conftest import requires_spacy
from tests.fixtures.synthetic_reports import (
    REPORT_SNIPPET_EN,
    REPORT_SNIPPET_PT,
    VERSION_STRINGS_EN,
    REJECTED_IPS_EN,
)


@requires_spacy
class TestSanitizationIntegration:
    """Integration tests for complete sanitization pipeline."""

    def test_entity_count_matches_expected(self, sanitization_service):
        """Should detect expected number of entities in synthetic report."""
        response = sanitization_service.sanitize(
            text=REPORT_SNIPPET_EN,
            deny_list_terms=["GlobalTech"],
            language="en",
        )

        # Should detect multiple entity types
        assert len(response.entities) > 10  # At least: emails, IPs, names, hostnames, etc.

        # Check entity counts by type
        counts = response.entity_counts

        # Should have multiple IPs (excluding version strings and localhost)
        assert counts.get("IP_ADDR", 0) >= 3

        # Should have email addresses
        assert counts.get("EMAIL_ADDRESS", 0) >= 2

        # Should detect person names (either as PERSON or within AD_OBJECT/EMAIL_ADDRESS)
        # Note: With smart overlap resolution, person names inside AD DNs are kept as AD_OBJECT
        # This is correct behavior - the AD DN is more specific than standalone PERSON
        person_count = counts.get("PERSON", 0)
        ad_count = counts.get("AD_OBJECT", 0)
        # Accept either: 2+ PERSON entities, OR 2+ AD_OBJECT containing names, OR combination
        assert person_count + ad_count >= 2, \
            f"Expected names detected (PERSON + AD_OBJECT >= 2), got PERSON={person_count}, AD_OBJECT={ad_count}"

        # Should have hostnames
        assert counts.get("HOSTNAME", 0) >= 1

        # Should have network paths
        assert counts.get("NETWORK_PATH", 0) >= 1

        # Should have AD objects
        assert counts.get("AD_OBJECT", 0) >= 1

        # Should have custom deny list match
        assert counts.get("CUSTOM", 0) >= 1

    def test_placeholder_format_consistent(self, sanitization_service):
        """Should use consistent [TYPE_N] placeholder format."""
        response = sanitization_service.sanitize(
            text=REPORT_SNIPPET_EN,
            deny_list_terms=[],
            language="en",
        )

        sanitized = response.sanitized_text

        # Find all placeholders
        placeholder_pattern = re.compile(r'\[([A-Z_]+_\d+)\]')
        placeholders = placeholder_pattern.findall(sanitized)

        assert len(placeholders) > 0

        # Verify format of each placeholder
        for placeholder in placeholders:
            # Should end with underscore + number
            assert '_' in placeholder
            parts = placeholder.rsplit('_', 1)
            assert len(parts) == 2
            assert parts[1].isdigit()

    def test_no_placeholder_after_desanitization(self, sanitization_service):
        """Should have no placeholder patterns remaining after desanitization."""
        original = REPORT_SNIPPET_EN

        # Sanitize
        sanitize_response = sanitization_service.sanitize(
            text=original,
            deny_list_terms=[],
            language="en",
        )

        # Desanitize
        from app.operators.mapping_replace import MappingReplaceOperator
        operator = MappingReplaceOperator()
        operator.load_mappings(sanitize_response.mappings, sanitize_response.counters)

        reverse_mappings = operator.get_reverse_mappings()
        desanitize_response = sanitization_service.desanitize(
            text=sanitize_response.sanitized_text,
            reverse_mappings=reverse_mappings,
        )

        # Check for any remaining placeholder patterns
        placeholder_pattern = re.compile(r'\[[A-Z_]+_\d+\]')
        remaining = placeholder_pattern.findall(desanitize_response.text)

        assert len(remaining) == 0, f"Found remaining placeholders: {remaining}"

    def test_version_strings_not_detected_as_ips(self, sanitization_service):
        """Should not detect version strings as IP addresses."""
        # Text with only version strings
        text = " ".join(VERSION_STRINGS_EN)

        response = sanitization_service.sanitize(
            text=text,
            deny_list_terms=[],
            language="en",
        )

        # Should detect zero IPs (all are version strings)
        ip_count = response.entity_counts.get("IP_ADDR", 0)
        assert ip_count == 0

    def test_rejected_ips_not_detected(self, sanitization_service):
        """Should not detect localhost and documentation IPs."""
        text = " ".join(REJECTED_IPS_EN)

        response = sanitization_service.sanitize(
            text=text,
            deny_list_terms=[],
            language="en",
        )

        # Should detect zero IPs (all are rejected ranges)
        ip_count = response.entity_counts.get("IP_ADDR", 0)
        assert ip_count == 0

    def test_language_detection_portuguese(self, sanitization_service):
        """Should auto-detect Portuguese language."""
        response = sanitization_service.sanitize(
            text=REPORT_SNIPPET_PT,
            deny_list_terms=[],
            language=None,  # Auto-detect
        )

        # Should detect as Portuguese
        assert response.language == "pt"

    def test_language_detection_english(self, sanitization_service):
        """Should auto-detect English language."""
        response = sanitization_service.sanitize(
            text=REPORT_SNIPPET_EN,
            deny_list_terms=[],
            language=None,  # Auto-detect
        )

        # Should detect as English
        assert response.language == "en"

    def test_deny_list_merged_with_presidio(self, sanitization_service):
        """Should merge deny list results with Presidio results."""
        text = "Contact Acme Corp at admin@acme.com about the server at 10.1.2.50"

        response = sanitization_service.sanitize(
            text=text,
            deny_list_terms=["Acme Corp"],
            language="en",
        )

        # Should have both deny list and Presidio entities
        entity_types = [e.entity_type for e in response.entities]

        assert "CUSTOM" in entity_types  # Deny list match
        assert "EMAIL_ADDRESS" in entity_types  # Presidio
        assert "IP_ADDR" in entity_types  # Custom recognizer

    def test_entity_filtering_by_type(self, sanitization_service):
        """Should filter entities when specific types requested."""
        response = sanitization_service.sanitize(
            text=REPORT_SNIPPET_EN,
            deny_list_terms=[],
            language="en",
            entities=["EMAIL_ADDRESS", "IP_ADDR"],  # Only these types
        )

        # Should only have requested types
        entity_types = set(e.entity_type for e in response.entities)

        for entity_type in entity_types:
            assert entity_type in ["EMAIL_ADDRESS", "IP_ADDR"], \
                f"Unexpected entity type: {entity_type}"

    def test_sanitized_text_no_original_pii(self, sanitization_service):
        """Should ensure no original PII remains in sanitized text."""
        response = sanitization_service.sanitize(
            text=REPORT_SNIPPET_EN,
            deny_list_terms=["GlobalTech"],
            language="en",
        )

        sanitized = response.sanitized_text.lower()

        # Verify key PII is replaced
        assert "carlos.silva@globaltech-corp.com" not in sanitized
        assert "maria.santos@globaltech-corp.com" not in sanitized
        assert "10.1.2.50" not in sanitized
        assert "192.168.1.1" not in sanitized

    def test_mappings_reversible(self, sanitization_service):
        """Should provide reversible mappings."""
        response = sanitization_service.sanitize(
            text="User john@example.com at 10.1.2.3",
            deny_list_terms=[],
            language="en",
        )

        # Check forward mappings
        forward = response.mappings
        assert "john@example.com" in forward
        assert "10.1.2.3" in forward

        # Generate reverse mappings
        from app.operators.mapping_replace import MappingReplaceOperator
        operator = MappingReplaceOperator()
        operator.load_mappings(forward, response.counters)

        reverse = operator.get_reverse_mappings()

        # Verify reverse mappings invert forward mappings
        for original, placeholder in forward.items():
            assert reverse[placeholder] == original

    def test_overlapping_entities_resolved(self, sanitization_service):
        """Should resolve overlapping entities by keeping higher score."""
        # Text where domain might overlap with hostname
        text = "Connect to server.company.com for access"

        response = sanitization_service.sanitize(
            text=text,
            deny_list_terms=[],
            language="en",
        )

        sanitized = response.sanitized_text

        # Should have placeholders, not overlapping matches
        assert "[" in sanitized
        assert "]" in sanitized

        # Should not have malformed overlapping placeholders like "[DOMAIN_[HOSTNAME_1]1]"
        assert "[[" not in sanitized
        assert "]]" not in sanitized

    def test_empty_text_handled_gracefully(self, sanitization_service):
        """Should handle empty text without error."""
        response = sanitization_service.sanitize(
            text="",
            deny_list_terms=[],
            language="en",
        )

        assert response.sanitized_text == ""
        assert len(response.entities) == 0
        assert response.warning is not None

    def test_text_with_only_whitespace(self, sanitization_service):
        """Should handle whitespace-only text."""
        response = sanitization_service.sanitize(
            text="   \n\n  \t  ",
            deny_list_terms=[],
            language="en",
        )

        assert len(response.entities) == 0
        assert response.warning is not None
