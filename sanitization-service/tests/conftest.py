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
