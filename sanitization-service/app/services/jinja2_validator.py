"""Jinja2 syntax whitelist validator for template adapter instructions.

Validates that Jinja2 expressions in instruction replacement_text only
reference allowed variables, filters, and control-flow constructs.
"""
import re

from app.models.adapter import Instruction, InstructionSet, ValidationResult

# ---------------------------------------------------------------------------
# Whitelists
# ---------------------------------------------------------------------------

ALLOWED_VARIABLES: set[str] = {
    # Client / project fields
    "client.short_name",
    "project.start_date",
    "project.end_date",
    "project.codename",
    "report_date",
    "title",
    # Team fields
    "team[0].name",
    "team[0].email",
    # Finding fields (plain)
    "finding.title",
    "finding['title']",
    "finding.severity_rt",
    "finding.classification_rt",
    "finding.affected_entities_rt",
    "finding.cvss_vector_link_rt",
    # Finding fields (rich text paragraph)
    "finding.description_rt",
    "finding.impact_rt",
    "finding.recommendation_rt",
    "finding.replication_steps_rt",
    # Scope / totals
    "item.scope",
    "totals.findings",
    # Loop variables
    "loop.index",
    "loop.index0",
    "loop.first",
    "loop.last",
    "loop.length",
    # Namespace counters
    "ns.counter",
    "ns1.counter",
    # Loop iterables
    "findings",
    "scope",
    "team",
    # Finding dict access patterns
    "finding.finding_type",
    "finding.severity",
    "finding.severity_color",
    "finding.cvss_vector",
    # Format expressions (allowed as complete expressions)
    "'%02d' % loop.index",
    '"%02d"|format(ns.counter + 1)',
    '"%02d"|format(ns1.counter)',
    '"%02d" % loop.index',
}

ALLOWED_FILTERS: set[str] = {
    "filter_type",
    "default",
    "int",
    "string",
    "lower",
    "upper",
    "title",
    "format",
    "length",
    "join",
    "trim",
    "e",
}

ALLOWED_CONTROL: set[str] = {
    "for",
    "endfor",
    "set",
    "if",
    "elif",
    "else",
    "endif",
}

# Allowed iteration targets for 'for' loops
ALLOWED_ITERABLES: set[str] = {
    "findings",
    "scope",
    "team",
}

# Dangerous patterns that should never appear
DANGEROUS_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bos\b\s*\."),
    re.compile(r"\bsys\b\s*\."),
    re.compile(r"\b__\w+__\b"),
    re.compile(r"\bimport\b"),
    re.compile(r"\bexec\b\s*\("),
    re.compile(r"\beval\b\s*\("),
    re.compile(r"\bcompile\b\s*\("),
    re.compile(r"\bglobals\b\s*\("),
    re.compile(r"\blocals\b\s*\("),
    re.compile(r"\bgetattr\b\s*\("),
    re.compile(r"\bsetattr\b\s*\("),
    re.compile(r"\bopen\b\s*\("),
    re.compile(r"\bsubprocess\b"),
]

# ---------------------------------------------------------------------------
# Regex patterns for extracting Jinja2 syntax
# ---------------------------------------------------------------------------

# Matches {{ ... }}, {{p ... }}, {{r ... }}
_VAR_PATTERN = re.compile(r"\{\{([pr])?\s*(.+?)\s*\}\}")
# Matches {% ... %}, {%tr ... %}
_CONTROL_PATTERN = re.compile(r"\{%\s*(tr)?\s*(.+?)\s*%\}")


def _parse_jinja2_expression(expr: str) -> dict:
    """Parse a Jinja2 expression string and extract components.

    Returns a dict with keys:
        - variables: list of variable path strings
        - filters: list of filter name strings
        - control_keywords: list of control-flow keywords
        - raw: the original expression
    """
    result: dict = {
        "variables": [],
        "filters": [],
        "control_keywords": [],
        "raw": expr,
    }

    stripped = expr.strip()

    # Check for control keywords first
    control_match = re.match(r"^(for|endfor|set|if|elif|else|endif)\b", stripped)
    if control_match:
        result["control_keywords"].append(control_match.group(1))

    # Extract filter names (word after | that isn't part of a string)
    # but skip format strings like '%02d' or "%02d"
    filter_matches = re.finditer(r"\|\s*(\w+)", stripped)
    for m in filter_matches:
        result["filters"].append(m.group(1))

    # Remove string literals before extracting variables to avoid false positives
    # e.g., default("N/A") should not flag "A" as a variable
    no_strings = re.sub(r'"[^"]*"', '""', stripped)
    no_strings = re.sub(r"'[^']*'", "''", no_strings)

    # Extract variable references -- dot-separated paths or bracket access
    # Skip string literals and numeric constants
    var_matches = re.finditer(
        r"(?<!['\"])\b([a-zA-Z_]\w*(?:\.\w+|\[\d+\]|\['\w+'\])*)",
        no_strings,
    )
    for m in var_matches:
        var = m.group(1)
        # Skip control keywords, filter names, Python builtins, and loop keywords
        if var in ("for", "in", "endfor", "set", "if", "elif", "else",
                    "endif", "namespace", "not", "and", "or", "true",
                    "false", "True", "False", "None", "none"):
            continue
        if var in result["filters"]:
            continue
        # Skip standalone short names that are part of format strings
        if var in ("counter", "index", "index0", "first", "last", "length"):
            continue
        result["variables"].append(var)

    return result


