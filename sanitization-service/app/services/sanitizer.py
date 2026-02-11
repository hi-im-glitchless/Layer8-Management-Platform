"""Core sanitization service orchestrating the entire pipeline."""
import logging
from typing import Any, List, Optional

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

from app.config import settings
from app.models.response import DetectedEntity, SanitizeResponse, DesanitizeResponse
from app.operators.mapping_replace import MappingReplaceOperator
from app.recognizers import get_all_recognizers
from app.services.deny_list import DenyListMatcher
from app.services.language_detector import detect_language

logger = logging.getLogger(__name__)


class SanitizationService:
    """Core sanitization service coordinating deny list, Presidio, and mapping."""

    def __init__(self, nlp_models: dict[str, Any]):
        """
        Initialize the sanitization service.

        Args:
            nlp_models: Dictionary of {language_code: spacy_model}
        """
        self.nlp_models = nlp_models
        self.analyzers: dict[str, AnalyzerEngine] = {}

        # Create an analyzer for each language
        for lang_code, nlp_model in nlp_models.items():
            logger.info(f"Creating analyzer for language: {lang_code}")

            # Create NLP engine provider for this language
            nlp_configuration = {
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": lang_code, "model_name": nlp_model.meta["name"]}],
            }

            provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
            nlp_engine = provider.create_engine()

            # Create analyzer with custom recognizers
            analyzer = AnalyzerEngine(
                nlp_engine=nlp_engine,
                supported_languages=[lang_code],
            )

            # Register all custom recognizers
            custom_recognizers = get_all_recognizers()
            for recognizer in custom_recognizers:
                analyzer.registry.add_recognizer(recognizer)
                logger.debug(f"Registered custom recognizer: {recognizer.supported_entity}")

            self.analyzers[lang_code] = analyzer
            logger.info(f"Analyzer for {lang_code} initialized with {len(custom_recognizers)} custom recognizers")

    def sanitize(
        self,
        text: str,
        deny_list_terms: List[str],
        language: Optional[str] = None,
        entities: Optional[List[str]] = None,
    ) -> SanitizeResponse:
        """
        Sanitize text by detecting and replacing PII with typed placeholders.

        Args:
            text: Input text to sanitize
            deny_list_terms: Custom terms to match before Presidio
            language: Override language (auto-detect if None)
            entities: Filter to specific entity types (None = all)

        Returns:
            SanitizeResponse with sanitized text and metadata
        """
        # Step 1: Language detection
        if language is None:
            detected_lang, confidence = detect_language(text)
            language = detected_lang
            if confidence < 0.7:
                logger.warning(f"Low language confidence: {confidence:.2f}")

        logger.info(f"Sanitizing text with language: {language}")

        # Step 2: Deny list pre-processing
        deny_list_results = []
        if deny_list_terms:
            matcher = DenyListMatcher(deny_list_terms)
            deny_list_results = matcher.to_recognizer_results(text)
            logger.info(f"Deny list matched {len(deny_list_results)} terms")

        # Step 3: Presidio analysis
        analyzer = self.analyzers.get(language)
        if analyzer is None:
            logger.warning(f"No analyzer for language '{language}', using 'en'")
            analyzer = self.analyzers["en"]
            language = "en"

        presidio_results = analyzer.analyze(
            text=text,
            language=language,
            entities=entities,
            score_threshold=settings.default_confidence_threshold,
        )
        logger.info(f"Presidio detected {len(presidio_results)} entities")

        # Step 4: Merge results (deny list + Presidio)
        all_results = deny_list_results + presidio_results

        # Sort by start position (important for offset preservation)
        all_results.sort(key=lambda r: r.start)

        # Remove overlapping results (higher score wins)
        merged_results = self._merge_overlapping_results(all_results)
        logger.info(f"After merging: {len(merged_results)} entities")

        # Step 5: Apply anonymization with mapping operator
        operator = MappingReplaceOperator()
        sanitized_text = text
        detected_entities = []

        # Process from end to start to preserve offsets
        for result in reversed(merged_results):
            original_text = text[result.start:result.end]

            # Generate placeholder
            placeholder = operator.operate(
                original_text,
                {"entity_type": result.entity_type}
            )

            # Replace in text
            sanitized_text = (
                sanitized_text[:result.start] +
                placeholder +
                sanitized_text[result.end:]
            )

            # Build entity metadata
            entity = DetectedEntity(
                entity_type=result.entity_type,
                start=result.start,
                end=result.end,
                score=result.score,
                text=original_text,
                placeholder=placeholder,
            )
            detected_entities.append(entity)

        # Reverse to get original order
        detected_entities.reverse()

        # Step 6: Build response
        entity_counts = {}
        for entity in detected_entities:
            entity_type = entity.entity_type
            entity_counts[entity_type] = entity_counts.get(entity_type, 0) + 1

        warning = None
        if not detected_entities:
            warning = "No PII entities detected in the provided text"

        return SanitizeResponse(
            sanitized_text=sanitized_text,
            entities=detected_entities,
            language=language,
            entity_counts=entity_counts,
            mappings=operator.get_forward_mappings(),
            counters=operator.counters,
            warning=warning,
        )

    def desanitize(
        self,
        text: str,
        reverse_mappings: dict[str, str],
    ) -> DesanitizeResponse:
        """
        Restore original text from sanitized text using reverse mappings.

        Args:
            text: Sanitized text with placeholders
            reverse_mappings: Dictionary of {placeholder: original_text}

        Returns:
            DesanitizeResponse with restored text and completeness status
        """
        import re

        desanitized_text = text
        unresolved_placeholders = []

        # Find all placeholders in text
        placeholder_pattern = re.compile(r'\[([A-Z_]+_\d+)\]')

        # Replace each placeholder
        for match in placeholder_pattern.finditer(text):
            placeholder = match.group(0)

            if placeholder in reverse_mappings:
                # Replace placeholder with original text
                desanitized_text = desanitized_text.replace(
                    placeholder,
                    reverse_mappings[placeholder],
                    1  # Replace only first occurrence
                )
            else:
                # Track unresolved placeholder
                if placeholder not in unresolved_placeholders:
                    unresolved_placeholders.append(placeholder)

        # Check if desanitization is complete
        complete = len(unresolved_placeholders) == 0

        # Double-check: scan for any remaining placeholders
        remaining = placeholder_pattern.findall(desanitized_text)
        if remaining:
            complete = False
            for placeholder_inner in remaining:
                full_placeholder = f"[{placeholder_inner}]"
                if full_placeholder not in unresolved_placeholders:
                    unresolved_placeholders.append(full_placeholder)

        logger.info(
            f"Desanitization {'complete' if complete else 'incomplete'}, "
            f"unresolved: {len(unresolved_placeholders)}"
        )

        return DesanitizeResponse(
            text=desanitized_text,
            complete=complete,
            unresolved_placeholders=unresolved_placeholders,
        )

    def _merge_overlapping_results(self, results):
        """
        Merge overlapping entity results, keeping higher-scoring ones.

        Args:
            results: List of RecognizerResult objects (already sorted by start)

        Returns:
            List of non-overlapping results
        """
        if not results:
            return []

        merged = [results[0]]

        for current in results[1:]:
            last = merged[-1]

            # Check for overlap
            if current.start < last.end:
                # Overlapping - keep higher score
                if current.score > last.score:
                    merged[-1] = current
                # else: keep last (already in merged)
            else:
                # No overlap
                merged.append(current)

        return merged
