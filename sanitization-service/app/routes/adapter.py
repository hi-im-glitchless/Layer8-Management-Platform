"""Template adapter API endpoints.

POST /analyze  -- Prepare analysis prompt from client DOCX (LLM call done by Node.js)
POST /validate-mapping -- Validate raw LLM JSON response into a MappingPlan
"""
import base64
import json
import logging

from fastapi import APIRouter, HTTPException

from app.models.adapter import (
    FIELD_MARKER_MAP,
    AnalyzeRequest,
    AnalyzeResponse,
    MappingEntry,
    MappingPlan,
    ValidateMappingRequest,
    ValidateMappingResponse,
)
from app.services.analysis_prompt import (
    build_analysis_prompt,
    build_analysis_system_prompt,
)
from app.services.docx_parser import DocxParserService
from app.services.reference_loader import (
    get_reference_template_hash,
    load_reference_template,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_parser = DocxParserService()

# DOCX magic bytes: PK zip header
_DOCX_MAGIC = b"PK\x03\x04"

# All valid GW field paths for validation
_VALID_GW_FIELDS: set[str] = set(FIELD_MARKER_MAP.keys())


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_template(body: AnalyzeRequest) -> AnalyzeResponse:
    """Prepare an LLM analysis prompt from a client DOCX template.

    Decodes the base64 template, parses its structure, loads the matching
    reference template, and builds the analysis prompt. Does NOT call the
    LLM -- that is done by the Node.js backend.
    """
    # Decode base64 template
    try:
        template_bytes = base64.b64decode(body.template_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="template_base64 is not valid base64.")

    if len(template_bytes) == 0:
        raise HTTPException(status_code=400, detail="Decoded template is empty.")

    # Validate DOCX magic bytes
    if template_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=400,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    # Parse client DOCX
    try:
        doc_structure = _parser.parse(template_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse DOCX: {exc}")
    except Exception as exc:
        logger.error("DOCX parse failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error while parsing DOCX.")

    # Load matching reference template
    try:
        reference_info = load_reference_template(body.template_type, body.language)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Build prompts
    system_prompt = build_analysis_system_prompt()
    prompt = build_analysis_prompt(
        doc_structure, reference_info, body.template_type, body.language
    )

    # Get reference template hash
    ref_hash = get_reference_template_hash(body.template_type, body.language)

    # Count non-empty paragraphs
    non_empty = sum(1 for p in doc_structure.paragraphs if p.text.strip())

    # Build doc structure summary
    doc_summary = {
        "paragraph_count": len(doc_structure.paragraphs),
        "non_empty_paragraphs": non_empty,
        "table_count": len(doc_structure.tables),
        "image_count": len(doc_structure.images),
        "styles": doc_structure.styles[:10],
    }

    logger.info(
        "Prepared analysis prompt: type=%s, lang=%s, paragraphs=%d, prompt_len=%d",
        body.template_type,
        body.language,
        non_empty,
        len(prompt),
    )

    return AnalyzeResponse(
        prompt=prompt,
        system_prompt=system_prompt,
        doc_structure_summary=doc_summary,
        reference_template_hash=ref_hash,
        paragraph_count=non_empty,
    )


@router.post("/validate-mapping", response_model=ValidateMappingResponse)
async def validate_mapping(body: ValidateMappingRequest) -> ValidateMappingResponse:
    """Validate raw LLM JSON response into a structured MappingPlan.

    Parses the LLM response text as JSON, validates each entry's
    section_index, gw_field, and marker_type, and returns a validated
    MappingPlan or a list of errors.
    """
    errors: list[str] = []

    # Parse JSON
    try:
        raw = json.loads(body.llm_response)
    except json.JSONDecodeError as exc:
        return ValidateMappingResponse(
            valid=False,
            errors=[f"Invalid JSON from LLM: {exc}"],
        )

    if not isinstance(raw, dict):
        return ValidateMappingResponse(
            valid=False,
            errors=["LLM response must be a JSON object with 'entries' array."],
        )

    raw_entries = raw.get("entries", [])
    if not isinstance(raw_entries, list):
        return ValidateMappingResponse(
            valid=False,
            errors=["'entries' must be a JSON array."],
        )

    raw_warnings = raw.get("warnings", [])
    if not isinstance(raw_warnings, list):
        raw_warnings = []

    # Validate each entry
    valid_entries: list[MappingEntry] = []
    for i, entry in enumerate(raw_entries):
        entry_errors = _validate_entry(entry, i, body.paragraph_count)
        if entry_errors:
            errors.extend(entry_errors)
            continue

        valid_entries.append(
            MappingEntry(
                section_index=int(entry["section_index"]),
                section_text=str(entry.get("section_text", ""))[:100],
                gw_field=str(entry["gw_field"]),
                placeholder_template=str(entry.get("placeholder_template", "")),
                confidence=float(entry.get("confidence", 0.5)),
                marker_type=str(entry.get("marker_type", "text")),
                rationale=str(entry.get("rationale", "")),
            )
        )

    if errors:
        return ValidateMappingResponse(valid=False, errors=errors)

    mapping_plan = MappingPlan(
        entries=valid_entries,
        template_type=body.template_type,
        language=body.language,
        warnings=[str(w) for w in raw_warnings],
    )

    logger.info(
        "Validated mapping plan: %d entries, %d warnings",
        len(valid_entries),
        len(raw_warnings),
    )

    return ValidateMappingResponse(valid=True, mapping_plan=mapping_plan)


def _validate_entry(
    entry: dict, index: int, paragraph_count: int
) -> list[str]:
    """Validate a single mapping entry, returning any errors found."""
    errors: list[str] = []
    prefix = f"Entry[{index}]"

    if not isinstance(entry, dict):
        return [f"{prefix}: must be a JSON object."]

    # section_index
    section_index = entry.get("section_index")
    if section_index is None:
        errors.append(f"{prefix}: missing 'section_index'.")
    else:
        try:
            idx = int(section_index)
            if idx < 0:
                errors.append(f"{prefix}: section_index ({idx}) must be >= 0.")
            if paragraph_count > 0 and idx >= paragraph_count:
                errors.append(
                    f"{prefix}: section_index ({idx}) out of range "
                    f"(max {paragraph_count - 1})."
                )
        except (TypeError, ValueError):
            errors.append(f"{prefix}: section_index must be an integer.")

    # gw_field
    gw_field = entry.get("gw_field")
    if not gw_field:
        errors.append(f"{prefix}: missing 'gw_field'.")
    elif str(gw_field) not in _VALID_GW_FIELDS:
        # Allow field paths that look like valid expressions
        # (LLM may generate field paths not in the static map)
        logger.warning("%s: unknown gw_field '%s'", prefix, gw_field)

    # marker_type
    marker_type = entry.get("marker_type")
    valid_markers = {"text", "paragraph_rt", "run_rt", "table_row_loop", "control_flow"}
    if marker_type and str(marker_type) not in valid_markers:
        errors.append(
            f"{prefix}: invalid marker_type '{marker_type}'. "
            f"Must be one of: {', '.join(sorted(valid_markers))}."
        )

    # Check marker_type matches expected for gw_field
    if gw_field and marker_type and str(gw_field) in FIELD_MARKER_MAP:
        expected = FIELD_MARKER_MAP[str(gw_field)]
        if str(marker_type) != expected:
            errors.append(
                f"{prefix}: marker_type '{marker_type}' does not match "
                f"expected '{expected}' for field '{gw_field}'."
            )

    # confidence
    confidence = entry.get("confidence")
    if confidence is not None:
        try:
            conf = float(confidence)
            if conf < 0 or conf > 1:
                errors.append(f"{prefix}: confidence ({conf}) must be between 0 and 1.")
        except (TypeError, ValueError):
            errors.append(f"{prefix}: confidence must be a number.")

    return errors
