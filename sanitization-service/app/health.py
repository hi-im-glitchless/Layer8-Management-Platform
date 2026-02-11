"""Health check endpoint for sanitization service."""
from fastapi import APIRouter, Request, Response, status

from app.models.response import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request, response: Response):
    """
    Health and readiness check endpoint.

    Returns 200 with models_loaded=true when spaCy models are loaded.
    Returns 503 with models_loaded=false when models are not loaded.
    """
    # Access global state from app
    nlp_models = request.app.state.nlp_models
    models_loaded = request.app.state.models_loaded_flag()

    if models_loaded:
        supported_languages = list(nlp_models.keys())
        response.status_code = status.HTTP_200_OK
        return HealthResponse(
            status="healthy",
            models_loaded=True,
            supported_languages=supported_languages,
        )
    else:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(
            status="unavailable",
            models_loaded=False,
            supported_languages=[],
        )
