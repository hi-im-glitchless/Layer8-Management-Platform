"""Network path recognizer for UNC and SMB paths."""
from presidio_analyzer import Pattern, PatternRecognizer


class NetworkPathRecognizer(PatternRecognizer):
    """Custom recognizer for network paths (UNC and SMB)."""

    # Context words that boost confidence
    CONTEXT_WORDS = [
        "share",
        "network",
        "UNC",
        "SMB",
        "mount",
        "file server",
    ]

    def __init__(self):
        """Initialize Network Path recognizer."""
        patterns = [
            # UNC paths: \\server\share\path
            Pattern(
                name="unc_path",
                regex=r"\\\\[a-zA-Z0-9._-]+\\[a-zA-Z0-9$._-]+(?:\\[a-zA-Z0-9._-]+)*",
                score=0.8,
            ),
            # SMB URLs: smb://server/share/path
            Pattern(
                name="smb_url",
                regex=r"smb://[a-zA-Z0-9._-]+/[a-zA-Z0-9._/-]+",
                score=0.8,
            ),
        ]

        super().__init__(
            supported_entity="NETWORK_PATH",
            patterns=patterns,
            context=self.CONTEXT_WORDS,
        )
