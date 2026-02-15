"""Pydantic models for the template adapter feature (analysis + instruction).

All adapter models are defined here so Plan 05-01 (analysis) and Plan 05-02
(instruction/application) can run in parallel without file conflicts.
"""
from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------

TemplateType = Literal["web", "internal", "mobile"]
TemplateLanguage = Literal["en", "pt-pt"]

# ---------------------------------------------------------------------------
# Analysis models (used by Plan 05-01)
# ---------------------------------------------------------------------------


class Jinja2Pattern(BaseModel):
    """A single Jinja2 placeholder extracted from a reference template."""

    pattern: str = Field(..., description="The raw Jinja2 expression as it appears in the template")
    marker_type: Literal["text", "paragraph_rt", "run_rt", "table_row_loop", "control_flow"] = Field(
        ..., description="Category of Jinja2 marker"
    )
    gw_field: str = Field(
        ..., description="Target GW field path, e.g. 'client.short_name'"
    )
    context: str = Field(
        "", description="Surrounding paragraph text for LLM reference"
    )


class ReferenceTemplateInfo(BaseModel):
    """Metadata and extracted patterns from a loaded reference template."""

    template_type: TemplateType
    language: TemplateLanguage
    filename: str
    patterns: list[Jinja2Pattern] = Field(default_factory=list)
    placeholder_count: int = 0


class MappingEntry(BaseModel):
    """A single mapping between a client document section and a GW field."""

    section_index: int = Field(..., description="Paragraph index in the client document")
    section_text: str = Field(..., description="First 100 chars of the paragraph text")
    gw_field: str = Field(..., description="Target GW field path")
    placeholder_template: str = Field(
        ..., description="The Jinja2 expression to insert, e.g. '{{ client.short_name }}'"
    )
    confidence: float = Field(..., ge=0, le=1, description="Confidence score 0-1")
    marker_type: str = Field(..., description="Marker type for this field")
    rationale: str = Field("", description="LLM reasoning for this mapping")


class MappingPlan(BaseModel):
    """Complete mapping plan produced by LLM analysis (Pass 1)."""

    entries: list[MappingEntry] = Field(default_factory=list)
    template_type: TemplateType
    language: TemplateLanguage
    warnings: list[str] = Field(default_factory=list)


class FewShotExample(BaseModel):
    """A previous confirmed mapping used as a few-shot example for LLM analysis."""

    normalized_section_text: str = Field(
        ..., description="Lowercase, whitespace-collapsed section text"
    )
    gw_field: str = Field(..., description="Target GW field path")
    marker_type: str = Field(
        ..., description="Marker type: text|paragraph_rt|run_rt|table_row_loop|control_flow"
    )
    usage_count: int = Field(..., description="How many times this mapping was confirmed")


class AnalyzeRequest(BaseModel):
    """Request body for POST /adapter/analyze."""

    template_base64: str = Field(..., description="Base64-encoded client DOCX template")
    template_type: TemplateType
    language: TemplateLanguage
    few_shot_examples: list[FewShotExample] = Field(
        default_factory=list,
        description="Previous confirmed mappings for few-shot learning",
    )
    kb_context: "KBContext | None" = Field(
        None,
        description="Enriched KB context with zone-grouped mappings, blueprints, and style hints",
    )
    locked_sections: list["LockedSection"] = Field(
        default_factory=list,
        description="Sections resolved from the prescriptive KB (no LLM analysis needed)",
    )
    unknown_sections: list["UnknownSection"] = Field(
        default_factory=list,
        description="Sections that need LLM analysis (not found in KB)",
    )


class AnalyzeResponse(BaseModel):
    """Response from POST /adapter/analyze -- prepared prompt and metadata.

    The Python service does NOT call the LLM. It returns the prompt so the
    Node.js backend can call the LLM and send the response back for validation.
    """

    prompt: str = Field(..., description="The analysis prompt to send to the LLM")
    system_prompt: str = Field(..., description="System prompt for the LLM")
    doc_structure_summary: dict = Field(
        default_factory=dict, description="Condensed summary of parsed client DOCX"
    )
    reference_template_hash: str = Field(
        ..., description="SHA-256 hash of the reference template file"
    )
    paragraph_count: int = Field(0, description="Number of non-empty paragraphs in client doc")


class ValidateMappingRequest(BaseModel):
    """Request body for POST /adapter/validate-mapping."""

    llm_response: str = Field(..., description="Raw JSON text from LLM response")
    template_type: TemplateType
    language: TemplateLanguage
    paragraph_count: int = Field(..., description="Total paragraphs in client doc for bounds checking")


