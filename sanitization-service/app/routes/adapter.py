"""Template adapter API endpoints.

POST /analyze  -- Prepare analysis prompt from client DOCX (LLM call done by Node.js)
POST /validate-mapping -- Validate raw LLM JSON response into a MappingPlan
POST /validate-batch-mapping -- Validate batch mapping LLM response for interactive selections
POST /apply -- Apply instructions to a DOCX template (validate + enrich + apply)
POST /enrich -- Enrich an instruction set via rules engine (no DOCX modification)
POST /build-insertion-prompt -- Build LLM Pass 2 prompt from doc structure + mapping plan
POST /build-correction-prompt -- Build LLM correction prompt for placeholder corrections
POST /annotate -- Generate annotated DOCX preview with paragraph shading + metadata
POST /placeholder-preview -- Generate placeholder-styled DOCX preview with Jinja shading
POST /detect-blueprints -- Detect structural blueprints and style hints from mapping plan
"""
import base64
import json
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.adapter import (
    FIELD_MARKER_MAP,
    AnalyzeRequest,
    AnalyzeResponse,
    AnnotateRequest,
    AnnotateResponse,
    ApplyRequest,
    ApplyResponse,
    BatchMappingEntry,
    BatchMappingRequest,
    BatchMappingResponse,
    BlueprintResult,
    CorrectionPromptRequest,
    CorrectionPromptResponse,
    DetectBlueprintsRequest,
    DetectBlueprintsResponse,
    DocumentStructureRequest,
    DocumentStructureResponse,
    Instruction,
    InstructionSet,
    MappingEntry,
    MappingPlan,
    ParagraphInfo,
    PlaceholderPreviewRequest,
    PlaceholderPreviewResponse,
    StyleHintResult,
    ValidateMappingRequest,
    ValidateMappingResponse,
)
from app.services.annotated_preview import (
    apply_paragraph_shading,
    generate_annotation_metadata,
    generate_placeholder_preview,
)
from app.services.blueprint_detector import collect_style_hints, detect_blueprints
from app.services.gap_detector import detect_gaps
from app.models.docx import DocxStructure
from app.services.analysis_prompt import (
    build_analysis_prompt,
    build_analysis_system_prompt,
)
from app.services.docx_parser import DocxParserService
from app.services.correction_prompt import (
    build_correction_system_prompt,
    build_correction_user_prompt,
)
from app.services.insertion_prompt import (
    build_insertion_prompt,
    build_insertion_system_prompt,
)
from app.services.instruction_applier import InstructionApplier
from app.services.jinja2_validator import validate_instruction_set
from app.services.reference_loader import (
    get_reference_template_hash,
    load_reference_template,
)
from app.services.rules_engine import enrich_instructions

logger = logging.getLogger(__name__)

router = APIRouter()

_parser = DocxParserService()
_applier = InstructionApplier()

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
        doc_structure, reference_info, body.template_type, body.language,
        few_shot_examples=body.few_shot_examples,
    )

    # Get reference template hash
    ref_hash = get_reference_template_hash(body.template_type, body.language)

    # Count paragraphs (total for validation, non-empty for display)
    total_paragraphs = len(doc_structure.paragraphs)
    non_empty = sum(1 for p in doc_structure.paragraphs if p.text.strip())

    # Build doc structure summary
    doc_summary = {
        "paragraph_count": total_paragraphs,
        "non_empty_paragraphs": non_empty,
        "table_count": len(doc_structure.tables),
        "image_count": len(doc_structure.images),
        "styles": doc_structure.styles[:10],
    }

    logger.info(
        "Prepared analysis prompt: type=%s, lang=%s, paragraphs=%d/%d, prompt_len=%d, few_shot_examples=%d",
        body.template_type,
        body.language,
        non_empty,
        total_paragraphs,
        len(prompt),
        len(body.few_shot_examples),
    )

    return AnalyzeResponse(
        prompt=prompt,
        system_prompt=system_prompt,
        doc_structure_summary=doc_summary,
        reference_template_hash=ref_hash,
        paragraph_count=total_paragraphs,
    )


