"""API routes for sanitization service."""
from app.routes.docx import router as docx_router
from app.routes.sanitize import router as sanitize_router

__all__ = ["docx_router", "sanitize_router"]
