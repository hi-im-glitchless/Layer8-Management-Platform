"""Language detection service using fast-langdetect."""
import logging
from typing import Any, Tuple

try:
    from fastlangdetect import detect
except ImportError:
    # Fallback if fastlangdetect not available
    def detect(text: str) -> dict:
        return {"lang": "en", "score": 1.0}

logger = logging.getLogger(__name__)

# Supported languages (must match spaCy models)
SUPPORTED_LANGUAGES = {"en", "pt"}


def detect_language(text: str) -> Tuple[str, float]:
    """
    Detect language from text.

    Args:
        text: Input text (uses first 500 chars for speed)

    Returns:
        Tuple of (language_code, confidence)
    """
    # Use first 500 chars for fast detection
    sample = text[:500] if len(text) > 500 else text

    try:
        result = detect(sample)
        lang_code = result.get("lang", "en")
        confidence = result.get("score", 0.0)

        # Map to supported languages
        if lang_code not in SUPPORTED_LANGUAGES:
            logger.warning(
                f"Detected unsupported language '{lang_code}', defaulting to 'en'"
            )
            lang_code = "en"
            confidence = 0.5

        # Warn on low confidence
        if confidence < 0.7:
            logger.warning(
                f"Low language detection confidence: {confidence:.2f} for '{lang_code}'"
            )

        return lang_code, confidence

    except Exception as e:
        logger.error(f"Language detection failed: {e}, defaulting to 'en'")
        return "en", 0.5


def select_nlp_model(text: str, nlp_models: dict[str, Any]) -> Tuple[Any, str]:
    """
    Select appropriate spaCy NLP model based on detected language.

    Args:
        text: Input text
        nlp_models: Dictionary of {language_code: spacy_model}

    Returns:
        Tuple of (spacy_model, language_code)
    """
    lang_code, confidence = detect_language(text)

    # Get model for detected language
    model = nlp_models.get(lang_code)

    # Fallback to English if model not found
    if model is None:
        logger.warning(f"No model found for '{lang_code}', using English")
        lang_code = "en"
        model = nlp_models.get("en")

    if model is None:
        raise RuntimeError("No spaCy models loaded")

    return model, lang_code