@router.post("/validate-mapping", response_model=ValidateMappingResponse)
async def validate_mapping(body: ValidateMappingRequest) -> ValidateMappingResponse:
    """Validate raw LLM JSON response into a structured MappingPlan.

    Parses the LLM response text as JSON, validates each entry's
    section_index, gw_field, and marker_type, and returns a validated
    MappingPlan or a list of errors.
    """
    errors: list[str] = []

    # Strip markdown code fences if present (LLMs often wrap JSON in ```json...```)
    llm_text = body.llm_response.strip()
    if llm_text.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = llm_text.index("\n") if "\n" in llm_text else len(llm_text)
        llm_text = llm_text[first_newline + 1:]
        # Remove closing fence
        if llm_text.rstrip().endswith("```"):
            llm_text = llm_text.rstrip()[:-3].rstrip()

    # Parse JSON
    try:
        raw = json.loads(llm_text)
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

    # Validate each entry -- hard errors (missing fields, bad types) reject the
    # entry; soft errors (out-of-range index) demote it to a warning so one
    # hallucinated index doesn't reject the entire plan.
    valid_entries: list[MappingEntry] = []
    warnings_from_validation: list[str] = []
    for i, entry in enumerate(raw_entries):
        entry_errors, entry_warnings = _validate_entry(entry, i, body.paragraph_count)
        if entry_errors:
            errors.extend(entry_errors)
            continue
        if entry_warnings:
            warnings_from_validation.extend(entry_warnings)
            continue  # skip this entry but don't fail the whole plan

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

    if not valid_entries:
        # No usable entries at all -- return all errors
        all_errors = errors + warnings_from_validation
        return ValidateMappingResponse(
            valid=False,
            errors=all_errors or ["No valid mapping entries found in LLM response."],
        )

    # Some entries had hard errors but we still have valid ones -- demote to warnings
    if errors:
        warnings_from_validation.extend(errors)

    # Merge LLM warnings with validation warnings
    all_warnings = [str(w) for w in raw_warnings] + warnings_from_validation

    mapping_plan = MappingPlan(
        entries=valid_entries,
        template_type=body.template_type,
        language=body.language,
        warnings=all_warnings,
    )

    logger.info(
        "Validated mapping plan: %d entries, %d warnings",
        len(valid_entries),
        len(raw_warnings),
    )

    return ValidateMappingResponse(valid=True, mapping_plan=mapping_plan)


