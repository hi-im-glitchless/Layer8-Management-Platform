"""Mapping replace operator for consistent placeholder generation."""
from typing import Any


class MappingReplaceOperator:
    """
    Custom operator that maintains consistent entity-to-placeholder mappings.

    Generates typed indexed placeholders like [PERSON_1], [IP_ADDR_2].
    Same entity always maps to the same placeholder within a session.
    """

    def __init__(self):
        """Initialize the mapping replace operator."""
        # mappings[entity_type][original_text] = placeholder
        self.mappings: dict[str, dict[str, str]] = {}
        # counters[entity_type] = next_index
        self.counters: dict[str, int] = {}

    def operate(self, text: str, params: dict[str, Any]) -> str:
        """
        Replace text with a typed indexed placeholder.

        Args:
            text: The original text to replace
            params: Dictionary containing 'entity_type' key

        Returns:
            The placeholder string (e.g., [PERSON_1], [IP_ADDR_2])
        """
        entity_type = params.get("entity_type", "UNKNOWN")

        # Initialize entity type if not seen before
        if entity_type not in self.mappings:
            self.mappings[entity_type] = {}
            self.counters[entity_type] = 0

        # Check if we've already seen this text for this entity type
        if text in self.mappings[entity_type]:
            return self.mappings[entity_type][text]

        # Create new placeholder
        self.counters[entity_type] += 1
        placeholder = f"[{entity_type}_{self.counters[entity_type]}]"

        # Store mapping
        self.mappings[entity_type][text] = placeholder

        return placeholder

    def get_forward_mappings(self) -> dict[str, str]:
        """
        Get forward mappings (original text -> placeholder).

        Returns:
            Flat dictionary with all mappings across all entity types
        """
        forward = {}
        for entity_type, type_mappings in self.mappings.items():
            forward.update(type_mappings)
        return forward

    def get_reverse_mappings(self) -> dict[str, str]:
        """
        Get reverse mappings (placeholder -> original text).

        Returns:
            Flat dictionary for desanitization
        """
        reverse = {}
        for entity_type, type_mappings in self.mappings.items():
            for original, placeholder in type_mappings.items():
                reverse[placeholder] = original
        return reverse

    def load_mappings(self, forward: dict[str, str], counters: dict[str, int]):
        """
        Restore state from stored mappings.

        Args:
            forward: Forward mappings dict (original text -> placeholder)
            counters: Counter state dict (entity_type -> next_index)
        """
        # Clear current state
        self.mappings.clear()
        self.counters = counters.copy()

        # Rebuild mappings by entity type
        for original, placeholder in forward.items():
            # Extract entity type from placeholder
            # Format: [ENTITY_TYPE_N]
            if placeholder.startswith("[") and placeholder.endswith("]"):
                inner = placeholder[1:-1]
                parts = inner.rsplit("_", 1)
                if len(parts) == 2:
                    entity_type = parts[0]
                    if entity_type not in self.mappings:
                        self.mappings[entity_type] = {}
                    self.mappings[entity_type][original] = placeholder

    @classmethod
    def from_response(cls, mappings: dict[str, str], counters: dict[str, int]) -> "MappingReplaceOperator":
        """Create operator with state from a sanitize response."""
        op = cls()
        op.load_mappings(mappings, counters)
        return op
