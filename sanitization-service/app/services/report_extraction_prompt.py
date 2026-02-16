"""Pass 1 LLM prompt builder for executive report extraction.

Builds structured prompts that instruct the LLM to extract findings,
metadata, and warnings from a sanitized technical pentest report.
Follows the same pattern as analysis_prompt.py (system + user prompts,
structured JSON output schema).
"""

import json
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Output schema definition (shared between prompt and validation)
# ---------------------------------------------------------------------------

EXTRACTION_SCHEMA = {
    "findings": [
        {
            "title": "str (finding title)",
            "description": "str (finding description)",
            "severity": "str (critical|high|medium|low|info)",
            "cvss_score": "float|null (CVSS 3.x score if available)",
            "category": "str (Authentication|Authorization|Injection|XSS|CSRF|Cryptography|Configuration|Information Disclosure|Session Management|File Upload|API Security|Network Security|Access Control|Logging/Monitoring)",
            "affected_systems": ["str (system/component names)"],
            "remediation": "str (recommended fix)",
            "business_impact": "str (impact on business operations)",
        }
    ],
    "metadata": {
        "client_name": "str|null (client organization name)",
        "project_code": "str|null (project identifier/codename)",
        "start_date": "str|null (assessment start date, YYYY-MM-DD)",
        "end_date": "str|null (assessment end date, YYYY-MM-DD)",
        "scope_summary": "str|null (brief scope description)",
    },
    "warnings": ["str (data quality issues, missing fields, ambiguities)"],
}

VALID_SEVERITIES = {"critical", "high", "medium", "low", "info"}

VALID_CATEGORIES = {
    "Authentication",
    "Authorization",
    "Injection",
    "XSS",
    "CSRF",
    "Cryptography",
    "Configuration",
    "Information Disclosure",
    "Session Management",
    "File Upload",
    "API Security",
    "Network Security",
    "Access Control",
    "Logging/Monitoring",
}


def build_extraction_system_prompt(language: str) -> str:
    """Build the system prompt for LLM Pass 1 (findings extraction).

    Args:
        language: Output language code ("en" or "pt-pt"). Controls
                  the language used for warnings and metadata values.

    Returns:
        System prompt string establishing the LLM role and output format.
    """
    lang_instruction = (
        "Respond in English."
        if language == "en"
        else f"Respond in the language matching code '{language}'."
    )

    return (
        "You are a cybersecurity report analyst specializing in penetration testing. "
        "Your task is to extract structured findings data from a sanitized technical "
        "pentest report.\n\n"
        "You must return ONLY valid JSON -- no markdown fences, no commentary outside "
        "the JSON structure. Extract ALL findings you can identify, including their "
        "severity, category, and remediation recommendations.\n\n"
        f"{lang_instruction}\n\n"
        "## Output Schema\n\n"
        "Return a JSON object matching this structure exactly:\n\n"
        f"```json\n{json.dumps(EXTRACTION_SCHEMA, indent=2)}\n```\n\n"
        "## Rules\n\n"
        "1. Extract every distinct finding/vulnerability from the report.\n"
        "2. Assign severity as: critical, high, medium, low, or info. "
        "When severity is explicitly stated in the report, use that value. "
        "When unclear, default to 'medium' and add a warning.\n"
        "3. Assign a category from the allowed list. Pick the closest match.\n"
        "4. Include CVSS score only if explicitly stated in the report (null otherwise).\n"
        "5. Extract metadata (client name, project code, dates) from report headers, "
        "cover pages, and introductory sections.\n"
        "6. Add warnings for: missing severity, unclear scope, incomplete findings, "
        "ambiguous categorization, or any data quality issues.\n"
        "7. The report text is sanitized -- personal names, organizations, and project "
        "identifiers may appear as placeholders (e.g., [PERSON_1], [ORGANIZATION_1], "
        "[PROJECT_CODE_1]). Preserve these placeholders as-is. When [PROJECT_CODE_1] "
        "appears, use it as the project_code metadata value.\n"
        "8. If a finding lacks a clear description, include what you can extract and "
        "flag it in warnings.\n\n"
        "## Edge Case Handling\n\n"
        "Handle these situations gracefully -- always produce output, never return errors:\n"
        "- **No CVSS scores:** Set cvss_score to null for all findings. Estimate severity "
        "from the description (e.g., 'remote code execution' = critical, 'missing header' "
        "= low). Add warning: 'missing_cvss: No CVSS scores found in report -- severity "
        "estimated from descriptions.'\n"
        "- **Non-standard formatting:** Reports may use bullet points, tables, or free-form "
        "prose instead of structured sections. Extract findings from any format.\n"
        "- **Very short reports:** If the report has fewer than 3 findings, extract what "
        "you can and add warning: 'few_findings: Only N findings extracted -- report may "
        "be incomplete or summarized.'\n"
        "- **Mixed languages:** The report may mix languages (e.g., Portuguese headings "
        "with English finding descriptions). Extract from all languages.\n"
        "- **Missing metadata:** If client name, dates, or project code are not found, "
        "set them to null and add warning: 'incomplete_metadata: Some metadata fields "
        "could not be extracted (FIELD_NAME).'\n"
        "- **Unclear severity:** When you estimate severity from context rather than "
        "explicit labels, add warning: 'unclear_severity: Severity estimated for N "
        "findings -- original report did not specify severity levels.'"
    )


