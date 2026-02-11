"""Active Directory object recognizer."""
from presidio_analyzer import Pattern, PatternRecognizer


class ActiveDirectoryRecognizer(PatternRecognizer):
    """Custom recognizer for Active Directory distinguished names."""

    # Context words that boost confidence
    CONTEXT_WORDS = [
        "Active Directory",
        "LDAP",
        "DN",
        "distinguished name",
        "domain controller",
        "OU",
        "organizational unit",
    ]

    def __init__(self):
        """Initialize Active Directory recognizer."""
        patterns = [
            # AD Distinguished Name format: CN=...,OU=...,DC=...
            Pattern(
                name="ad_dn",
                regex=r"\b(?:CN|OU|DC)=(?:[^,\\]|\\.)+(?:,(?:CN|OU|DC)=(?:[^,\\]|\\.)+)*",
                score=0.8,
            ),
        ]

        super().__init__(
            supported_entity="AD_OBJECT",
            patterns=patterns,
            context=self.CONTEXT_WORDS,
        )
