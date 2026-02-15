"""Pydantic models for the executive report feature.

Request/response models for all /report/* endpoints. Follows the same
pattern as models/adapter.py (separate models file, imported by routes).
"""

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# POST /report/build-extraction-prompt
# ---------------------------------------------------------------------------


class BuildExtractionPromptRequest(BaseModel):
    """Request body for building LLM extraction prompt (Pass 1)."""

    sanitized_paragraphs: list[str] = Field(
        ..., description="List of sanitized paragraph texts from parsed DOCX"
    )
    language: str = Field(
        ..., description="Language code: 'en' or 'pt-pt'"
    )
    skeleton_schema: dict | None = Field(
        None, description="Optional JSON schema of the report skeleton structure"
    )


class BuildExtractionPromptResponse(BaseModel):
    """Response with system and user prompts for LLM Pass 1."""

    system_prompt: str = Field(..., description="System prompt for the LLM")
    user_prompt: str = Field(..., description="User prompt with sanitized report text")


# ---------------------------------------------------------------------------
# POST /report/validate-extraction
# ---------------------------------------------------------------------------


class ValidateExtractionRequest(BaseModel):
    """Request body for validating LLM extraction response."""

    raw_json: str = Field(
        ..., description="Raw JSON string from LLM extraction response"
    )


class ValidateExtractionResponse(BaseModel):
    """Response with validated extraction data."""

    findings: list[dict] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    valid: bool = Field(..., description="Whether the extraction response was valid")
    error: str | None = Field(None, description="Error message if validation failed")


# ---------------------------------------------------------------------------
# POST /report/compute-metrics
# ---------------------------------------------------------------------------


class ComputeMetricsRequest(BaseModel):
    """Request body for computing report metrics."""

    findings: list[dict] = Field(
        ..., description="List of extracted finding dicts from Pass 1"
    )


class ComputeMetricsResponse(BaseModel):
    """Response with computed risk metrics."""

    risk_score: float = Field(..., description="Global risk score 0-100")
    risk_level: str = Field(..., description="Risk level: Critical/High/Medium/Low")
    severity_counts: dict = Field(
        default_factory=dict, description="Count per severity level"
    )
    compliance_scores: dict = Field(
        default_factory=dict, description="Per-framework compliance scores"
    )
    category_counts: dict = Field(
        default_factory=dict, description="Count per vulnerability category"
    )


# ---------------------------------------------------------------------------
# POST /report/render-charts
# ---------------------------------------------------------------------------


class RenderChartsRequest(BaseModel):
    """Request body for rendering report charts."""

    severity_counts: dict = Field(
        ..., description="Severity label -> count"
    )
    category_counts: dict = Field(
        ..., description="Category name -> count"
    )
    stacked_data: dict = Field(
        ..., description="Category -> {severity: count} for stacked bar"
    )
    compliance_scores: dict = Field(
        ..., description="Framework name -> score (0-100)"
    )
    risk_score: float = Field(
        ..., description="Global risk score for donut gauge"
    )


class RenderChartsResponse(BaseModel):
    """Response with base64-encoded chart PNG images."""

    charts: dict[str, str] = Field(
        default_factory=dict,
        description="Chart name -> base64-encoded PNG image",
    )


# ---------------------------------------------------------------------------
# POST /report/build-narrative-prompt
# ---------------------------------------------------------------------------


class BuildNarrativePromptRequest(BaseModel):
    """Request body for building LLM narrative prompt (Pass 2)."""

    findings: list[dict] = Field(
        ..., description="Extracted findings from Pass 1"
    )
    metrics: dict = Field(
        ..., description="Computed metrics (severity_counts, category_counts, total)"
    )
    compliance_scores: dict = Field(
        ..., description="Per-framework risk scores"
    )
    risk_score: float = Field(
        ..., description="Global risk score"
    )
    chart_descriptions: dict = Field(
        default_factory=dict,
        description="Chart name -> textual description of chart data",
    )
    language: str = Field(
        ..., description="Language code: 'en' or 'pt-pt'"
    )


class BuildNarrativePromptResponse(BaseModel):
    """Response with system and user prompts for LLM Pass 2."""

    system_prompt: str = Field(..., description="System prompt for the LLM")
    user_prompt: str = Field(..., description="User prompt with computed data")


# ---------------------------------------------------------------------------
# POST /report/validate-narrative
# ---------------------------------------------------------------------------


class ValidateNarrativeRequest(BaseModel):
    """Request body for validating LLM narrative response."""

    raw_json: str = Field(
        ..., description="Raw JSON string from LLM narrative response"
    )


class ValidateNarrativeResponse(BaseModel):
    """Response with validated narrative sections."""

    sections: dict[str, str] = Field(
        default_factory=dict,
        description="Section key -> narrative text (12 sections)",
    )
    valid: bool = Field(..., description="Whether the narrative response was valid")
    error: str | None = Field(None, description="Error message if validation failed")


# ---------------------------------------------------------------------------
# POST /report/build-report
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# POST /report/build-section-correction-prompt
# ---------------------------------------------------------------------------


class SectionCorrectionPromptRequest(BaseModel):
    """Request body for building a single-section correction prompt."""

    section_key: str = Field(
        ..., description="Key of the section to correct (e.g., 'executive_summary')"
    )
    current_text: str = Field(
        ..., description="Current text content of the section"
    )
    user_feedback: str = Field(
        ..., description="User's correction request / feedback"
    )
    report_context: dict = Field(
        default_factory=dict,
        description="Context: findings_summary, risk_score, other_sections",
    )
    language: str = Field(
        ..., description="Language code: 'en' or 'pt-pt'"
    )


class SectionCorrectionPromptResponse(BaseModel):
    """Response with system and user prompts for section correction."""

    system_prompt: str = Field(..., description="System prompt for the LLM")
    user_prompt: str = Field(..., description="User prompt with section + feedback")


# ---------------------------------------------------------------------------
# POST /report/validate-section-correction
# ---------------------------------------------------------------------------


class ValidateSectionCorrectionRequest(BaseModel):
    """Request body for validating a section correction LLM response."""

    raw_json: str = Field(
        ..., description="Raw JSON string from LLM correction response"
    )
    expected_section_key: str = Field(
        ..., description="The section key that was requested for correction"
    )


class ValidateSectionCorrectionResponse(BaseModel):
    """Response with validated section correction data."""

    section_key: str = Field("", description="The corrected section key")
    revised_text: str = Field("", description="The revised section text")
    valid: bool = Field(..., description="Whether the correction response was valid")
    error: str | None = Field(None, description="Error message if validation failed")


# ---------------------------------------------------------------------------
# POST /report/build-report
# ---------------------------------------------------------------------------


class BuildReportRequest(BaseModel):
    """Request body for building the final DOCX report."""

    language: str = Field(
        ..., description="Language code for skeleton selection: 'en' or 'pt-pt'"
    )
    narrative_sections: dict[str, str] = Field(
        ..., description="Section key -> narrative text"
    )
    metadata: dict = Field(
        default_factory=dict,
        description="Cover page metadata (client_name, project_code, report_date)",
    )
    chart_images: dict[str, str] = Field(
        default_factory=dict,
        description="Chart name -> base64-encoded PNG image",
    )
    risk_score: float = Field(0.0, description="Risk score for display")
    risk_level: str = Field("", description="Risk level label")


class BuildReportResponse(BaseModel):
    """Response with the built DOCX report."""

    docx_base64: str = Field(
        ..., description="Base64-encoded DOCX file bytes"
    )
    filename: str = Field(
        ..., description="Suggested filename for the report"
    )