def _check_dangerous(text: str) -> list[str]:
    """Check text for dangerous patterns. Return list of error messages."""
    errors = []
    for pattern in DANGEROUS_PATTERNS:
        if pattern.search(text):
            errors.append(f"Dangerous pattern detected: '{pattern.pattern}' in '{text}'")
    return errors


def validate_instruction(instruction: Instruction) -> list[str]:
    """Validate a single instruction's replacement_text for safe Jinja2 syntax.

    Returns:
        List of error message strings. Empty list means the instruction is valid.
    """
    errors: list[str] = []
    text = instruction.replacement_text

    # Check for dangerous patterns first
    errors.extend(_check_dangerous(text))
    if errors:
        return errors

    # Extract and validate variable expressions {{ ... }}
    for match in _VAR_PATTERN.finditer(text):
        marker = match.group(1) or ""  # 'p', 'r', or ''
        expr = match.group(2).strip()

        # Check if the full expression is in allowed variables (for format expressions)
        if expr in ALLOWED_VARIABLES:
            continue

        parsed = _parse_jinja2_expression(expr)

        # Validate filters
        for f in parsed["filters"]:
            if f not in ALLOWED_FILTERS:
                errors.append(
                    f"Disallowed filter '{f}' in expression '{expr}'"
                )

        # Validate variables
        for var in parsed["variables"]:
            # Check exact match or prefix match (e.g., finding.title matches finding.*)
            if not _is_allowed_variable(var):
                errors.append(
                    f"Disallowed variable '{var}' in expression '{expr}'"
                )

    # Extract and validate control-flow expressions {% ... %}
    for match in _CONTROL_PATTERN.finditer(text):
        tr_marker = match.group(1) or ""
        expr = match.group(2).strip()

        parsed = _parse_jinja2_expression(expr)

        # Validate control keywords
        for kw in parsed["control_keywords"]:
            if kw not in ALLOWED_CONTROL:
                errors.append(
                    f"Disallowed control keyword '{kw}' in '{expr}'"
                )

        # For 'for' loops, validate the iterable
        for_match = re.match(r"for\s+\w+\s+in\s+(\w+(?:\.\w+)*)", expr)
        if for_match:
            iterable = for_match.group(1)
            # Allow filtering expressions like findings|filter_type(...)
            base = iterable.split("|")[0].strip()
            if base not in ALLOWED_ITERABLES and not _is_allowed_variable(base):
                errors.append(
                    f"Disallowed loop iterable '{iterable}' in '{expr}'"
                )

        # Validate filters in control expressions
        for f in parsed["filters"]:
            if f not in ALLOWED_FILTERS:
                errors.append(
                    f"Disallowed filter '{f}' in control expression '{expr}'"
                )

    return errors


def _is_allowed_variable(var: str) -> bool:
    """Check if a variable path is in the allowed set.

    Supports exact match and prefix matching for known object paths.
    """
    if var in ALLOWED_VARIABLES:
        return True

    # Allow any finding.* field
    if var.startswith("finding.") or var.startswith("finding["):
        return True

    # Allow any team[N].* field
    if re.match(r"team\[\d+\]\.\w+", var):
        return True

    # Allow known top-level iterables and objects
    if var in ("findings", "scope", "team", "client", "project",
               "report_date", "totals", "item", "finding", "ns", "ns1"):
        return True

    # Allow nested access on known objects
    for prefix in ("client.", "project.", "totals.", "item.", "ns.", "ns1.", "loop."):
        if var.startswith(prefix):
            return True

    return False


def validate_instruction_set(instruction_set: InstructionSet) -> ValidationResult:
    """Validate an entire instruction set.

    Checks:
        - Each instruction's Jinja2 syntax is safe
        - paragraph_index is non-negative
        - No duplicate paragraph_index + action combinations

    Returns:
        ValidationResult with sanitized_instructions (valid ones only) and errors.
    """
    all_errors: list[str] = []
    valid_instructions: list[Instruction] = []
    seen_combos: set[tuple[int, str, str]] = set()

    for i, instruction in enumerate(instruction_set.instructions):
        inst_errors: list[str] = []

        # Check paragraph_index is non-negative
        if instruction.paragraph_index < 0:
            inst_errors.append(
                f"Instruction {i}: paragraph_index must be non-negative, "
                f"got {instruction.paragraph_index}"
            )

        # Check for duplicate paragraph_index + action + original_text combos
        # (include original_text so different targets at the same fallback index
        # are not wrongly flagged as duplicates)
        combo = (instruction.paragraph_index, instruction.action, instruction.original_text)
        if combo in seen_combos:
            inst_errors.append(
                f"Instruction {i}: duplicate paragraph_index={instruction.paragraph_index} "
                f"+ action='{instruction.action}'"
            )
        seen_combos.add(combo)

        # Validate Jinja2 syntax
        syntax_errors = validate_instruction(instruction)
        inst_errors.extend(
            f"Instruction {i}: {err}" for err in syntax_errors
        )

        if inst_errors:
            all_errors.extend(inst_errors)
        else:
            valid_instructions.append(instruction)

    sanitized = InstructionSet(
        instructions=valid_instructions,
        template_type=instruction_set.template_type,
        language=instruction_set.language,
        additional_blocks=instruction_set.additional_blocks,
    )

    return ValidationResult(
        valid=len(all_errors) == 0,
        errors=all_errors,
        sanitized_instructions=sanitized,
    )
