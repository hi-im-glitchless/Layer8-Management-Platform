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
    "report_date": "text",
    "team[0].name": "text",
    "team[0].email": "text",
    "finding.title": "text",
    "finding['title']": "text",
    "totals.findings": "text",
    "item.scope": "text",
    "finding.classification_rt": "text",
    "finding.affected_entities_rt": "text",
    "finding.cvss_vector_link_rt": "text",
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


class AnnotateRequest(BaseModel):
    """Request body for POST /adapter/annotate."""

    template_base64: str = Field(..., description="Base64-encoded client DOCX template")
    mapping_plan: MappingPlan


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
