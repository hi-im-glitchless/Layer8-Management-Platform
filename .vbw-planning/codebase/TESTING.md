# Testing

## Backend (Vitest)
- **Framework**: Vitest with v8 coverage
- **Config**: `backend/vitest.config.ts`
- **Environment**: Node, with test-specific env vars
- **Coverage**: v8 provider, text/json/html reporters
- **Run**: `npm test` or `npm run test:watch`

## Sanitization Service (Pytest)
- **Framework**: Pytest
- **Config**: `pyproject.toml` ([tool.pytest.ini_options])
- **Markers**: `@pytest.mark.unit` (no deps), `@pytest.mark.requires_spacy` (needs models)
- **Test files**: `tests/test_*.py`
- **Docker test image**: `Dockerfile.test` for CI
- **Run**: `pytest -v`

## Frontend
- **Status**: No test infrastructure yet
- **Recommended**: Vitest + Testing Library + MSW

## Test Coverage Gaps
- No frontend tests
- No E2E tests
- Backend test coverage partial (auth flows tested, other routes less so)
- Sanitizer has unit + integration tests for recognizers and pipeline
