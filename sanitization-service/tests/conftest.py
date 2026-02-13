"""Pytest configuration and shared fixtures for sanitization tests."""
import pytest
from typing import Dict, Any

# Mock spaCy models for testing (since we may not have large models installed)
try:
    import spacy
    SPACY_AVAILABLE = True

    # Try to load small models first
    try:
        nlp_en = spacy.load("en_core_web_sm")
        nlp_pt = spacy.load("pt_core_news_sm")
        MODELS_LOADED = True
    except OSError:
        # Models not installed - tests will be skipped
        nlp_en = None
        nlp_pt = None
        MODELS_LOADED = False
except ImportError:
    SPACY_AVAILABLE = False
    MODELS_LOADED = False
    nlp_en = None
    nlp_pt = None


@pytest.fixture(scope="session")
def nlp_models() -> Dict[str, Any]:
    """
    Provide loaded spaCy models for testing.

    Uses small models (en_core_web_sm, pt_core_news_sm) if available.
    Tests requiring this fixture will be skipped if models aren't installed.
    """
    if not MODELS_LOADED:
        pytest.skip("spaCy models not installed")

    return {
        "en": nlp_en,
        "pt": nlp_pt,
    }


@pytest.fixture
def sanitization_service(nlp_models):
    """
    Provide a configured SanitizationService instance.

    This fixture depends on nlp_models, so it will be skipped if models unavailable.
    """
    from app.services.sanitizer import SanitizationService

    return SanitizationService(nlp_models)


@pytest.fixture
def sample_deny_list():
    """Provide a sample deny list for testing."""
    return [
        "Acme Corp",
        "GlobalTech",
        "Secret Project Alpha",
        "C++ team",  # Test special regex chars
    ]


# Mark for tests that require full spaCy models
requires_spacy = pytest.mark.skipif(
    not MODELS_LOADED,
    reason="spaCy models not installed (run: python -m spacy download en_core_web_sm pt_core_news_sm)"
)

# Mark for tests that can run without spaCy (recognizer unit tests use regex only)
unit_test = pytest.mark.unit


# ---------------------------------------------------------------------------
# Template adapter fixtures
# ---------------------------------------------------------------------------

from pathlib import Path

from app.services.reference_loader import TEMPLATE_DIR


@pytest.fixture
def test_client_docx_bytes() -> bytes:
    """Provide a programmatic client DOCX for adapter testing.

    Creates a realistic pentest report with cover page, executive summary,
    scope, methodology, findings, and team sections. Calibri font throughout.
    """
    from tests.fixtures.adapter_fixtures import create_test_client_docx
    return create_test_client_docx()


@pytest.fixture
def web_mapping_plan():
    """Pre-built MappingPlan for web template type."""
    from tests.fixtures.adapter_fixtures import SAMPLE_MAPPING_PLAN_WEB
    return SAMPLE_MAPPING_PLAN_WEB


@pytest.fixture
def internal_mapping_plan():
    """Pre-built MappingPlan for internal template type."""
    from tests.fixtures.adapter_fixtures import SAMPLE_MAPPING_PLAN_INTERNAL
    return SAMPLE_MAPPING_PLAN_INTERNAL


@pytest.fixture
def web_instruction_set():
    """Pre-built InstructionSet for web template."""
    from tests.fixtures.adapter_fixtures import SAMPLE_INSTRUCTION_SET_WEB
    return SAMPLE_INSTRUCTION_SET_WEB


@pytest.fixture
def internal_instruction_set():
    """Pre-built InstructionSet for internal template with filter_type blocks."""
    from tests.fixtures.adapter_fixtures import SAMPLE_INSTRUCTION_SET_INTERNAL
    return SAMPLE_INSTRUCTION_SET_INTERNAL


@pytest.fixture(scope="session")
def reference_templates_available() -> bool:
    """Check whether reference template files are available for E2E tests.

    Returns True if the test-templates/ghost-templates directory exists
    and contains at least one .docx file.
    """
    return TEMPLATE_DIR.exists() and any(TEMPLATE_DIR.glob("*.docx"))
