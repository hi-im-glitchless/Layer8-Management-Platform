"""Deny list matcher for pre-processing custom terms."""
import re
import logging
from typing import List, Tuple

from presidio_analyzer import RecognizerResult

logger = logging.getLogger(__name__)


class DenyListMatcher:
    """Matches deny list terms before Presidio analysis."""

    def __init__(self, terms: List[str]):
        """
        Initialize deny list matcher.

        Args:
            terms: List of terms to match
        """
        self.terms = terms
        self.pattern = None

        if terms:
            # Escape special regex characters and build pattern
            escaped_terms = [re.escape(term) for term in terms]
            # Use word boundaries and case-insensitive matching
            pattern_str = r"\b(" + "|".join(escaped_terms) + r")\b"
            self.pattern = re.compile(pattern_str, re.IGNORECASE)
            logger.debug(f"Deny list matcher initialized with {len(terms)} terms")

    def find_matches(self, text: str) -> List[Tuple[str, int, int]]:
        """
        Find all deny list term matches in text.

        Args:
            text: Text to search

        Returns:
            List of tuples: (matched_text, start_offset, end_offset)
        """
        if not self.pattern:
            return []

        matches = []
        for match in self.pattern.finditer(text):
            matches.append((match.group(), match.start(), match.end()))

        logger.debug(f"Found {len(matches)} deny list matches")
        return matches

    def to_recognizer_results(self, text: str) -> List[RecognizerResult]:
        """
        Convert deny list matches to Presidio RecognizerResult objects.

        Args:
            text: Text that was analyzed

        Returns:
            List of RecognizerResult objects with entity_type="CUSTOM", score=1.0
        """
        matches = self.find_matches(text)
        results = []

        for matched_text, start, end in matches:
            result = RecognizerResult(
                entity_type="CUSTOM",
                start=start,
                end=end,
                score=1.0,  # Deny list matches are always high confidence
            )
            results.append(result)

        return results
