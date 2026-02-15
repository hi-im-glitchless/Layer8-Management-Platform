"""Pass 2 LLM prompt builder for executive report narrative generation.

Builds structured prompts that instruct the LLM to generate professional
executive-level narrative text for all report sections from computed
findings data, metrics, and compliance scores.
"""

import json
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Narrative section keys (the 12 sections the LLM must produce)
# ---------------------------------------------------------------------------

NARRATIVE_SECTION_KEYS = [
    "executive_summary",
    "risk_score_explanation",
    "key_metrics_text",
    "severity_analysis",
    "category_analysis",
    "key_threats",
    "compliance_risk_text",
    "top_vulnerabilities_text",
    "strategic_recommendations",
    "positive_aspects",
    "conclusion",
]

# strategic_recommendations has sub-keys
STRATEGIC_RECOMMENDATION_KEYS = [
    "immediate",
    "short_term",
    "long_term",
    "board_recommendations",
]


def build_narrative_system_prompt(language: str) -> str:
    """Build the system prompt for LLM Pass 2 (narrative generation).

    Args:
        language: Output language code ("en" or "pt-pt"). Controls
                  the language of all generated narrative text.

    Returns:
        System prompt string establishing the LLM role and output format.
    """
    lang_instruction = (
        "Write all narrative text in English."
        if language == "en"
        else f"Write all narrative text in the language matching code '{language}'."
    )

    section_schema = {
        "executive_summary": "str (2-3 paragraph executive summary)",
        "risk_score_explanation": "str (methodology explanation for the risk score)",
        "key_metrics_text": "str (narrative interpreting the key metrics)",
        "severity_analysis": "str (analysis of severity distribution)",
        "category_analysis": "str (analysis of vulnerability categories)",
        "key_threats": "str (top threats with business impact context)",
        "compliance_risk_text": "str (compliance framework risk analysis)",
        "top_vulnerabilities_text": "str (top 10 vulnerabilities narrative with CVSS)",
        "strategic_recommendations": {
            "immediate": "str (actions for 0-30 days)",
            "short_term": "str (actions for 1-3 months)",
            "long_term": "str (actions for 3-12 months)",
            "board_recommendations": "str (executive board talking points)",
        },
        "positive_aspects": "str (security strengths observed)",
        "conclusion": "str (closing summary with forward-looking statement)",
    }

    return (
        "You are a senior cybersecurity consultant writing an executive report for "
        "C-level stakeholders and board members. Your writing style must be:\n"
        "- Professional and authoritative\n"
        "- Business impact focused (not technical jargon)\n"
        "- Concise yet comprehensive\n"
        "- Action-oriented with clear recommendations\n\n"
        f"{lang_instruction}\n\n"
        "You must return ONLY valid JSON -- no markdown fences, no commentary outside "
        "the JSON structure.\n\n"
        "## Output Schema\n\n"
        "Return a JSON object with these section keys:\n\n"
        f"```json\n{json.dumps(section_schema, indent=2)}\n```\n\n"
        "## Style Guidelines\n\n"
        "1. Use **bold** for emphasis on key terms.\n"
        "2. Use numbered lists for recommendations and action items.\n"
        "3. Reference specific findings by name when discussing threats.\n"
        "4. Quantify impact where possible (e.g., 'X out of Y findings are critical').\n"
        "5. Avoid technical details (no code, no CVE IDs, no exploit steps).\n"
        "6. Frame vulnerabilities in terms of business risk and regulatory exposure.\n"
        "7. Strategic recommendations should be tiered: immediate (0-30 days), "
        "short-term (1-3 months), long-term (3-12 months), and board-level.\n"
        "8. The report text may contain sanitized placeholders (e.g., [PERSON_1], "
        "[ORG_1]). Preserve these placeholders exactly as they appear."
    )