class ValidateMappingResponse(BaseModel):
    """Response from POST /adapter/validate-mapping."""

    valid: bool
    mapping_plan: MappingPlan | None = None
    errors: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Instruction models (consumed by Plan 05-02)
# ---------------------------------------------------------------------------

InstructionAction = Literal["replace_text", "insert_before", "insert_after", "wrap_table_row"]


class Instruction(BaseModel):
    """A single document modification instruction."""

    action: InstructionAction
    paragraph_index: int
    original_text: str
    replacement_text: str
    marker_type: str
    gw_field: str


class InstructionSet(BaseModel):
    """Complete set of instructions for transforming a client template."""

    instructions: list[Instruction] = Field(default_factory=list)
    template_type: TemplateType
    language: TemplateLanguage
    additional_blocks: list[str] = Field(default_factory=list)


class ApplyRequest(BaseModel):
    """Request body for POST /adapter/apply."""

    template_base64: str
    instruction_set: InstructionSet


class ApplyResponse(BaseModel):
    """Response from POST /adapter/apply."""

    output_base64: str
    applied_count: int
    skipped_count: int
    warnings: list[str] = Field(default_factory=list)


class ValidationResult(BaseModel):
    """Result of validating an instruction set."""

    valid: bool
    errors: list[str] = Field(default_factory=list)
    sanitized_instructions: InstructionSet | None = None


# ---------------------------------------------------------------------------
# Constants (consumed by Plan 05-02)
# ---------------------------------------------------------------------------

FIELD_MARKER_MAP: dict[str, str] = {
    # Simple text fields
    "client.short_name": "text",
    "project.start_date": "text",
    "project.end_date": "text",
    "project.codename": "text",
    "report_date": "text",
    "title": "text",
    "team[0].name": "text",
    "team[0].email": "text",
    "finding.title": "text",
    "finding['title']": "text",
    "totals.findings": "text",
    "item.scope": "text",
    "finding.cvss_score": "text",
    "finding.classification_rt": "text",
    "finding.affected_entities_rt": "run_rt",
    "finding.cvss_vector_link_rt": "run_rt",
    # Rich text paragraph fields
    "finding.description_rt": "paragraph_rt",
    "finding.impact_rt": "paragraph_rt",
    "finding.recommendation_rt": "paragraph_rt",
    "finding.replication_steps_rt": "paragraph_rt",
    # Rich text run fields
    "finding.severity_rt": "run_rt",
    # Loop counter expressions
    "'%02d' % loop.index": "text",
    "\"%02d\"|format(ns.counter + 1)": "text",
    "\"%02d\"|format(ns1.counter)": "text",
    # Namespace operations
    "ns.counter": "text",
    "ns1.counter": "text",
}

TEMPLATE_TYPE_FEATURES: dict[str, list[str]] = {
    "internal": ["filter_type", "namespace_counters"],
    "web": ["scope_loops", "affected_entities"],
    "mobile": ["scope_loops", "affected_entities"],
}


# ---------------------------------------------------------------------------
# Annotated preview models (consumed by Plan 05.1-02)
# ---------------------------------------------------------------------------


class DocumentStructureRequest(BaseModel):
    """Request body for POST /adapter/document-structure."""

    template_base64: str = Field(..., description="Base64-encoded client DOCX template")


class ParagraphInfo(BaseModel):
    """Metadata for a single paragraph in the document structure listing."""

    paragraph_index: int = Field(..., description="Zero-based index in the document body")
    text: str = Field(..., description="Paragraph text, truncated to 200 chars")
    heading_level: int | None = Field(None, description="Heading level 1-9 or None")
    is_empty: bool = Field(..., description="True if text.strip() is empty")
    style_name: str | None = Field(None, description="Paragraph style name")


class HeaderFooterParagraphInfo(BaseModel):
    """Metadata for a header or footer paragraph."""

    text: str = Field(..., description="Paragraph text, truncated to 200 chars")
    location: str = Field(..., description="'header' or 'footer'")
    section_index: int = Field(..., description="DOCX section index (0-based)")
    paragraph_index: int = Field(..., description="Index within the header/footer")
    style_name: str | None = Field(None, description="Paragraph style name")


