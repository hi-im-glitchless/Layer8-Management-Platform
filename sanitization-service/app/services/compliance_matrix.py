"""Compliance framework mapping and risk scoring.

Provides a static mapping of vulnerability categories to compliance
frameworks, deterministic risk scoring, and per-framework compliance
score computation.
"""

# ---------------------------------------------------------------------------
# Static compliance matrix: category -> affected frameworks
# ---------------------------------------------------------------------------

COMPLIANCE_MATRIX: dict[str, list[str]] = {
    "Authentication": ["ISO 27001", "NIST CSF", "PCI-DSS", "CIS Controls"],
    "Authorization": ["ISO 27001", "NIST CSF", "GDPR", "PCI-DSS", "CIS Controls"],
    "Injection": ["ISO 27001", "NIST CSF", "PCI-DSS", "CIS Controls"],
    "XSS": ["ISO 27001", "NIST CSF", "PCI-DSS", "CIS Controls"],
    "CSRF": ["ISO 27001", "NIST CSF", "PCI-DSS"],
    "Cryptography": ["ISO 27001", "NIST CSF", "GDPR", "PCI-DSS", "CIS Controls"],
    "Configuration": ["ISO 27001", "NIST CSF", "PCI-DSS", "CIS Controls"],
    "Information Disclosure": ["ISO 27001", "NIST CSF", "GDPR", "PCI-DSS"],
    "Session Management": ["ISO 27001", "NIST CSF", "PCI-DSS", "CIS Controls"],
    "File Upload": ["ISO 27001", "NIST CSF", "CIS Controls"],
    "API Security": ["ISO 27001", "NIST CSF", "PCI-DSS", "CIS Controls"],
    "Network Security": ["ISO 27001", "NIST CSF", "PCI-DSS", "CIS Controls"],
    "Access Control": ["ISO 27001", "NIST CSF", "GDPR", "PCI-DSS", "CIS Controls"],
    "Logging/Monitoring": ["ISO 27001", "NIST CSF", "GDPR", "PCI-DSS", "CIS Controls"],
}

# ---------------------------------------------------------------------------
# All frameworks tracked
# ---------------------------------------------------------------------------

ALL_FRAMEWORKS: list[str] = [
    "ISO 27001",
    "NIST CSF",
    "GDPR",
    "PCI-DSS",
    "CIS Controls",
]

# ---------------------------------------------------------------------------
# Severity weights used in scoring
# ---------------------------------------------------------------------------

SEVERITY_WEIGHTS: dict[str, int] = {
    "critical": 15,
    "high": 10,
    "medium": 5,
    "low": 2,
    "info": 0,
}

# ---------------------------------------------------------------------------
# Risk level thresholds (score ranges -> risk label)
# ---------------------------------------------------------------------------

RISK_LEVEL_THRESHOLDS: dict[str, tuple[float, float]] = {
    "Critical": (75.0, 100.0),
    "High": (50.0, 74.99),
    "Medium": (25.0, 49.99),
    "Low": (0.0, 24.99),
}


def compute_risk_score(severity_counts: dict[str, int]) -> float:
    """Compute a deterministic risk score from severity counts.

    Formula: (critical*15 + high*10 + medium*5 + low*2) / max_possible * 100
    where max_possible = total_findings * 15 (all findings at critical weight).

    Args:
        severity_counts: Mapping of severity level to finding count.
                         Keys should be lowercase: critical, high, medium, low.

    Returns:
        Risk score as a float between 0.0 and 100.0.
        Returns 0.0 if there are no findings.
    """
    total_findings = sum(severity_counts.get(s, 0) for s in SEVERITY_WEIGHTS)
    if total_findings == 0:
        return 0.0

    weighted_sum = sum(
        severity_counts.get(severity, 0) * weight
        for severity, weight in SEVERITY_WEIGHTS.items()
    )

    max_possible = total_findings * 15  # all at critical weight
    return (weighted_sum / max_possible) * 100.0


def get_risk_level(score: float) -> str:
    """Map a risk score to its risk level label.

    Args:
        score: Risk score 0-100.

    Returns:
        Risk level string: "Critical", "High", "Medium", or "Low".
    """
    for level, (low, high) in RISK_LEVEL_THRESHOLDS.items():
        if low <= score <= high:
            return level
    return "Low"


def compute_compliance_scores(findings: list[dict]) -> dict[str, float]:
    """Compute per-framework risk scores from extracted findings.

    For each framework, computes a weighted score based on how many
    findings affect that framework and their severities.

    Args:
        findings: List of finding dicts, each with at least:
                  - "category": str (must match COMPLIANCE_MATRIX keys)
                  - "severity": str (critical/high/medium/low/info)

    Returns:
        Dict mapping framework name to score (0.0-100.0).
        Returns 0.0 for frameworks unaffected by any findings.
    """
    framework_weighted_sums: dict[str, float] = {fw: 0.0 for fw in ALL_FRAMEWORKS}
    framework_max_possible: dict[str, float] = {fw: 0.0 for fw in ALL_FRAMEWORKS}

    for finding in findings:
        category = finding.get("category", "")
        severity = finding.get("severity", "medium").lower()
        weight = SEVERITY_WEIGHTS.get(severity, 0)

        affected_frameworks = COMPLIANCE_MATRIX.get(category, [])
        for fw in affected_frameworks:
            framework_weighted_sums[fw] += weight
            framework_max_possible[fw] += 15  # max weight per finding

    scores: dict[str, float] = {}
    for fw in ALL_FRAMEWORKS:
        if framework_max_possible[fw] == 0:
            scores[fw] = 0.0
        else:
            scores[fw] = (
                framework_weighted_sums[fw] / framework_max_possible[fw]
            ) * 100.0

    return scores