def _validate_entry(
    entry: dict, index: int, paragraph_count: int
) -> tuple[list[str], list[str]]:
    """Validate a single mapping entry.

    Returns:
        (errors, warnings) -- errors are hard failures (missing fields, bad
        types); warnings are soft issues (out-of-range index) that cause the
        entry to be skipped but don't reject the whole plan.
    """
    errors: list[str] = []
    warnings: list[str] = []
    prefix = f"Entry[{index}]"

    if not isinstance(entry, dict):
        return [f"{prefix}: must be a JSON object."], []

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
                warnings.append(
                    f"{prefix}: section_index ({idx}) out of range "
                    f"(max {paragraph_count - 1}), entry skipped."
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

    return errors, warnings


# ---------------------------------------------------------------------------
# Plan 05-03 request models
# ---------------------------------------------------------------------------


class BuildInsertionPromptRequest(BaseModel):
    """Request body for POST /adapter/build-insertion-prompt."""

    template_base64: str = Field(..., description="Base64-encoded DOCX file")
    mapping_plan: MappingPlan


class BuildInsertionPromptResponse(BaseModel):
    """Response from POST /adapter/build-insertion-prompt."""

    prompt: str
    system_prompt: str


class EnrichRequest(BaseModel):
    """Request body for POST /adapter/enrich."""

    instruction_set: InstructionSet


class EnrichResponse(BaseModel):
    """Response from POST /adapter/enrich."""

    instruction_set: InstructionSet


# ---------------------------------------------------------------------------
# Plan 05-03 endpoints
# ---------------------------------------------------------------------------


@router.post("/apply", response_model=ApplyResponse)
async def apply_instructions(body: ApplyRequest) -> ApplyResponse:
    """Apply instructions to a DOCX template.

    Pipeline: validate -> enrich -> apply.
    Decodes the base64 template, validates the instruction set, enriches it
    via the rules engine, then applies modifications to produce a new DOCX.
    """
    # Decode base64 template
    try:
        template_bytes = base64.b64decode(body.template_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="template_base64 is not valid base64.")

    if len(template_bytes) == 0:
        raise HTTPException(status_code=400, detail="Decoded template is empty.")

    if template_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=400,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    # Validate instruction set
    validation = validate_instruction_set(body.instruction_set)
    if not validation.valid:
        logger.warning("Instruction validation failed: %s", validation.errors)
        # Use sanitized instructions (valid subset) if available
        if validation.sanitized_instructions and validation.sanitized_instructions.instructions:
            instruction_set = validation.sanitized_instructions
        else:
            raise HTTPException(
                status_code=422,
                detail=f"Instruction validation failed: {'; '.join(validation.errors)}",
            )
    else:
        instruction_set = validation.sanitized_instructions or body.instruction_set

    # Enrich instructions via rules engine
    enriched = enrich_instructions(instruction_set)

    # Apply instructions to DOCX
    try:
        output_bytes, applied_count, skipped_count, warnings = _applier.apply(
            template_bytes, enriched
        )
    except Exception as exc:
        logger.error("Instruction application failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply instructions: {exc}",
        )

    output_base64 = base64.b64encode(output_bytes).decode("ascii")

    logger.info(
        "Applied instructions: applied=%d, skipped=%d, warnings=%d",
        applied_count,
        skipped_count,
        len(warnings),
    )

    return ApplyResponse(
        output_base64=output_base64,
        applied_count=applied_count,
        skipped_count=skipped_count,
        warnings=warnings,
    )


@router.post("/enrich", response_model=EnrichResponse)
async def enrich_instruction_set(body: EnrichRequest) -> EnrichResponse:
    """Enrich an instruction set via the rules engine.

    Applies marker rewriting and template-type-specific feature injection
    without modifying any DOCX file.
    """
    try:
        enriched = enrich_instructions(body.instruction_set)
    except Exception as exc:
        logger.error("Instruction enrichment failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enrich instructions: {exc}",
        )

    return EnrichResponse(instruction_set=enriched)


@router.post("/build-insertion-prompt", response_model=BuildInsertionPromptResponse)
async def build_insertion_prompt_endpoint(
    body: BuildInsertionPromptRequest,
) -> BuildInsertionPromptResponse:
    """Build the LLM Pass 2 prompt for generating insertion instructions.

    Decodes the base64 template, parses its DOCX structure, and combines it
    with the approved mapping plan to produce LLM prompts for InstructionSet JSON.
    """
    # Decode and parse DOCX
    try:
        template_bytes = base64.b64decode(body.template_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="template_base64 is not valid base64.")

    if len(template_bytes) == 0:
        raise HTTPException(status_code=400, detail="Decoded template is empty.")

    if template_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=400,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    try:
        doc_structure = _parser.parse(template_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse DOCX: {exc}")

    try:
        system_prompt = build_insertion_system_prompt()
        prompt = build_insertion_prompt(doc_structure, body.mapping_plan)
    except Exception as exc:
        logger.error("Insertion prompt build failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build insertion prompt: {exc}",
        )

    return BuildInsertionPromptResponse(
        prompt=prompt,
        system_prompt=system_prompt,
    )


# ---------------------------------------------------------------------------
# Plan 05.3-04 endpoint
# ---------------------------------------------------------------------------


@router.post("/build-correction-prompt", response_model=CorrectionPromptResponse)
async def build_correction_prompt_endpoint(
    body: CorrectionPromptRequest,
) -> CorrectionPromptResponse:
    """Build the LLM correction prompt for placeholder corrections.

    Decodes the base64 template, parses its DOCX structure for paragraph
    context, and combines it with the current mapping plan and user
    corrections to produce LLM prompts for a corrected mapping plan.
    Follows the same pattern as /build-insertion-prompt.
    """
    # Decode and parse DOCX for paragraph context
    try:
        template_bytes = base64.b64decode(body.template_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="template_base64 is not valid base64.")

    if len(template_bytes) == 0:
        raise HTTPException(status_code=400, detail="Decoded template is empty.")

    if template_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=400,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    # Parse DOCX for paragraph context around selections
    doc_paragraphs: list[dict] = []
    try:
        doc_structure = _parser.parse(template_bytes)
        doc_paragraphs = [
            {
                "paragraph_index": i,
                "text": para.text.strip()[:200],
            }
            for i, para in enumerate(doc_structure.paragraphs)
            if para.text.strip()
        ]
    except Exception as exc:
        logger.warning("Could not parse DOCX for correction context: %s", exc)
        # Non-fatal: proceed without paragraph context

    # Convert mapping plan to dict for the prompt builder
    mapping_plan_dict = body.current_mapping_plan.model_dump()

    # Convert selections to list of dicts
    selections_list = [
        {
            "selection_number": sel.selection_number,
            "text": sel.text,
            "paragraph_index": sel.paragraph_index,
        }
        for sel in body.selections
    ]

    try:
        system_prompt = build_correction_system_prompt()
        prompt = build_correction_user_prompt(
            current_mapping_plan=mapping_plan_dict,
            user_corrections=body.user_corrections,
            selections=selections_list if selections_list else None,
            doc_paragraphs=doc_paragraphs if doc_paragraphs else None,
        )
    except Exception as exc:
        logger.error("Correction prompt build failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build correction prompt: {exc}",
        )

    logger.info(
        "Built correction prompt: %d selections, prompt_len=%d",
        len(body.selections),
        len(prompt),
    )

    return CorrectionPromptResponse(
        prompt=prompt,
        system_prompt=system_prompt,
    )


# ---------------------------------------------------------------------------
# Plan 05.2-02 endpoint
# ---------------------------------------------------------------------------


@router.post("/document-structure", response_model=DocumentStructureResponse)
async def get_document_structure(body: DocumentStructureRequest) -> DocumentStructureResponse:
    """Parse a DOCX and return a flat list of all paragraphs with metadata.

    Includes empty and whitespace-only paragraphs so the frontend sidebar
    can display items not visible in the PDF render.
    """
    # Decode base64 template
    try:
        template_bytes = base64.b64decode(body.template_base64)
    except Exception:
        raise HTTPException(status_code=422, detail="template_base64 is not valid base64.")

    if len(template_bytes) == 0:
        raise HTTPException(status_code=422, detail="Decoded template is empty.")

    # Validate DOCX magic bytes
    if template_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=422,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    # Parse DOCX
    try:
        doc_structure = _parser.parse(template_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse DOCX: {exc}")
    except Exception as exc:
        logger.error("DOCX parse failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error while parsing DOCX.")

    # Build paragraph list
    paragraphs: list[ParagraphInfo] = []
    empty_count = 0

    for idx, para in enumerate(doc_structure.paragraphs):
        is_empty = not para.text.strip()
        if is_empty:
            empty_count += 1

        paragraphs.append(
            ParagraphInfo(
                paragraph_index=idx,
                text=para.text[:200],
                heading_level=para.heading_level,
                is_empty=is_empty,
                style_name=para.style_name,
            )
        )

    logger.info(
        "Document structure: %d total paragraphs, %d empty",
        len(paragraphs),
        empty_count,
    )

    return DocumentStructureResponse(
        paragraphs=paragraphs,
        total_count=len(paragraphs),
        empty_count=empty_count,
    )


# ---------------------------------------------------------------------------
# Plan 05.2-03 endpoint
# ---------------------------------------------------------------------------


@router.post("/validate-batch-mapping", response_model=BatchMappingResponse)
async def validate_batch_mapping(body: BatchMappingRequest) -> BatchMappingResponse:
    """Validate LLM JSON response for batch mapping of interactive selections.

    Parses the LLM response text as a JSON array, validates each entry's
    selectionNumber against the input selections, checks gwField validity,
    and returns validated mappings or errors.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Build lookup of valid selection numbers
    valid_selection_numbers: set[int] = {s.selection_number for s in body.selections}

    # Strip markdown code fences if present
    llm_text = body.llm_response.strip()
    if llm_text.startswith("```"):
        first_newline = llm_text.index("\n") if "\n" in llm_text else len(llm_text)
        llm_text = llm_text[first_newline + 1:]
        if llm_text.rstrip().endswith("```"):
            llm_text = llm_text.rstrip()[:-3].rstrip()

    # Parse JSON
    try:
        raw = json.loads(llm_text)
    except json.JSONDecodeError as exc:
        return BatchMappingResponse(
            valid=False,
            errors=[f"Invalid JSON from LLM: {exc}"],
        )

    # Normalize: accept both array and object with entries/mappings key
    if isinstance(raw, dict):
        raw_entries = raw.get("mappings", raw.get("entries", []))
        if not isinstance(raw_entries, list):
            return BatchMappingResponse(
                valid=False,
                errors=["LLM response must be a JSON array or object with 'mappings' array."],
            )
    elif isinstance(raw, list):
        raw_entries = raw
    else:
        return BatchMappingResponse(
            valid=False,
            errors=["LLM response must be a JSON array."],
        )

    # Validate each entry
    valid_entries: list[BatchMappingEntry] = []
    resolved_numbers: set[int] = set()

    for i, entry in enumerate(raw_entries):
        prefix = f"Entry[{i}]"

        if not isinstance(entry, dict):
            errors.append(f"{prefix}: must be a JSON object.")
            continue

        # selectionNumber (accept camelCase or snake_case)
        sel_num = entry.get("selectionNumber", entry.get("selection_number"))
        if sel_num is None:
            errors.append(f"{prefix}: missing 'selectionNumber'.")
            continue

        try:
            sel_num = int(sel_num)
        except (TypeError, ValueError):
            errors.append(f"{prefix}: selectionNumber must be an integer.")
            continue

        if sel_num not in valid_selection_numbers:
            errors.append(
                f"{prefix}: selectionNumber {sel_num} does not match any input selection."
            )
            continue

        # gwField (accept camelCase or snake_case)
        gw_field = entry.get("gwField", entry.get("gw_field", ""))
        if not gw_field:
            errors.append(f"{prefix}: missing 'gwField'.")
            continue

        gw_field = str(gw_field)

        # Warn if unknown field (not an error)
        if gw_field not in _VALID_GW_FIELDS:
            warnings.append(f"{prefix}: unknown gwField '{gw_field}'.")

        # markerType (accept camelCase or snake_case)
        marker_type = entry.get("markerType", entry.get("marker_type", "text"))
        marker_type = str(marker_type)
        valid_markers = {"text", "paragraph_rt", "run_rt", "table_row_loop", "control_flow"}
        if marker_type not in valid_markers:
            errors.append(
                f"{prefix}: invalid markerType '{marker_type}'. "
                f"Must be one of: {', '.join(sorted(valid_markers))}."
            )
            continue

        # confidence
        confidence = entry.get("confidence", 0.5)
        try:
            confidence = float(confidence)
            confidence = max(0.0, min(1.0, confidence))
        except (TypeError, ValueError):
            confidence = 0.5

        # rationale
        rationale = str(entry.get("rationale", ""))

        valid_entries.append(
            BatchMappingEntry(
                selection_number=sel_num,
                gw_field=gw_field,
                marker_type=marker_type,
                confidence=confidence,
                rationale=rationale,
            )
        )
        resolved_numbers.add(sel_num)

    # Check for unresolved selections
    unresolved = valid_selection_numbers - resolved_numbers
    if unresolved:
        sorted_nums = sorted(unresolved)
        errors.append(
            f"Unresolved selections: {', '.join(f'#{n}' for n in sorted_nums)}"
        )

    # Determine overall validity
    is_valid = len(valid_entries) > 0 and len(errors) == 0

    logger.info(
        "Validated batch mapping: %d entries, %d errors, %d warnings",
        len(valid_entries),
        len(errors),
        len(warnings),
    )

    return BatchMappingResponse(
        valid=is_valid,
        mappings=valid_entries,
        errors=errors,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Plan 05.1-02 endpoint
# ---------------------------------------------------------------------------


@router.post("/annotate", response_model=AnnotateResponse)
async def annotate_template(body: AnnotateRequest) -> AnnotateResponse:
    """Generate an annotated DOCX preview with paragraph shading and metadata.

    Decodes the base64 template, runs gap detection against the reference
    template, applies green (mapped) and yellow (gap) paragraph shading,
    and returns the annotated DOCX plus tooltip and unmapped-paragraph metadata.
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

    # Run gap detection
    try:
        gap_result = detect_gaps(
            body.mapping_plan,
            body.mapping_plan.template_type,
            body.mapping_plan.language,
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=f"Gap detection failed: {exc}")
    except Exception as exc:
        logger.error("Gap detection failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error during gap detection.")

    # Apply paragraph shading
    try:
        annotated_bytes = apply_paragraph_shading(
            template_bytes, body.mapping_plan, gap_result.gaps,
            green_only=body.green_only,
        )
    except Exception as exc:
        logger.error("Paragraph shading failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply paragraph shading: {exc}",
        )

    # Generate annotation metadata (tooltips + unmapped paragraphs)
    try:
        metadata = generate_annotation_metadata(
            template_bytes, body.mapping_plan, gap_result.gaps
        )
    except Exception as exc:
        logger.error("Annotation metadata generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate annotation metadata: {exc}",
        )

    annotated_base64 = base64.b64encode(annotated_bytes).decode("ascii")

    logger.info(
        "Annotated template: %d tooltips, %d unmapped, %.1f%% coverage",
        len(metadata.tooltip_data),
        len(metadata.unmapped_paragraphs),
        gap_result.coverage_percent,
    )

    return AnnotateResponse(
        annotated_base64=annotated_base64,
        tooltip_data=[t.model_dump() for t in metadata.tooltip_data],
        unmapped_paragraphs=[u.model_dump() for u in metadata.unmapped_paragraphs],
        gap_summary=gap_result.model_dump(),
    )


# ---------------------------------------------------------------------------
# Plan 05.3-01 endpoint
# ---------------------------------------------------------------------------


@router.post("/placeholder-preview", response_model=PlaceholderPreviewResponse)
async def placeholder_preview(body: PlaceholderPreviewRequest) -> PlaceholderPreviewResponse:
    """Generate a placeholder-styled preview of an adapted DOCX.

    Decodes the base64 adapted DOCX (which contains Jinja2 placeholders
    from the auto-map insertion pass), scans for ``{{ ... }}`` expressions,
    applies light blue background shading to paragraphs containing them,
    and returns the annotated DOCX plus placeholder metadata.
    """
    # Decode base64 adapted DOCX
    try:
        doc_bytes = base64.b64decode(body.adapted_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="adapted_base64 is not valid base64.")

    if len(doc_bytes) == 0:
        raise HTTPException(status_code=400, detail="Decoded document is empty.")

    # Validate DOCX magic bytes
    if doc_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=400,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    # Generate placeholder preview
    try:
        annotated_bytes, placeholders = generate_placeholder_preview(doc_bytes)
    except Exception as exc:
        logger.error("Placeholder preview generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate placeholder preview: {exc}",
        )

    annotated_base64 = base64.b64encode(annotated_bytes).decode("ascii")

    logger.info(
        "Placeholder preview: %d placeholders found",
        len(placeholders),
    )

    return PlaceholderPreviewResponse(
        annotated_base64=annotated_base64,
        placeholders=placeholders,
        placeholder_count=len(placeholders),
    )


# ---------------------------------------------------------------------------
# Deterministic apply-from-mapping (bypasses LLM Pass 2)
# ---------------------------------------------------------------------------


class ApplyFromMappingRequest(BaseModel):
    """Request body for POST /adapter/apply-from-mapping."""

    template_base64: str = Field(..., description="Base64-encoded original DOCX")
    mapping_plan: MappingPlan


@router.post("/apply-from-mapping", response_model=ApplyResponse)
async def apply_from_mapping(body: ApplyFromMappingRequest) -> ApplyResponse:
    """Deterministically apply a mapping plan to a DOCX without an LLM call.

    Converts each MappingEntry into an Instruction by reading the actual
    paragraph text from the DOCX, then applies via InstructionApplier.
    Used for correction-chat regeneration where the mapping plan has already
    been updated by the LLM and we just need to re-apply.
    """
    # Decode base64 template
    try:
        template_bytes = base64.b64decode(body.template_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="template_base64 is not valid base64.")

    if len(template_bytes) == 0:
        raise HTTPException(status_code=400, detail="Decoded template is empty.")

    if template_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=400,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    # Parse DOCX to get actual paragraph texts
    try:
        doc_structure = _parser.parse(template_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse DOCX: {exc}")

    paragraphs = doc_structure.paragraphs
    instructions: list[Instruction] = []
    build_warnings: list[str] = []

    for entry in body.mapping_plan.entries:
        idx = entry.section_index

        if idx < 0 or idx >= len(paragraphs):
            build_warnings.append(
                f"section_index {idx} out of range (0-{len(paragraphs)-1}), skipped"
            )
            continue

        para_text = paragraphs[idx].text

        if entry.marker_type == "table_row_loop":
            # Wrap table row with loop markers
            instructions.append(Instruction(
                action="wrap_table_row",
                paragraph_index=idx,
                original_text=entry.section_text,
                replacement_text=entry.placeholder_template,
                marker_type=entry.marker_type,
                gw_field=entry.gw_field,
            ))
        elif entry.marker_type == "paragraph_rt":
            # Replace entire paragraph content with the placeholder
            instructions.append(Instruction(
                action="replace_text",
                paragraph_index=idx,
                original_text=para_text,
                replacement_text=entry.placeholder_template,
                marker_type=entry.marker_type,
                gw_field=entry.gw_field,
            ))
        else:
            # text, run_rt, control_flow: find section_text in paragraph
            original = entry.section_text
            if original and original in para_text:
                instructions.append(Instruction(
                    action="replace_text",
                    paragraph_index=idx,
                    original_text=original,
                    replacement_text=entry.placeholder_template,
                    marker_type=entry.marker_type,
                    gw_field=entry.gw_field,
                ))
            elif para_text.strip():
                # Fallback: section_text was truncated or doesn't match exactly.
                # Replace the full paragraph text.
                instructions.append(Instruction(
                    action="replace_text",
                    paragraph_index=idx,
                    original_text=para_text,
                    replacement_text=entry.placeholder_template,
                    marker_type=entry.marker_type,
                    gw_field=entry.gw_field,
                ))
                build_warnings.append(
                    f"section_text not found at paragraph {idx}, "
                    f"falling back to full paragraph replacement for {entry.gw_field}"
                )
            else:
                # Empty paragraph — use insert_after
                instructions.append(Instruction(
                    action="insert_after",
                    paragraph_index=max(0, idx - 1),
                    original_text="",
                    replacement_text=entry.placeholder_template,
                    marker_type=entry.marker_type,
                    gw_field=entry.gw_field,
                ))
                build_warnings.append(
                    f"Empty paragraph at {idx}, inserting placeholder for {entry.gw_field}"
                )

    instruction_set = InstructionSet(
        instructions=instructions,
        template_type=body.mapping_plan.template_type,
        language=body.mapping_plan.language,
    )

    # Enrich via rules engine
    enriched = enrich_instructions(instruction_set)

    # Apply to DOCX
    try:
        output_bytes, applied_count, skipped_count, apply_warnings = _applier.apply(
            template_bytes, enriched
        )
    except Exception as exc:
        logger.error("Mapping plan application failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply mapping plan: {exc}",
        )

    output_base64 = base64.b64encode(output_bytes).decode("ascii")
    all_warnings = build_warnings + apply_warnings

    logger.info(
        "Applied mapping plan directly: %d entries -> %d instructions, applied=%d, skipped=%d",
        len(body.mapping_plan.entries),
        len(instructions),
        applied_count,
        skipped_count,
    )

    return ApplyResponse(
        output_base64=output_base64,
        applied_count=applied_count,
        skipped_count=skipped_count,
        warnings=all_warnings,
    )


# ---------------------------------------------------------------------------
# Plan 05.4-02 endpoint
# ---------------------------------------------------------------------------


@router.post("/detect-blueprints", response_model=DetectBlueprintsResponse)
async def detect_blueprints_endpoint(
    body: DetectBlueprintsRequest,
) -> DetectBlueprintsResponse:
    """Detect structural blueprints and style hints from a mapping plan.

    Decodes the base64 template, parses the DOCX with zone tagging, then
    runs heuristic blueprint detection and style hint collection. Returns
    both results for KB storage by the Node.js backend.
    """
    # Decode base64 template
    try:
        template_bytes = base64.b64decode(body.template_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="template_base64 is not valid base64.")

    if len(template_bytes) == 0:
        raise HTTPException(status_code=400, detail="Decoded template is empty.")

    if template_bytes[:4] != _DOCX_MAGIC:
        raise HTTPException(
            status_code=400,
            detail="Decoded content is not a valid DOCX file (bad magic bytes).",
        )

    # Parse DOCX (zone-tagged)
    try:
        doc_structure = _parser.parse(template_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse DOCX: {exc}")
    except Exception as exc:
        logger.error("DOCX parse failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error while parsing DOCX.")

    # Detect blueprints
    try:
        raw_blueprints = detect_blueprints(body.mapping_plan, doc_structure)
    except Exception as exc:
        logger.error("Blueprint detection failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to detect blueprints: {exc}",
        )

    # Collect style hints
    try:
        raw_hints = collect_style_hints(doc_structure, body.mapping_plan)
    except Exception as exc:
        logger.error("Style hint collection failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to collect style hints: {exc}",
        )

    # Convert to response models
    blueprints = [
        BlueprintResult(
            template_type=bp["templateType"],
            zone=bp["zone"],
            pattern_type=bp["patternType"],
            markers=bp["markers"],
            anchor_style=bp.get("anchorStyle"),
        )
        for bp in raw_blueprints
    ]

    style_hints = [
        StyleHintResult(
            template_type=sh["templateType"],
            style_name=sh["styleName"],
            zone=sh["zone"],
            mapped_count=sh["mappedCount"],
            skipped_count=sh["skippedCount"],
        )
        for sh in raw_hints
    ]

    logger.info(
        "Blueprint detection: %d blueprints, %d style hints for type=%s",
        len(blueprints),
        len(style_hints),
        body.template_type,
    )

    return DetectBlueprintsResponse(
        blueprints=blueprints,
        style_hints=style_hints,
    )
