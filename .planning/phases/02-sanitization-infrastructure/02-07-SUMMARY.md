---
phase: 02-sanitization-infrastructure
plan: 07
subsystem: sanitization-service
tags: [gap-closure, bug-fix, test-infrastructure, desanitization]
dependency_graph:
  requires: [02-06]
  provides: [test-state-reconstruction-api, robust-desanitization]
  affects: [round-trip-tests, integration-tests]
tech_stack:
  added: []
  patterns: [single-pass-regex-substitution, operator-state-reconstruction]
key_files:
  created: []
  modified:
    - sanitization-service/app/operators/mapping_replace.py
    - sanitization-service/tests/test_roundtrip.py
    - sanitization-service/tests/test_sanitization.py
    - sanitization-service/app/services/sanitizer.py
decisions:
  - summary: Use load_mappings() as canonical API for operator state reconstruction
    rationale: Prevents test code bugs from incorrect manual state manipulation
  - summary: Single-pass re.sub with callback for desanitization
    rationale: Eliminates position-tracking bugs and substring conflicts from iterative replace
metrics:
  duration: 2m 9s
  tasks_completed: 2
  tests_fixed: 6
  pass_rate_improvement: 9.1%
  completed: 2026-02-12
---

# Phase 02 Plan 07: Mapping Reconstruction Bug Fix Summary

**Fixed mapping reconstruction bug in test code and hardened desanitization logic, closing 6 of 8 failing tests from verification**

## One-liner

Fixed test code using nonexistent `entity_map` attribute and replaced iterative `str.replace` with single-pass `re.sub` for robust desanitization, improving test pass rate from 87.9% to 97.0%

## Objective

Close 6 of 8 failing tests by fixing the mapping reconstruction bug in test code and hardening the desanitization logic to handle edge cases correctly.

## What Was Delivered

### Core Fixes

1. **Test Code State Reconstruction**
   - Replaced `operator.entity_map = sanitize_response.mappings` with `operator.load_mappings()` in 6 test methods
   - Fixed test_roundtrip.py: 4 tests (English report, Portuguese report, deny list, multiple same entity)
   - Fixed test_sanitization.py: 2 tests (no placeholder after desanitization, mappings reversible)
   - Added `from_response()` class method to MappingReplaceOperator for convenience
   - Eliminated all references to nonexistent `entity_map` attribute

2. **Robust Desanitization Implementation**
   - Replaced iterative `str.replace(..., 1)` with single-pass `re.sub` using callback
   - Eliminated position-tracking bugs from text mutation between iterations
   - Correctly handles edge cases: original values containing placeholder patterns, substring matches
   - Simpler implementation (14 fewer lines, single code path)
   - All placeholder occurrences processed in one regex pass

### Test Results

**Before:** 58/66 passing (87.9%)
**After:** 64/66 passing (97.0%)
**Fixed:** 6 tests
- test_roundtrip_english_report ✓
- test_roundtrip_portuguese_report ✓
- test_roundtrip_with_deny_list ✓
- test_no_placeholder_after_desanitization ✓
- test_mappings_reversible ✓
- test_multiple_same_entity_same_placeholder ✓

**Remaining failures (2):**
- test_entity_count_matches_expected - AD_OBJECT detection issue (entity recognition, not mapping)
- test_language_detection_portuguese - Language detection false positive (out of scope)

### Technical Improvements

1. **load_mappings() as Canonical API**
   - Correctly reconstructs nested `self.mappings` dict from flat forward mappings
   - Properly extracts entity types from placeholder format `[ENTITY_TYPE_N]`
   - Handles multi-underscore types (IP_ADDR, EMAIL_ADDRESS, AD_OBJECT, NETWORK_PATH)
   - Prevents test code from creating dangling attributes

2. **Single-Pass Desanitization**
   - Uses `re.compile(r'\[([A-Z_]+_\d+)\]')` pattern
   - Callback function tracks unresolved placeholders
   - No mutation of text between matches
   - Regex engine handles all position offsets
   - Correctly processes multiple occurrences of same placeholder

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Use load_mappings() as canonical API for operator state reconstruction**
   - Rationale: Prevents test code bugs from incorrect manual state manipulation
   - Alternative considered: Add setter for entity_map - rejected as it exposes internal structure
   - Impact: Test code is now more maintainable and bug-resistant

