"""Custom recognizers for pentest-specific entities."""
from app.recognizers.ip_address import IPAddressRecognizer
from app.recognizers.hostname import HostnameRecognizer
from app.recognizers.ad_objects import ActiveDirectoryRecognizer
from app.recognizers.network_paths import NetworkPathRecognizer
from app.recognizers.domain import ExternalDomainRecognizer


def get_all_recognizers():
    """Return a list of all custom recognizer instances."""
    return [
        IPAddressRecognizer(),
        HostnameRecognizer(),
        ActiveDirectoryRecognizer(),
        NetworkPathRecognizer(),
        ExternalDomainRecognizer(),
    ]


__all__ = [
    "IPAddressRecognizer",
    "HostnameRecognizer",
    "ActiveDirectoryRecognizer",
    "NetworkPathRecognizer",
    "ExternalDomainRecognizer",
    "get_all_recognizers",
]