class DocumentStructureResponse(BaseModel):
    """Response from POST /adapter/document-structure."""

    paragraphs: list[ParagraphInfo] = Field(default_factory=list)
    header_footer_paragraphs: list[HeaderFooterParagraphInfo] = Field(default_factory=list)
    total_count: int = Field(0, description="Total number of body paragraphs")
    empty_count: int = Field(0, description="Number of empty/whitespace-only paragraphs")


class AnnotateRequest(BaseModel):
    """Request body for POST /adapter/annotate."""

    template_base64: str = Field(..., description="Base64-encoded client DOCX template")
    mapping_plan: MappingPlan
    green_only: bool = Field(
        False,
        description="When true, only apply green shading to mapped paragraphs (skip yellow gaps)",
    )


class AnnotateResponse(BaseModel):
    """Response from POST /adapter/annotate."""

    annotated_base64: str = Field(..., description="Base64-encoded annotated DOCX with shading")
    tooltip_data: list[dict] = Field(
        default_factory=list,
        description="Tooltip metadata for each annotated paragraph",
    )
    unmapped_paragraphs: list[dict] = Field(
        default_factory=list,
        description="Paragraphs not in mapping plan or gap list",
    )
    gap_summary: dict = Field(
        default_factory=dict,
        description="Gap detection summary with counts and coverage",
    )


# ---------------------------------------------------------------------------
# Batch mapping models (consumed by Plan 05.2-03)
# ---------------------------------------------------------------------------


class BatchSelectionInput(BaseModel):
    """A single user-selected text passage for batch mapping."""

    selection_number: int = Field(..., description="The #N reference number")
    text: str = Field(..., description="Selected text content")
    paragraph_index: int = Field(..., description="Paragraph index in the document")


class BatchMappingRequest(BaseModel):
    """Request body for POST /adapter/validate-batch-mapping."""

    llm_response: str = Field(..., description="Raw JSON text from LLM response")
    selections: list[BatchSelectionInput] = Field(
        ..., description="The original selections sent to the LLM"
    )
    template_type: TemplateType
    language: TemplateLanguage


class BatchMappingEntry(BaseModel):
    """A single resolved mapping from the LLM batch mapping response."""

    selection_number: int = Field(..., description="The #N reference number")
    gw_field: str = Field(..., description="Target GW field path")
    marker_type: str = Field(..., description="Marker type for this field")
    confidence: float = Field(..., ge=0, le=1, description="Confidence score 0-1")
    rationale: str = Field("", description="LLM reasoning for this mapping")


class BatchMappingResponse(BaseModel):
    """Response from POST /adapter/validate-batch-mapping."""

    valid: bool
    mappings: list[BatchMappingEntry] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Placeholder preview models (consumed by Plan 05.3-01)
# ---------------------------------------------------------------------------


class PlaceholderPreviewRequest(BaseModel):
    """Request body for POST /adapter/placeholder-preview."""

    adapted_base64: str = Field(..., description="Base64-encoded DOCX with Jinja placeholders inserted")
    template_type: TemplateType
    language: TemplateLanguage


class PlaceholderInfo(BaseModel):
    """Metadata for a single detected Jinja2 placeholder."""

    paragraph_index: int = Field(..., description="Zero-based paragraph index in the document")
    placeholder_text: str = Field(..., description="The full Jinja2 expression, e.g. '{{ client.short_name }}'")
    gw_field: str = Field(..., description="Extracted field path, e.g. 'client.short_name'")


class PlaceholderPreviewResponse(BaseModel):
    """Response from POST /adapter/placeholder-preview."""

    annotated_base64: str = Field(..., description="Base64-encoded DOCX with light blue placeholder shading")
    placeholders: list[PlaceholderInfo] = Field(default_factory=list)
    placeholder_count: int = Field(0, description="Total number of placeholders found")


# ---------------------------------------------------------------------------
# Correction models (consumed by Plan 05.3-04)
# ---------------------------------------------------------------------------


class CorrectionSelection(BaseModel):
    """A single numbered text selection from the placeholder PDF."""

    selection_number: int = Field(..., description="The #N reference number")
    text: str = Field(..., description="Selected text content")
    paragraph_index: int = Field(..., description="Paragraph index in the document")


class CorrectionPromptRequest(BaseModel):
    """Request body for POST /adapter/build-correction-prompt."""

    template_base64: str = Field(..., description="Base64-encoded client DOCX template")
    current_mapping_plan: MappingPlan
    user_corrections: str = Field(..., description="User's correction description")
    selections: list[CorrectionSelection] = Field(default_factory=list)


