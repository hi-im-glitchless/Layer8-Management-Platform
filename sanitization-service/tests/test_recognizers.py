"""Unit tests for custom recognizers."""
import pytest
from app.recognizers.ip_address import IPAddressRecognizer
from app.recognizers.hostname import HostnameRecognizer
from app.recognizers.ad_objects import ActiveDirectoryRecognizer
from app.recognizers.network_paths import NetworkPathRecognizer
from app.recognizers.domain import ExternalDomainRecognizer


@pytest.mark.unit
class TestIPAddressRecognizer:
    """Test IP address recognition with version string filtering."""

    def test_detect_standard_ip(self):
        """Should detect standard IPv4 address."""
        recognizer = IPAddressRecognizer()
        text = "Server at 10.1.2.50 was vulnerable"
        results = recognizer.analyze(text, ["IP_ADDR"])

        assert len(results) == 1
        assert results[0].entity_type == "IP_ADDR"
        assert text[results[0].start:results[0].end] == "10.1.2.50"
        assert results[0].score >= 0.6

    def test_reject_version_string_openssh(self):
        """Should NOT detect version numbers as IPs (OpenSSH case)."""
        recognizer = IPAddressRecognizer()
        text = "OpenSSH 8.2.1 running on host"
        results = recognizer.analyze(text, ["IP_ADDR"])

        # Version string should be filtered out
        assert len(results) == 0

    def test_reject_version_string_apache(self):
        """Should NOT detect Apache version as IP."""
        recognizer = IPAddressRecognizer()
        text = "Apache/2.4.51 installed on server"
        results = recognizer.analyze(text, ["IP_ADDR"])

        assert len(results) == 0

    def test_reject_localhost(self):
        """Should NOT detect localhost IP."""
        recognizer = IPAddressRecognizer()
        text = "Connect to 127.0.0.1 for testing"
        results = recognizer.analyze(text, ["IP_ADDR"])

        assert len(results) == 0

    def test_reject_rfc5737_documentation_range(self):
        """Should NOT detect RFC5737 documentation IPs."""
        recognizer = IPAddressRecognizer()

        # Test all three RFC5737 ranges
        test_cases = [
            "Example IP: 192.0.2.1",
            "Documentation: 198.51.100.5",
            "Test network: 203.0.113.10",
        ]

        for text in test_cases:
            results = recognizer.analyze(text, ["IP_ADDR"])
            assert len(results) == 0, f"Should reject documentation IP in: {text}"

    def test_detect_ip_with_cidr(self):
        """Should detect IP with CIDR notation."""
        recognizer = IPAddressRecognizer()
        text = "Target network: 10.1.2.0/24 was scanned"
        results = recognizer.analyze(text, ["IP_ADDR"])

        assert len(results) == 1
        assert "10.1.2.0/24" in text[results[0].start:results[0].end]
        assert results[0].score >= 0.7  # CIDR gets higher score

    def test_pentest_context_boosts_score(self):
        """Should boost score when pentest context words are nearby."""
        recognizer = IPAddressRecognizer()

        # With pentest context
        text_with_context = "Target IP 10.1.2.50 was exploited"
        results_with = recognizer.analyze(text_with_context, ["IP_ADDR"])

        # Without pentest context
        text_without = "The server 10.1.2.50 is configured"
        results_without = recognizer.analyze(text_without, ["IP_ADDR"])

        assert len(results_with) == 1
        assert len(results_without) == 1
        # Score should be higher with context
        assert results_with[0].score > results_without[0].score

    def test_reject_link_local(self):
        """Should NOT detect link-local address."""
        recognizer = IPAddressRecognizer()
        text = "Link-local address 169.254.1.1 assigned"
        results = recognizer.analyze(text, ["IP_ADDR"])

        assert len(results) == 0


@pytest.mark.unit
class TestHostnameRecognizer:
    """Test hostname recognition for internal domains."""

    def test_detect_fqdn_local(self):
        """Should detect FQDN with .local TLD."""
        recognizer = HostnameRecognizer()
        text = "Connected to dc01.corp.local for authentication"
        results = recognizer.analyze(text, ["HOSTNAME"])

        assert len(results) == 1
        assert results[0].entity_type == "HOSTNAME"
        assert text[results[0].start:results[0].end] == "dc01.corp.local"

    def test_detect_fqdn_internal(self):
        """Should detect FQDN with .internal TLD."""
        recognizer = HostnameRecognizer()
        text = "Found srv-web01.internal in DNS"
        results = recognizer.analyze(text, ["HOSTNAME"])

        assert len(results) == 1
        assert "srv-web01.internal" in text[results[0].start:results[0].end]

    def test_reject_public_domain(self):
        """Should NOT detect public domains (non-internal TLD)."""
        recognizer = HostnameRecognizer()
        text = "Visit google.com for more information"
        results = recognizer.analyze(text, ["HOSTNAME"])

        assert len(results) == 0

    def test_detect_corp_tld(self):
        """Should detect .corp TLD as internal."""
        recognizer = HostnameRecognizer()
        text = "Accessed fileserver.corp during the engagement"
        results = recognizer.analyze(text, ["HOSTNAME"])

        assert len(results) == 1
        assert "fileserver.corp" in text[results[0].start:results[0].end]

    def test_higher_score_for_multilevel_fqdn(self):
        """Should give higher score to multi-level FQDN."""
        recognizer = HostnameRecognizer()
        text = "server.subdomain.corp.local is the target"
        results = recognizer.analyze(text, ["HOSTNAME"])

        assert len(results) == 1
        # Multi-level should get 0.75 score
        assert results[0].score >= 0.75


