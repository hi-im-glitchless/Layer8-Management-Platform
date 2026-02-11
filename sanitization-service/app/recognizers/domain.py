"""External domain recognizer."""
from typing import Optional

from presidio_analyzer import Pattern, PatternRecognizer


class ExternalDomainRecognizer(PatternRecognizer):
    """Custom recognizer for external domains."""

    # Well-known domains to exclude (not sensitive)
    WELL_KNOWN_DOMAINS = {
        "github.com",
        "google.com",
        "microsoft.com",
        "apple.com",
        "amazon.com",
        "facebook.com",
        "twitter.com",
        "linkedin.com",
        "stackoverflow.com",
        "reddit.com",
        "youtube.com",
        "wikipedia.org",
        "npmjs.com",
        "pypi.org",
        "docker.com",
        "kubernetes.io",
    }

    # Context words that boost confidence
    CONTEXT_WORDS = [
        "domain",
        "website",
        "URL",
        "site",
        "client",
    ]

    def __init__(self):
        """Initialize External Domain recognizer."""
        patterns = [
            # Common TLDs
            Pattern(
                name="external_domain",
                regex=r"\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|net|org|io|pt|eu|co\.uk|de|fr|es|it|nl|be|gov|edu|mil)\b",
                score=0.5,
            ),
        ]

        super().__init__(
            supported_entity="DOMAIN",
            patterns=patterns,
            context=self.CONTEXT_WORDS,
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        """
        Validate domain detection result.

        Returns:
            True to accept, False to reject, None to use default behavior
        """
        # Reject well-known non-sensitive domains
        if pattern_text.lower() in self.WELL_KNOWN_DOMAINS:
            return False

        # Accept all other matches
        return None
