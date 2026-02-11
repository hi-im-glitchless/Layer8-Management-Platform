"""Request models for sanitization API."""
from pydantic import BaseModel


class SanitizeRequest(BaseModel):
    """Request model for sanitization endpoint."""

    text: str
    session_id: str
    deny_list_terms: list[str] = []
    entities: list[str] | None = None
    language: str | None = None


class DesanitizeRequest(BaseModel):
    """Request model for desanitization endpoint."""

    text: str
    session_id: str