@pytest.mark.unit
class TestActiveDirectoryRecognizer:
    """Test Active Directory Distinguished Name recognition."""

    def test_detect_user_dn(self):
        """Should detect user DN with CN, OU, DC components."""
        recognizer = ActiveDirectoryRecognizer()
        text = "User found: CN=John Doe,OU=IT,DC=corp,DC=local"
        results = recognizer.analyze(text, ["AD_OBJECT"])

        assert len(results) == 1
        assert results[0].entity_type == "AD_OBJECT"
        assert "CN=John Doe,OU=IT,DC=corp,DC=local" in text[results[0].start:results[0].end]
        assert results[0].score >= 0.8

    def test_detect_ou_dn(self):
        """Should detect organizational unit DN."""
        recognizer = ActiveDirectoryRecognizer()
        text = "Modified OU=Finance,DC=globaltech,DC=internal during test"
        results = recognizer.analyze(text, ["AD_OBJECT"])

        assert len(results) == 1
        assert "OU=Finance,DC=globaltech,DC=internal" in text[results[0].start:results[0].end]

    def test_detect_with_spaces(self):
        """Should detect DN with spaces in values."""
        recognizer = ActiveDirectoryRecognizer()
        text = "Account: CN=Service Account,OU=Service Accounts,DC=domain,DC=com"
        results = recognizer.analyze(text, ["AD_OBJECT"])

        assert len(results) == 1


@pytest.mark.unit
class TestNetworkPathRecognizer:
    """Test network path recognition (UNC and SMB)."""

    def test_detect_unc_path(self):
        """Should detect UNC path format."""
        recognizer = NetworkPathRecognizer()
        text = "Access \\\\fileserver\\share\\docs for files"
        results = recognizer.analyze(text, ["NETWORK_PATH"])

        assert len(results) == 1
        assert results[0].entity_type == "NETWORK_PATH"
        assert "\\\\fileserver\\share\\docs" in text[results[0].start:results[0].end]
        assert results[0].score >= 0.8

    def test_detect_smb_url(self):
        """Should detect SMB URL format."""
        recognizer = NetworkPathRecognizer()
        text = "Connect via smb://fileserver/share/documents"
        results = recognizer.analyze(text, ["NETWORK_PATH"])

        assert len(results) == 1
        assert "smb://fileserver/share/documents" in text[results[0].start:results[0].end]
        assert results[0].score >= 0.8

    def test_detect_nested_unc_path(self):
        """Should detect deeply nested UNC paths."""
        recognizer = NetworkPathRecognizer()
        text = "Found: \\\\srv\\dept\\team\\project\\confidential.docx"
        results = recognizer.analyze(text, ["NETWORK_PATH"])

        assert len(results) == 1


@pytest.mark.unit
class TestExternalDomainRecognizer:
    """Test external domain recognition with exclusions."""

    def test_detect_client_domain(self):
        """Should detect client domain."""
        recognizer = ExternalDomainRecognizer()
        text = "Client website globaltech-corp.com was assessed"
        results = recognizer.analyze(text, ["DOMAIN"])

        assert len(results) == 1
        assert results[0].entity_type == "DOMAIN"
        assert "globaltech-corp.com" in text[results[0].start:results[0].end]

    def test_reject_well_known_domain(self):
        """Should NOT detect well-known public domains."""
        recognizer = ExternalDomainRecognizer()

        excluded_domains = [
            "github.com is the repository",
            "google.com search engine",
            "microsoft.com products",
        ]

        for text in excluded_domains:
            results = recognizer.analyze(text, ["DOMAIN"])
            assert len(results) == 0, f"Should reject well-known domain in: {text}"

    def test_detect_various_tlds(self):
        """Should detect domains with various TLDs."""
        recognizer = ExternalDomainRecognizer()

        test_cases = [
            ("client-site.io was tested", "client-site.io"),
            ("Target: empresa.pt network", "empresa.pt"),
            ("European site: company.eu assessed", "company.eu"),
        ]

        for text, expected_domain in test_cases:
            results = recognizer.analyze(text, ["DOMAIN"])
            assert len(results) >= 1, f"Should detect domain in: {text}"
            found_text = text[results[0].start:results[0].end]
            assert expected_domain in found_text