2. **Single-pass re.sub with callback for desanitization**
   - Rationale: Eliminates position-tracking bugs and substring conflicts from iterative replace
   - Alternative considered: Fix iterative approach - rejected as inherently fragile
   - Impact: Simpler, more correct, fewer failure modes

## Files Changed

### Modified
- `sanitization-service/app/operators/mapping_replace.py` - Added from_response() class method
- `sanitization-service/tests/test_roundtrip.py` - Fixed 4 tests using load_mappings()
- `sanitization-service/tests/test_sanitization.py` - Fixed 2 tests using load_mappings()
- `sanitization-service/app/services/sanitizer.py` - Replaced desanitize with single-pass re.sub

## Verification

### Commands Run

```bash
# Syntax validation
python -c "import ast; ast.parse(open('tests/test_roundtrip.py').read()); \
           ast.parse(open('tests/test_sanitization.py').read()); \
           ast.parse(open('app/operators/mapping_replace.py').read()); print('OK')"

# Check for remaining entity_map references
grep -rn "entity_map" tests/  # Returns zero results (only bytecode cache)

# Mapping operator unit tests
python -m pytest tests/test_mapping_operator.py -v  # 11/11 passing

# Full test suite in Docker
docker build -f Dockerfile.test -t layer8-sanitizer-test . && \
docker run --rm layer8-sanitizer-test  # 64/66 passing (97.0%)
```

### Results
- All mapping operator unit tests still pass (11/11)
- No remaining references to entity_map in test source code
- Test pass rate improved from 87.9% to 97.0%
- All 6 targeted tests now passing
- No regressions in previously-passing tests

## Impact

### Test Infrastructure
- Test code now uses correct API for operator state reconstruction
- More maintainable test patterns
- Prevents future bugs from incorrect state manipulation

### Desanitization Robustness
- Single-pass regex approach eliminates entire class of position-tracking bugs
- Correctly handles edge cases that broke iterative approach
- Simpler implementation is easier to maintain and reason about

### Progress to Phase Completion
- From 58/66 (87.9%) to 64/66 (97.0%) test pass rate
- 6 of 8 verification failures closed
- 2 remaining failures are out-of-scope (entity detection, language detection)
- Core round-trip functionality verified working

## Next Steps

The 2 remaining test failures are not blocking for Phase 02 completion:

1. **test_entity_count_matches_expected** - AD_OBJECT not detected in synthetic report
   - Issue: Entity detection, not mapping/desanitization
   - Impact: Low (one entity type among many working)
   - Action: Optional improvement in Plan 08 if prioritized

2. **test_language_detection_portuguese** - PT text detected as EN
   - Issue: Language detection heuristic false positive
   - Impact: Low (explicit language parameter works correctly)
   - Action: Optional improvement if language auto-detection becomes critical

## Self-Check: PASSED

### Files Created
None (all modifications)

### Files Modified
- [x] sanitization-service/app/operators/mapping_replace.py exists
- [x] sanitization-service/tests/test_roundtrip.py exists
- [x] sanitization-service/tests/test_sanitization.py exists
- [x] sanitization-service/app/services/sanitizer.py exists

### Commits
- [x] 98d0d14 exists: fix(02-07): replace entity_map with load_mappings() in test code
- [x] efc6d9c exists: refactor(02-07): replace iterative str.replace with single-pass re.sub in desanitize

### Verification Commands
```bash
# Verify files exist
[ -f "sanitization-service/app/operators/mapping_replace.py" ] && echo "FOUND: mapping_replace.py" || echo "MISSING: mapping_replace.py"
[ -f "sanitization-service/tests/test_roundtrip.py" ] && echo "FOUND: test_roundtrip.py" || echo "MISSING: test_roundtrip.py"
[ -f "sanitization-service/tests/test_sanitization.py" ] && echo "FOUND: test_sanitization.py" || echo "MISSING: test_sanitization.py"
[ -f "sanitization-service/app/services/sanitizer.py" ] && echo "FOUND: sanitizer.py" || echo "MISSING: sanitizer.py"

# Verify commits exist
git log --oneline --all | grep -q "98d0d14" && echo "FOUND: 98d0d14" || echo "MISSING: 98d0d14"
git log --oneline --all | grep -q "efc6d9c" && echo "FOUND: efc6d9c" || echo "MISSING: efc6d9c"
```

All checks passed.
