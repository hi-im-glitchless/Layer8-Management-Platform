---
phase: 5
plan: 2
status: complete
---
## Tasks Completed
- Task 1: Jinja2 Syntax Validator (`48fb738`)
- Task 2: Rules Engine (`c5356c2`)
- Task 3: Instruction Applier (`fed7751`)
- Task 4: Validator & Rules Engine Tests (`61ac8f8`)
- Task 5: Instruction Applier Tests (`ff9e43c`)

## Files Modified
- `sanitization-service/app/services/jinja2_validator.py` -- new: whitelist validator with ALLOWED_VARIABLES, ALLOWED_FILTERS, ALLOWED_CONTROL; validate_instruction, validate_instruction_set, dangerous pattern detection
- `sanitization-service/app/services/rules_engine.py` -- new: apply_marker_rules ({{p}}/{{r}}/{%tr%} rewriting), inject_type_features (internal filter_type/namespace, web/mobile scope), enrich_instructions pipeline
- `sanitization-service/app/services/instruction_applier.py` -- new: InstructionApplier class with replace_text (single/multi-run), insert_before/after, wrap_table_row (lxml XML), formatting preservation
- `sanitization-service/tests/test_jinja2_validator.py` -- new: 25 tests covering valid/invalid variables, filters, control flow, duplicates, mixed sets
- `sanitization-service/tests/test_rules_engine.py` -- new: 23 tests covering marker rewriting, type features (internal/web/mobile), pipeline
- `sanitization-service/tests/test_instruction_applier.py` -- new: 16 tests covering replace/insert/wrap actions, multi-run, formatting preservation, edge cases

## Deviations
- Fixed string literal handling in jinja2_validator: regex was extracting variable names from inside string arguments (e.g., "A" from `default("N/A")`). Added string-stripping pass before variable extraction.
- Fixed marker correction logic in rules_engine: wrong-marker rewrite was falling through to plain-match path, producing `{{p r field }}`. Restructured to handle wrong markers in the marked-match branch.
