"""Sanitize and desanitize API endpoints."""
import logging
from fastapi import APIRouter, HTTPException, Request

from app.models.request import SanitizeRequest, DesanitizeRequest
from app.models.response import SanitizeResponse, DesanitizeResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/sanitize", response_model=SanitizeResponse)
async def sanitize_endpoint(request_body: SanitizeRequest, request: Request):
    """
    Sanitize text by detecting and replacing PII with typed placeholders.

    Returns:
        SanitizeResponse with sanitized text, detected entities, and mappings for storage
    """
    # Check if models are loaded
    models_loaded = request.app.state.models_loaded_flag()
    if not models_loaded:
        logger.error("Models not loaded, returning 503")
        raise HTTPException(
            status_code=503,
            detail="Service is still loading language models. Please try again in a few seconds."
        )

    # Get sanitizer from app state
    sanitizer = request.app.state.sanitizer
    if sanitizer is None:
        logger.error("Sanitizer not initialized")
        raise HTTPException(
            status_code=503,
            detail="Sanitization service not initialized"
        )

    try:
        # Call sanitizer service
        result = sanitizer.sanitize(
            text=request_body.text,
            deny_list_terms=request_body.deny_list_terms,
            language=request_body.language,
            entities=request_body.entities,
        )

        # Log request metrics
        logger.info(
            f"Sanitize request for session {request_body.session_id}: "
            f"detected {len(result.entities)} entities, language={result.language}"
        )
        logger.debug(f"Entity counts: {result.entity_counts}")

        return result

    except Exception as e:
        logger.error(f"Sanitization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Sanitization failed: {str(e)}"
        )


@router.post("/desanitize", response_model=DesanitizeResponse)
async def desanitize_endpoint(request_body: DesanitizeRequest, request: Request):
    """
    Restore original text from sanitized text using reverse mappings.

    Returns:
        DesanitizeResponse with restored text and completeness status
    """
    # Check if models are loaded
    models_loaded = request.app.state.models_loaded_flag()
    if not models_loaded:
        logger.error("Models not loaded, returning 503")
        raise HTTPException(
            status_code=503,
            detail="Service is still loading language models. Please try again in a few seconds."
        )

    # Get sanitizer from app state
    sanitizer = request.app.state.sanitizer
    if sanitizer is None:
        logger.error("Sanitizer not initialized")
        raise HTTPException(
            status_code=503,
            detail="Sanitization service not initialized"
        )

    try:
        # Call desanitizer service
        result = sanitizer.desanitize(
            text=request_body.text,
            reverse_mappings=request_body.mappings,
        )

        # Log request metrics
        logger.info(
            f"Desanitize request for session {request_body.session_id}: "
            f"complete={result.complete}, unresolved={len(result.unresolved_placeholders)}"
        )

        if not result.complete:
            logger.warning(f"Unresolved placeholders: {result.unresolved_placeholders}")

        return result

    except Exception as e:
        logger.error(f"Desanitization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Desanitization failed: {str(e)}"
        )