class CorrectionPromptResponse(BaseModel):
    """Response from POST /adapter/build-correction-prompt."""

    prompt: str = Field(..., description="User prompt for the LLM")
    system_prompt: str = Field(..., description="System prompt for the LLM")


# ---------------------------------------------------------------------------
# Blueprint detection models (consumed by Plan 05.4-02)
# ---------------------------------------------------------------------------


class DetectBlueprintsRequest(BaseModel):
    """Request body for POST /adapter/detect-blueprints."""

    template_base64: str = Field(..., description="Base64-encoded client DOCX template")
    mapping_plan: MappingPlan
    template_type: TemplateType
    language: TemplateLanguage


class BlueprintResult(BaseModel):
    """A single detected blueprint pattern."""

    template_type: str
    zone: str
    pattern_type: str
    markers: list[dict]
    anchor_style: str | None = None


class StyleHintResult(BaseModel):
    """Style-to-mappability hint for a single (style, zone) combination."""

    template_type: str
    style_name: str
    zone: str
    mapped_count: int
    skipped_count: int


class DetectBlueprintsResponse(BaseModel):
    """Response from POST /adapter/detect-blueprints."""

    blueprints: list[BlueprintResult] = Field(default_factory=list)
    style_hints: list[StyleHintResult] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Structured KB context models (consumed by Plan 05.4-03)
# ---------------------------------------------------------------------------


class KBContextMapping(BaseModel):
    """A single zone-grouped KB mapping entry for the structured prompt."""

    normalized_section_text: str
    gw_field: str
    marker_type: str
    confidence: float
    zone: str = "unknown"
    zone_repetition_count: int = 1


class BlueprintContext(BaseModel):
    """A blueprint pattern for inclusion in the structured prompt."""

    zone: str
    pattern_type: str
    markers: list[dict]
    anchor_style: str | None = None


class KBContext(BaseModel):
    """Enriched KB context payload sent from the backend to the prompt builder.

    Contains zone-grouped mappings, blueprint patterns, boilerplate style
    names to filter, and repetition summary data. Cross-type fallback has been
    removed from the backend (Phase 5.6). The is_cross_type_fallback field is
    retained temporarily for backward compatibility.
    """

    zone_mappings: dict[str, list[KBContextMapping]] = Field(default_factory=dict)
    blueprints: list[BlueprintContext] = Field(default_factory=list)
    boilerplate_styles: list[str] = Field(default_factory=list)
    repetition_summary: list[dict] = Field(default_factory=list)
    # TODO: Remove with _build_kb_context_block in Plan 05.6-03
    is_cross_type_fallback: bool = False


# ---------------------------------------------------------------------------
# Prescriptive KB section models (consumed by Plan 05.6-03)
# ---------------------------------------------------------------------------


class LockedSection(BaseModel):
    """A section resolved from the KB (prescriptive lookup)."""

    section_index: int
    section_text: str
    zone: str
    gw_field: str
    marker_type: str
    confidence: float


class UnknownSection(BaseModel):
    """A section that needs LLM analysis."""

    section_index: int
    section_text: str
    zone: str


# ---------------------------------------------------------------------------
# Placement prompt models (consumed by Plan 05.5-01)
# ---------------------------------------------------------------------------


class PlacementPromptRequest(BaseModel):
    """Request body for POST /adapter/build-placement-prompt."""

    template_base64: str = Field(..., description="Base64-encoded original DOCX")
    mapping_plan: MappingPlan


class PlacementPromptResponse(BaseModel):
    """Response from POST /adapter/build-placement-prompt."""

    prompt: str = Field(..., description="User prompt for the LLM")
    system_prompt: str = Field(..., description="System prompt for the LLM")
    paragraph_count: int = Field(0, description="Total paragraphs for validation bounds")
    zone_map: dict[int, str] = Field(
        default_factory=dict,
        description="Paragraph index to zone mapping for KB enrichment",
    )


class ValidatePlacementRequest(BaseModel):
    """Request body for POST /adapter/validate-placement."""

    llm_response: str = Field(..., description="Raw JSON text from LLM response")
    template_base64: str = Field(..., description="Base64-encoded original DOCX for text verification")
    template_type: TemplateType
    language: TemplateLanguage
    paragraph_count: int = Field(..., description="Total paragraphs for bounds checking")


class ValidatePlacementResponse(BaseModel):
    """Response from POST /adapter/validate-placement."""

    valid: bool
    instruction_set: InstructionSet | None = None
    applied_count: int = Field(0, description="Instructions that passed validation")
    skipped_count: int = Field(0, description="Instructions that failed validation")
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