def build_extraction_user_prompt(
    sanitized_paragraphs: list[str],
    skeleton_schema: dict | None = None,
) -> str:
    """Build the user prompt containing the sanitized report text.

    Args:
        sanitized_paragraphs: List of sanitized paragraph strings from
                              the parsed DOCX. Each paragraph is indexed.
        skeleton_schema: Optional JSON schema of the report skeleton
                         structure (section headings/layout) for structure
                         awareness. Included in the prompt when provided.

    Returns:
        User prompt string with indexed paragraphs and instructions.
    """
    sections: list[str] = []

    # Section 1: Report text with index markers
    sections.append("## Sanitized Report Text\n")
    sections.append(
        "Below are the paragraphs extracted from the technical pentest report. "
        "Each line is prefixed with its paragraph index.\n"
    )

    for i, para in enumerate(sanitized_paragraphs):
        text = para.strip()
        if text:
            sections.append(f"[{i:3d}] {text}")

    sections.append(f"\nTotal paragraphs: {len(sanitized_paragraphs)}")

    # Section 2: Skeleton schema (optional)
    if skeleton_schema:
        sections.append("\n## Executive Report Structure\n")
        sections.append(
            "The extracted data will populate an executive report with this structure. "
            "Use this to understand what sections need data:\n"
        )
        sections.append(f"```json\n{json.dumps(skeleton_schema, indent=2)}\n```")

    # Section 3: Extraction instructions
    sections.append("\n## Instructions\n")
    sections.append(
        "1. Read through ALL paragraphs and identify every vulnerability/finding.\n"
        "2. Extract the metadata (client name, project code, dates, scope) from "
        "the report introduction and cover page sections.\n"
        "3. For each finding, determine severity, category, affected systems, "
        "remediation, and business impact.\n"
        "4. If severity or CVSS is not explicitly stated, set severity to 'medium' "
        "and cvss_score to null, and add a warning.\n"
        "5. Preserve sanitized placeholders (e.g., [PERSON_1]) exactly as they appear.\n"
        "6. List any data quality warnings."
    )

    return "\n".join(sections)


def validate_extraction_response(raw_json: str) -> dict:
    """Parse and validate the LLM extraction response.

    Args:
        raw_json: Raw JSON string from the LLM response.

    Returns:
        Validated dict with findings, metadata, and warnings.

    Raises:
        ValueError: If the JSON is invalid or the structure is wrong.
    """
    # Parse JSON
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in LLM response: {e}") from e

    if not isinstance(data, dict):
        raise ValueError("LLM response must be a JSON object")

    # Validate top-level keys
    if "findings" not in data:
        raise ValueError("Missing required key: 'findings'")

    if not isinstance(data["findings"], list):
        raise ValueError("'findings' must be a list")

    # Validate and normalize each finding
    validated_findings = []
    for i, finding in enumerate(data["findings"]):
        if not isinstance(finding, dict):
            raise ValueError(f"Finding at index {i} must be a dict")

        if "title" not in finding or not finding["title"]:
            raise ValueError(f"Finding at index {i} missing required 'title'")

        # Normalize severity
        severity = finding.get("severity", "medium")
        if isinstance(severity, str):
            severity = severity.lower()
        if severity not in VALID_SEVERITIES:
            severity = "medium"

        validated_findings.append(
            {
                "title": finding["title"],
                "description": finding.get("description", ""),
                "severity": severity,
                "cvss_score": finding.get("cvss_score"),
                "category": finding.get("category", "Configuration"),
                "affected_systems": finding.get("affected_systems", []),
                "remediation": finding.get("remediation", ""),
                "business_impact": finding.get("business_impact", ""),
            }
        )

    # Validate metadata (fill defaults)
    raw_metadata = data.get("metadata", {})
    if not isinstance(raw_metadata, dict):
        raw_metadata = {}

    metadata = {
        "client_name": raw_metadata.get("client_name"),
        "project_code": raw_metadata.get("project_code"),
        "start_date": raw_metadata.get("start_date"),
        "end_date": raw_metadata.get("end_date"),
        "scope_summary": raw_metadata.get("scope_summary"),
    }

    # Validate warnings
    warnings = data.get("warnings", [])
    if not isinstance(warnings, list):
        warnings = []
    warnings = [str(w) for w in warnings]

    # Post-validation: add automatic warnings for detected edge cases
    # These supplement any warnings the LLM already included
    cvss_count = sum(1 for f in validated_findings if f.get("cvss_score") is not None)
    if len(validated_findings) > 0 and cvss_count == 0:
        if not any("missing_cvss" in w for w in warnings):
            warnings.append(
                "missing_cvss: No CVSS scores found in report -- severity "
                "estimated from descriptions."
            )

    if 0 < len(validated_findings) < 3:
        if not any("few_findings" in w for w in warnings):
            warnings.append(
                f"few_findings: Only {len(validated_findings)} finding(s) extracted "
                "-- report may be incomplete or summarized."
            )

    # Check for incomplete metadata
    missing_fields = []
    for field_name, field_value in metadata.items():
        if not field_value:
            missing_fields.append(field_name)
    if missing_fields:
        if not any("incomplete_metadata" in w for w in warnings):
            warnings.append(
                f"incomplete_metadata: Some metadata fields could not be extracted "
                f"({', '.join(missing_fields)})."
            )

    return {
        "findings": validated_findings,
        "metadata": metadata,
        "warnings": warnings,
    }
