"""API routes for sanitization service."""
from app.routes.adapter import router as adapter_router
from app.routes.docx import router as docx_router
from app.routes.sanitize import router as sanitize_router

__all__ = ["adapter_router", "docx_router", "sanitize_router"]