def build_narrative_user_prompt(
    findings: list[dict],
    metrics: dict,
    compliance_scores: dict[str, float],
    risk_score: float,
    chart_descriptions: dict[str, str],
) -> str:
    """Build the user prompt with all computed data for narrative generation.

    Args:
        findings: List of extracted finding dicts (from Pass 1).
        metrics: Computed metrics dict (severity_counts, category_counts, total).
        compliance_scores: Per-framework risk scores (0-100).
        risk_score: Global risk score (0-100).
        chart_descriptions: Text descriptions of chart data for reference.

    Returns:
        User prompt string with all data needed for narrative generation.
    """
    sections: list[str] = []

    # Section 1: Risk score
    sections.append("## Global Risk Score\n")
    sections.append(f"Risk Score: {risk_score:.1f} / 100\n")

    # Section 2: Severity metrics
    sections.append("## Severity Distribution\n")
    if metrics.get("severity_counts"):
        for sev, count in metrics["severity_counts"].items():
            sections.append(f"  {sev.capitalize()}: {count}")
    sections.append(f"\nTotal findings: {metrics.get('total', 0)}")

    # Section 3: Category metrics
    if metrics.get("category_counts"):
        sections.append("\n## Category Distribution\n")
        for cat, count in sorted(
            metrics["category_counts"].items(), key=lambda x: -x[1]
        ):
            sections.append(f"  {cat}: {count}")

    # Section 4: Compliance scores
    sections.append("\n## Compliance Framework Scores\n")
    for fw, score in compliance_scores.items():
        sections.append(f"  {fw}: {score:.1f}/100")

    # Section 5: Top findings summary
    sections.append("\n## Findings Summary\n")
    # Sort by severity weight for display
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    sorted_findings = sorted(
        findings, key=lambda f: severity_order.get(f.get("severity", "medium"), 2)
    )
    for i, f in enumerate(sorted_findings[:15], 1):
        title = f.get("title", "Untitled")
        sev = f.get("severity", "medium")
        cat = f.get("category", "Unknown")
        impact = f.get("business_impact", "")
        cvss = f.get("cvss_score")
        cvss_str = f" (CVSS: {cvss})" if cvss else ""
        sections.append(f"  {i}. [{sev.upper()}] {title}{cvss_str} — {cat}")
        if impact:
            sections.append(f"     Impact: {impact}")

    if len(findings) > 15:
        sections.append(f"\n  ... and {len(findings) - 15} additional findings")

    # Section 6: Chart descriptions
    if chart_descriptions:
        sections.append("\n## Chart Data Descriptions\n")
        for chart_name, desc in chart_descriptions.items():
            sections.append(f"  {chart_name}: {desc}")

    # Section 7: Instructions
    sections.append("\n## Instructions\n")
    sections.append(
        "Using the data above, generate professional executive narrative text "
        "for each of the 12 report sections defined in the system prompt schema.\n"
        "1. Reference specific numbers and findings by name.\n"
        "2. Frame all analysis in business risk terms.\n"
        "3. Make recommendations actionable and time-bound.\n"
        "4. Highlight positive security aspects to maintain stakeholder confidence.\n"
        "5. Preserve any sanitized placeholders exactly as they appear."
    )

    return "\n".join(sections)


def validate_narrative_response(raw_json: str) -> dict:
    """Parse and validate the LLM narrative response.

    Checks that all 12 section keys are present. Fills empty strings
    for missing optional sections rather than raising errors.

    Args:
        raw_json: Raw JSON string from the LLM response.

    Returns:
        Validated dict with all narrative section keys present.

    Raises:
        ValueError: If the JSON is invalid or not a dict.
    """
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in LLM response: {e}") from e

    if not isinstance(data, dict):
        raise ValueError("LLM response must be a JSON object")

    # Ensure all section keys present with defaults
    result: dict = {}
    for key in NARRATIVE_SECTION_KEYS:
        if key == "strategic_recommendations":
            raw_recs = data.get(key, {})
            if not isinstance(raw_recs, dict):
                raw_recs = {}
            result[key] = {
                sub_key: raw_recs.get(sub_key, "")
                for sub_key in STRATEGIC_RECOMMENDATION_KEYS
            }
        else:
            value = data.get(key, "")
            result[key] = value if isinstance(value, str) else ""

    return result
