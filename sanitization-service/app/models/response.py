"""Response models for sanitization API."""
from pydantic import BaseModel


class DetectedEntity(BaseModel):
    """Detected PII entity."""

    entity_type: str
    start: int
    end: int
    score: float
    text: str
    placeholder: str


class SanitizeResponse(BaseModel):
    """Response model for sanitization endpoint."""

    sanitized_text: str
    entities: list[DetectedEntity]
    language: str
    entity_counts: dict[str, int]
    mappings: dict[str, str]  # Forward mappings for Redis storage (original -> placeholder)
    counters: dict[str, int]  # Counter state for Redis storage (entity_type -> next_index)
    warning: str | None = None


class DesanitizeResponse(BaseModel):
    """Response model for desanitization endpoint."""

    text: str
    complete: bool
    unresolved_placeholders: list[str]


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""

    status: str
    models_loaded: bool
    supported_languages: list[str]
