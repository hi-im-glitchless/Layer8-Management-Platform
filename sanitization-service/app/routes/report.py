"""Executive report API endpoints.

POST /report/build-extraction-prompt  -- Build Pass 1 LLM prompt from sanitized paragraphs
POST /report/validate-extraction      -- Validate LLM extraction JSON response
POST /report/compute-metrics          -- Compute risk score, severity, compliance scores
POST /report/render-charts            -- Render charts as base64 PNG images
POST /report/build-narrative-prompt   -- Build Pass 2 LLM prompt from computed data
POST /report/validate-narrative       -- Validate LLM narrative JSON response
POST /report/build-report             -- Build DOCX report from skeleton + data + charts
"""

import base64
import logging
from collections import Counter

from fastapi import APIRouter, HTTPException

from app.models.report import (
    BuildExtractionPromptRequest,
    BuildExtractionPromptResponse,
    BuildNarrativePromptRequest,
    BuildNarrativePromptResponse,
    BuildReportRequest,
    BuildReportResponse,
    ComputeMetricsRequest,
    ComputeMetricsResponse,
    RenderChartsRequest,
    RenderChartsResponse,
    SectionCorrectionPromptRequest,
    SectionCorrectionPromptResponse,
    ValidateExtractionRequest,
    ValidateExtractionResponse,
    ValidateNarrativeRequest,
    ValidateNarrativeResponse,
    ValidateSectionCorrectionRequest,
    ValidateSectionCorrectionResponse,
)
from app.services.chart_renderer import ChartRenderer
from app.services.compliance_matrix import (
    compute_compliance_scores,
    compute_risk_score,
    get_risk_level,
)
from app.services.report_builder import ReportBuilder, get_skeleton_path
from app.services.report_extraction_prompt import (
    build_extraction_system_prompt,
    build_extraction_user_prompt,
    validate_extraction_response,
)
from app.services.report_narrative_prompt import (
    build_narrative_system_prompt,
    build_narrative_user_prompt,
    build_section_correction_system_prompt,
    build_section_correction_user_prompt,
    validate_narrative_response,
    validate_section_correction,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared chart renderer instance
_chart_renderer = ChartRenderer()


# ---------------------------------------------------------------------------
# POST /report/build-extraction-prompt
# ---------------------------------------------------------------------------


@router.post(
    "/build-extraction-prompt",
    response_model=BuildExtractionPromptResponse,
)
async def build_extraction_prompt(
    body: BuildExtractionPromptRequest,
) -> BuildExtractionPromptResponse:
    """Build the LLM extraction prompt (Pass 1) from sanitized paragraphs.

    Takes sanitized paragraph texts and returns system + user prompts
    for the LLM to extract structured findings and metadata.
    """
    try:
        system_prompt = build_extraction_system_prompt(body.language)
        user_prompt = build_extraction_user_prompt(
            body.sanitized_paragraphs,
            skeleton_schema=body.skeleton_schema,
        )
    except Exception as exc:
        logger.error("Extraction prompt build failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build extraction prompt: {exc}",
        )

    logger.info(
        "Built extraction prompt: %d paragraphs, lang=%s, prompt_len=%d",
        len(body.sanitized_paragraphs),
        body.language,
        len(user_prompt),
    )

    return BuildExtractionPromptResponse(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )


# ---------------------------------------------------------------------------
# POST /report/validate-extraction
# ---------------------------------------------------------------------------


@router.post(
    "/validate-extraction",
    response_model=ValidateExtractionResponse,
)
async def validate_extraction(
    body: ValidateExtractionRequest,
) -> ValidateExtractionResponse:
    """Validate the raw LLM extraction response JSON.

    Parses and validates the structured findings, metadata, and warnings
    from the LLM Pass 1 response.
    """
    # Strip markdown code fences if present
    raw = body.raw_json.strip()
    if raw.startswith("```"):
        first_nl = raw.index("\n") if "\n" in raw else len(raw)
        raw = raw[first_nl + 1:]
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[:-3].rstrip()

    try:
        result = validate_extraction_response(raw)
        logger.info(
            "Validated extraction: %d findings, %d warnings",
            len(result["findings"]),
            len(result["warnings"]),
        )
        return ValidateExtractionResponse(
            findings=result["findings"],
            metadata=result["metadata"],
            warnings=result["warnings"],
            valid=True,
            error=None,
        )
    except ValueError as exc:
        logger.warning("Extraction validation failed: %s", exc)
        return ValidateExtractionResponse(
            findings=[],
            metadata={},
            warnings=[],
            valid=False,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# POST /report/compute-metrics
# ---------------------------------------------------------------------------


@router.post(
    "/compute-metrics",
    response_model=ComputeMetricsResponse,
)
async def compute_metrics(
    body: ComputeMetricsRequest,
) -> ComputeMetricsResponse:
    """Compute risk score, severity distribution, and compliance scores.

    Takes extracted findings and returns deterministic metrics used
    for chart rendering and narrative generation.
    """
    # Count severities
    severity_counter: Counter = Counter()
    category_counter: Counter = Counter()

    for finding in body.findings:
        severity = finding.get("severity", "medium").lower()
        category = finding.get("category", "Configuration")
        severity_counter[severity] += 1
        category_counter[category] += 1

    severity_counts = dict(severity_counter)

    # Compute risk score
    risk_score = compute_risk_score(severity_counts)
    risk_level = get_risk_level(risk_score)

    # Compute compliance scores
    compliance_scores = compute_compliance_scores(body.findings)

    category_counts = dict(category_counter)

    logger.info(
        "Computed metrics: risk_score=%.1f (%s), %d findings, %d categories",
        risk_score,
        risk_level,
        len(body.findings),
        len(category_counts),
    )

    return ComputeMetricsResponse(
        risk_score=risk_score,
        risk_level=risk_level,
        severity_counts=severity_counts,
        compliance_scores=compliance_scores,
        category_counts=category_counts,
    )


# ---------------------------------------------------------------------------
# POST /report/render-charts
# ---------------------------------------------------------------------------


@router.post(
    "/render-charts",
    response_model=RenderChartsResponse,
)
async def render_charts(
    body: RenderChartsRequest,
) -> RenderChartsResponse:
    """Render all report charts as base64-encoded PNG images.

    Returns 5-6 chart images: severity pie, category bar, stacked severity,
    compliance radar, risk score card, and optionally a top vulnerabilities bar.
    """
    charts: dict[str, str] = {}

    try:
        # 1. Risk Score Card (donut gauge)
        risk_png = _chart_renderer.render_risk_score_card(
            body.risk_score, "Global Risk Score"
        )
        charts["Risk Score Card"] = base64.b64encode(risk_png).decode("ascii")

        # 2. Severity Distribution (pie chart)
        severity_png = _chart_renderer.render_severity_pie(body.severity_counts)
        charts["Severity Distribution"] = base64.b64encode(severity_png).decode("ascii")

        # 3. Category Bar (horizontal bar chart)
        category_png = _chart_renderer.render_category_bar(body.category_counts)
        charts["Category Bar"] = base64.b64encode(category_png).decode("ascii")

        # 4. Stacked Severity (stacked bar chart)
        stacked_png = _chart_renderer.render_stacked_severity_bar(body.stacked_data)
        charts["Stacked Severity"] = base64.b64encode(stacked_png).decode("ascii")

        # 5. Compliance Radar
        radar_png = _chart_renderer.render_compliance_radar(body.compliance_scores)
        charts["Compliance Radar"] = base64.b64encode(radar_png).decode("ascii")

        # 6. Top Vulnerabilities (reuse category bar for top-N)
        # Use severity counts as a simple top vulnerabilities chart
        top_vuln_png = _chart_renderer.render_category_bar(body.severity_counts)
        charts["Top Vulnerabilities"] = base64.b64encode(top_vuln_png).decode("ascii")

    except Exception as exc:
        logger.error("Chart rendering failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Chart rendering failed: {exc}",
        )

    logger.info("Rendered %d charts", len(charts))

    return RenderChartsResponse(charts=charts)


# ---------------------------------------------------------------------------
# POST /report/build-narrative-prompt
# ---------------------------------------------------------------------------


@router.post(
    "/build-narrative-prompt",
    response_model=BuildNarrativePromptResponse,
)
async def build_narrative_prompt(
    body: BuildNarrativePromptRequest,
) -> BuildNarrativePromptResponse:
    """Build the LLM narrative prompt (Pass 2) from computed data.

    Takes findings, metrics, compliance scores, and chart descriptions,
    and returns system + user prompts for the LLM to generate all
    12 narrative sections.
    """
    try:
        system_prompt = build_narrative_system_prompt(body.language)
        user_prompt = build_narrative_user_prompt(
            findings=body.findings,
            metrics=body.metrics,
            compliance_scores=body.compliance_scores,
            risk_score=body.risk_score,
            chart_descriptions=body.chart_descriptions,
        )
    except Exception as exc:
        logger.error("Narrative prompt build failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build narrative prompt: {exc}",
        )

    logger.info(
        "Built narrative prompt: %d findings, lang=%s, prompt_len=%d",
        len(body.findings),
        body.language,
        len(user_prompt),
    )

    return BuildNarrativePromptResponse(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )


# ---------------------------------------------------------------------------
# POST /report/validate-narrative
# ---------------------------------------------------------------------------


@router.post(
    "/validate-narrative",
    response_model=ValidateNarrativeResponse,
)
async def validate_narrative(
    body: ValidateNarrativeRequest,
) -> ValidateNarrativeResponse:
    """Validate the raw LLM narrative response JSON.

    Parses the LLM response and ensures all 12 section keys are present
    with non-empty content.
    """
    # Strip markdown code fences if present
    raw = body.raw_json.strip()
    if raw.startswith("```"):
        first_nl = raw.index("\n") if "\n" in raw else len(raw)
        raw = raw[first_nl + 1:]
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[:-3].rstrip()

    try:
        result = validate_narrative_response(raw)

        # Flatten nested dicts for the response
        flat_sections: dict[str, str] = {}
        for key, value in result.items():
            if isinstance(value, dict):
                for sub_key, sub_value in value.items():
                    flat_sections[f"{key}.{sub_key}"] = sub_value
            elif isinstance(value, str):
                flat_sections[key] = value

        logger.info(
            "Validated narrative: %d sections",
            len(flat_sections),
        )

        return ValidateNarrativeResponse(
            sections=flat_sections,
            valid=True,
            error=None,
        )
    except ValueError as exc:
        logger.warning("Narrative validation failed: %s", exc)
        return ValidateNarrativeResponse(
            sections={},
            valid=False,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# POST /report/build-section-correction-prompt
# ---------------------------------------------------------------------------


@router.post(
    "/build-section-correction-prompt",
    response_model=SectionCorrectionPromptResponse,
)
async def build_section_correction_prompt(
    body: SectionCorrectionPromptRequest,
) -> SectionCorrectionPromptResponse:
    """Build the LLM prompt for correcting a single report section.

    Takes the current section text, user feedback, and report context,
    and returns system + user prompts for targeted section revision.
    """
    try:
        system_prompt = build_section_correction_system_prompt(body.language)
        user_prompt = build_section_correction_user_prompt(
            section_key=body.section_key,
            current_text=body.current_text,
            user_feedback=body.user_feedback,
            report_context=body.report_context,
        )
    except Exception as exc:
        logger.error("Section correction prompt build failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build section correction prompt: {exc}",
        )

    logger.info(
        "Built section correction prompt: section=%s, feedback_len=%d, prompt_len=%d",
        body.section_key,
        len(body.user_feedback),
        len(user_prompt),
    )

    return SectionCorrectionPromptResponse(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )


# ---------------------------------------------------------------------------
# POST /report/validate-section-correction
# ---------------------------------------------------------------------------


@router.post(
    "/validate-section-correction",
    response_model=ValidateSectionCorrectionResponse,
)
async def validate_section_correction_route(
    body: ValidateSectionCorrectionRequest,
) -> ValidateSectionCorrectionResponse:
    """Validate the raw LLM section correction response JSON.

    Parses the response and checks that the section_key matches
    the expected key and that revised_text is non-empty.
    """
    # Strip markdown code fences if present
    raw = body.raw_json.strip()
    if raw.startswith("```"):
        first_nl = raw.index("\n") if "\n" in raw else len(raw)
        raw = raw[first_nl + 1:]
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[:-3].rstrip()

    try:
        result = validate_section_correction(raw, body.expected_section_key)
        logger.info(
            "Validated section correction: key=%s, text_len=%d",
            result["section_key"],
            len(result["revised_text"]),
        )
        return ValidateSectionCorrectionResponse(
            section_key=result["section_key"],
            revised_text=result["revised_text"],
            valid=True,
            error=None,
        )
    except ValueError as exc:
        logger.warning("Section correction validation failed: %s", exc)
        return ValidateSectionCorrectionResponse(
            section_key="",
            revised_text="",
            valid=False,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# POST /report/build-report
# ---------------------------------------------------------------------------


@router.post(
    "/build-report",
    response_model=BuildReportResponse,
)
async def build_report(
    body: BuildReportRequest,
) -> BuildReportResponse:
    """Build the final executive report DOCX from skeleton + data + charts.

    Selects the skeleton DOCX based on language, fills it with narrative
    sections, cover page metadata, and chart images, and returns the
    complete DOCX as base64.
    """
    # Resolve skeleton path
    try:
        skeleton_path = get_skeleton_path(body.language)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Decode chart images from base64 to bytes
    chart_bytes: dict[str, bytes] = {}
    for chart_name, b64_data in body.chart_images.items():
        try:
            chart_bytes[chart_name] = base64.b64decode(b64_data)
        except Exception:
            logger.warning("Failed to decode chart image: %s", chart_name)

    # Reconstruct narrative dict with nested structure for strategic_recommendations
    narrative: dict = {}
    strategic_recs: dict[str, str] = {}
    for key, text in body.narrative_sections.items():
        if key.startswith("strategic_recommendations."):
            sub_key = key.split(".", 1)[1]
            strategic_recs[sub_key] = text
        else:
            narrative[key] = text
    if strategic_recs:
        narrative["strategic_recommendations"] = strategic_recs

    # Build report data
    report_data = {
        "narrative": narrative,
        "metadata": body.metadata,
        "risk_score": body.risk_score,
        "risk_level": body.risk_level,
    }

    # Build the DOCX
    try:
        builder = ReportBuilder(skeleton_path)
        docx_bytes = builder.build_report(report_data, chart_bytes)
    except Exception as exc:
        logger.error("Report build failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build report DOCX: {exc}",
        )

    docx_base64 = base64.b64encode(docx_bytes).decode("ascii")

    # Generate filename
    client_name = body.metadata.get("client_name", "report")
    safe_name = "".join(
        c if c.isalnum() or c in "-_" else "_" for c in client_name
    )
    filename = f"executive_report_{safe_name}.docx"

    logger.info(
        "Built report DOCX: %d bytes, lang=%s, %d charts",
        len(docx_bytes),
        body.language,
        len(chart_bytes),
    )

    return BuildReportResponse(
        docx_base64=docx_base64,
        filename=filename,
    )
