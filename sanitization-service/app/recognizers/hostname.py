"""Hostname recognizer for internal FQDNs."""
from typing import Optional

from presidio_analyzer import Pattern, PatternRecognizer


class HostnameRecognizer(PatternRecognizer):
    """Custom recognizer for internal hostnames and FQDNs."""

    # Common product/service names to exclude (false positives)
    EXCLUSION_LIST = [
        "localhost",
        "example.local",
        "test.local",
        "demo.internal",
    ]

    # Context words that boost confidence
    CONTEXT_WORDS = [
        "hostname",
        "server",
        "host",
        "DNS",
        "resolve",
        "domain",
        "FQDN",
    ]

    def __init__(self):
        """Initialize Hostname recognizer."""
        patterns = [
            # Simple internal TLD (e.g., server.local, dc01.corp)
            Pattern(
                name="internal_tld",
                regex=r"\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:local|internal|corp|lan|intranet|ad|domain)\b",
                score=0.7,
            ),
            # Multi-level FQDN (e.g., server.subdomain.corp)
            Pattern(
                name="multi_level_fqdn",
                regex=r"\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\.(?:local|internal|corp|lan|intranet)\b",
                score=0.75,
            ),
        ]

        super().__init__(
            supported_entity="HOSTNAME",
            patterns=patterns,
            context=self.CONTEXT_WORDS,
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        """
        Validate hostname detection result.

        Returns:
            True to accept, False to reject, None to use default behavior
        """
        # Reject known false positives
        if pattern_text.lower() in self.EXCLUSION_LIST:
            return False

        # Accept all other matches
        return None
