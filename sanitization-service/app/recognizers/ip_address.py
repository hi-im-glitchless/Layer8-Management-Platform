"""IP Address recognizer with version string filtering."""
import re
from typing import Optional

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult


class IPAddressRecognizer(PatternRecognizer):
    """Custom recognizer for IP addresses with smart filtering."""

    # Common version string prefixes to check
    VERSION_INDICATORS = [
        "OpenSSH",
        "Apache/",
        "nginx/",
        "v",
        "version",
        "Ver",
        "VER",
    ]

    # Localhost and documentation ranges to reject
    REJECT_RANGES = [
        (127, None, None, None),  # 127.x.x.x
        (192, 0, 2, None),  # 192.0.2.x
        (198, 51, 100, None),  # 198.51.100.x
        (203, 0, 113, None),  # 203.0.113.x
        (169, 254, None, None),  # 169.254.x.x (link-local)
    ]

    # Context words that boost confidence
    CONTEXT_WORDS = [
        "server",
        "host",
        "IP",
        "address",
        "network",
        "subnet",
        "target",
        "scan",
        "port",
    ]

    def __init__(self):
        """Initialize IP Address recognizer."""
        patterns = [
            # Standard IPv4
            Pattern(
                name="ipv4",
                regex=r"\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b",
                score=0.6,
            ),
            # IPv4 with CIDR notation
            Pattern(
                name="ipv4_cidr",
                regex=r"\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)/\d{1,2}\b",
                score=0.7,
            ),
        ]

        super().__init__(
            supported_entity="IP_ADDR",
            patterns=patterns,
            context=self.CONTEXT_WORDS,
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        """
        Validate IP address detection result.

        Returns:
            True to accept, False to reject, None to use default behavior
        """
        # Remove CIDR suffix if present
        ip_text = pattern_text.split("/")[0]

        # Parse octets
        try:
            octets = [int(x) for x in ip_text.split(".")]
        except ValueError:
            return False

        # Check reject ranges
        for reject_range in self.REJECT_RANGES:
            if self._matches_range(octets, reject_range):
                return False

        return None  # Accept with default scoring

    def _matches_range(self, octets: list[int], range_spec: tuple) -> bool:
        """Check if IP matches a rejection range."""
        for i, expected in enumerate(range_spec):
            if expected is None:
                continue
            if octets[i] != expected:
                return False
        return True

    def analyze(self, text: str, entities: list[str], nlp_artifacts=None):
        """
        Analyze text for IP addresses with context-aware scoring.

        Override to add version string filtering and context boosting.
        """
        # Get base results from pattern matching
        results = super().analyze(text, entities, nlp_artifacts)

        filtered_results = []
        for result in results:
            # Check if this IP is part of a version string
            if self._is_version_string(text, result.start):
                continue

            # Boost score if in pentest context
            if self._has_pentest_context(text, result.start, result.end):
                result.score = min(0.85, result.score + 0.2)

            filtered_results.append(result)

        return filtered_results

    def _is_version_string(self, text: str, start_pos: int) -> bool:
        """Check if IP-like pattern is actually a version string."""
        # Look back up to 20 characters before the match
        lookback_start = max(0, start_pos - 20)
        lookback_text = text[lookback_start:start_pos]

        # Check for version indicators
        for indicator in self.VERSION_INDICATORS:
            if indicator in lookback_text:
                return True

        return False

    def _has_pentest_context(self, text: str, start: int, end: int) -> bool:
        """Check if IP has pentest-specific context words nearby."""
        # Check surrounding 50 characters
        context_start = max(0, start - 50)
        context_end = min(len(text), end + 50)
        context = text[context_start:context_end].lower()

        pentest_words = ["target", "host", "scan", "exploit", "attack", "payload"]
        return any(word in context for word in pentest_words)
