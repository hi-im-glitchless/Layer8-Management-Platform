"""DOCX parse and generate API endpoints."""
import base64
import logging
from io import BytesIO

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.models.docx import (
    DocxStructure,
    GenerateDocxRequest,
)
from app.services.docx_generator import DocxGeneratorService
from app.services.docx_parser import DocxParserService

logger = logging.getLogger(__name__)

router = APIRouter()

# Service singletons
_parser = DocxParserService()
_generator = DocxGeneratorService()

# Constants
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


@router.post("/parse-docx", response_model=DocxStructure)
async def parse_docx(file: UploadFile) -> DocxStructure:
    """Parse an uploaded DOCX file and return its structured content.

    Accepts a multipart file upload. Validates extension, MIME type, and size.
    Returns paragraphs, tables, images, sections, styles, and metadata.
    """
    # Validate filename extension
    filename = file.filename or ""
    if not filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="File must have a .docx extension.",
        )

    # Validate content type
    if file.content_type and file.content_type != DOCX_MIME:
        # Some clients may send generic types; only reject explicitly wrong ones
        if file.content_type not in (
            DOCX_MIME,
            "application/octet-stream",
            "application/zip",
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid content type: {file.content_type}. Expected DOCX.",
            )

    # Read and validate size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    # Parse
    try:
        result = _parser.parse(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("DOCX parse failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal error while parsing DOCX file.",
        )

    logger.info(
        "Parsed DOCX '%s': %d paragraphs, %d tables, %d images",
        filename,
        len(result.paragraphs),
        len(result.tables),
        len(result.images),
    )
    return result


@router.post("/generate-docx")
async def generate_docx(body: GenerateDocxRequest) -> StreamingResponse:
    """Generate a DOCX file from a base64-encoded template and placeholder values.

    The template_content field must be a base64-encoded DOCX file containing
    Jinja2 placeholders. The placeholders dict provides values for rendering.
    Returns the rendered DOCX as a downloadable file.
    """
    # Decode base64 template
    try:
        template_bytes = base64.b64decode(body.template_content)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="template_content is not valid base64.",
        )

    if len(template_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail="Decoded template is empty.",
        )

    # Generate
    try:
        result_bytes = _generator.generate(template_bytes, body.placeholders)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("DOCX generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal error while generating DOCX file.",
        )

    logger.info(
        "Generated DOCX: %d bytes, %d placeholders",
        len(result_bytes),
        len(body.placeholders),
    )

    return StreamingResponse(
        BytesIO(result_bytes),
        media_type=DOCX_MIME,
        headers={
            "Content-Disposition": 'attachment; filename="generated.docx"',
            "Content-Length": str(len(result_bytes)),
        },
    )
