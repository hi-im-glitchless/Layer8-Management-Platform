"""Tests for mapping operator consistent placeholder generation."""
import pytest
from app.operators.mapping_replace import MappingReplaceOperator


@pytest.mark.unit
class TestMappingReplaceOperator:
    """Test consistent typed placeholder mapping."""

    def test_first_entity_gets_index_one(self):
        """First occurrence of entity type should get index 1."""
        operator = MappingReplaceOperator()

        placeholder = operator.operate("John", {"entity_type": "PERSON"})

        assert placeholder == "[PERSON_1]"

    def test_second_entity_gets_index_two(self):
        """Second occurrence of same type should get index 2."""
        operator = MappingReplaceOperator()

        first = operator.operate("John", {"entity_type": "PERSON"})
        second = operator.operate("Jane", {"entity_type": "PERSON"})

        assert first == "[PERSON_1]"
        assert second == "[PERSON_2]"

    def test_same_text_gets_same_placeholder(self):
        """Same entity text should always map to same placeholder."""
        operator = MappingReplaceOperator()

        first = operator.operate("John", {"entity_type": "PERSON"})
        second = operator.operate("Jane", {"entity_type": "PERSON"})
        third = operator.operate("John", {"entity_type": "PERSON"})

        assert first == "[PERSON_1]"
        assert second == "[PERSON_2]"
        assert third == "[PERSON_1]"  # Same as first occurrence

    def test_different_types_separate_counters(self):
        """Different entity types should have separate counter sequences."""
        operator = MappingReplaceOperator()

        person = operator.operate("John", {"entity_type": "PERSON"})
        ip = operator.operate("10.1.2.3", {"entity_type": "IP_ADDR"})
        email = operator.operate("user@example.com", {"entity_type": "EMAIL_ADDRESS"})

        assert person == "[PERSON_1]"
        assert ip == "[IP_ADDR_1]"
        assert email == "[EMAIL_ADDRESS_1]"

    def test_forward_mappings_stored(self):
        """Should store original -> placeholder mappings."""
        operator = MappingReplaceOperator()

        operator.operate("John Doe", {"entity_type": "PERSON"})
        operator.operate("10.1.2.50", {"entity_type": "IP_ADDR"})

        forward = operator.get_forward_mappings()

        assert "John Doe" in forward
        assert forward["John Doe"] == "[PERSON_1]"
        assert "10.1.2.50" in forward
        assert forward["10.1.2.50"] == "[IP_ADDR_1]"

    def test_reverse_mappings_correct(self):
        """Should provide correct placeholder -> original reverse mappings."""
        operator = MappingReplaceOperator()

        operator.operate("John Doe", {"entity_type": "PERSON"})
        operator.operate("Jane Smith", {"entity_type": "PERSON"})
        operator.operate("10.1.2.50", {"entity_type": "IP_ADDR"})

        reverse = operator.get_reverse_mappings()

        assert reverse["[PERSON_1]"] == "John Doe"
        assert reverse["[PERSON_2]"] == "Jane Smith"
        assert reverse["[IP_ADDR_1]"] == "10.1.2.50"

    def test_counters_track_per_type(self):
        """Should maintain accurate per-type counters."""
        operator = MappingReplaceOperator()

        operator.operate("John", {"entity_type": "PERSON"})
        operator.operate("Jane", {"entity_type": "PERSON"})
        operator.operate("10.1.2.3", {"entity_type": "IP_ADDR"})

        counters = operator.counters

        assert counters["PERSON"] == 2
        assert counters["IP_ADDR"] == 1

    def test_case_sensitive_matching(self):
        """Entity text matching should be case-sensitive."""
        operator = MappingReplaceOperator()

        lower = operator.operate("john", {"entity_type": "PERSON"})
        upper = operator.operate("John", {"entity_type": "PERSON"})
        mixed = operator.operate("JOHN", {"entity_type": "PERSON"})

        # All different cases should get different placeholders
        assert lower == "[PERSON_1]"
        assert upper == "[PERSON_2]"
        assert mixed == "[PERSON_3]"

    def test_empty_entity_text_handled(self):
        """Should handle empty entity text gracefully."""
        operator = MappingReplaceOperator()

        placeholder = operator.operate("", {"entity_type": "PERSON"})

        # Should still generate a placeholder
        assert placeholder == "[PERSON_1]"
        assert operator.get_forward_mappings()[""] == "[PERSON_1]"

    def test_multiple_entity_types_interleaved(self):
        """Should handle interleaved entity types correctly."""
        operator = MappingReplaceOperator()

        p1 = operator.operate("Alice", {"entity_type": "PERSON"})
        e1 = operator.operate("alice@example.com", {"entity_type": "EMAIL_ADDRESS"})
        p2 = operator.operate("Bob", {"entity_type": "PERSON"})
        e2 = operator.operate("bob@example.com", {"entity_type": "EMAIL_ADDRESS"})
        p3 = operator.operate("Alice", {"entity_type": "PERSON"})  # Repeat

        assert p1 == "[PERSON_1]"
        assert e1 == "[EMAIL_ADDRESS_1]"
        assert p2 == "[PERSON_2]"
        assert e2 == "[EMAIL_ADDRESS_2]"
        assert p3 == "[PERSON_1]"  # Same as first Alice

    def test_special_characters_in_text(self):
        """Should handle entity text with special characters."""
        operator = MappingReplaceOperator()

        unc_path = operator.operate("\\\\server\\share", {"entity_type": "NETWORK_PATH"})
        ad_dn = operator.operate("CN=User,OU=IT,DC=corp", {"entity_type": "AD_OBJECT"})

        assert unc_path == "[NETWORK_PATH_1]"
        assert ad_dn == "[AD_OBJECT_1]"

        forward = operator.get_forward_mappings()
        assert forward["\\\\server\\share"] == "[NETWORK_PATH_1]"
        assert forward["CN=User,OU=IT,DC=corp"] == "[AD_OBJECT_1]"
