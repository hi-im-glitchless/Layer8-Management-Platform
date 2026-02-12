---
status: complete
phase: 02-sanitization-infrastructure
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md, 02-07-SUMMARY.md, 02-08-SUMMARY.md
started: 2026-02-12T14:00:00Z
updated: 2026-02-12T14:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Sanitization Service Starts in Docker
expected: Build and run the sanitization service Docker container. After ~20s model loading, GET http://localhost:8000/health returns models_loaded=true with supported_languages ["en", "pt"].
result: pass

### 2. Deny List CRUD via Admin API
expected: As admin, POST /api/deny-list with term "GlobalTech Corp", GET /api/deny-list shows the term, GET /api/deny-list/active returns it as a string, DELETE /api/deny-list/:id removes it. All mutations require admin role.
result: pass

### 3. Sanitize Text with Standard PII
expected: POST /api/sanitize (or directly to Python service POST http://localhost:8000/sanitize) with text containing names, emails, and IPs. Response returns sanitized text with typed placeholders like [PERSON_1], [EMAIL_ADDRESS_1], [IP_ADDR_1]. Original values are NOT in the sanitized output.
result: pass

### 4. Pentest-Specific Entity Detection
expected: Sanitize text containing pentest entities: internal hostnames (dc01.corp.local), AD objects (CN=John,OU=IT,DC=corp,DC=local), network paths (\\\\server\\share), domains (client-corp.com). Each entity type detected and replaced with typed placeholder ([HOSTNAME_1], [AD_OBJECT_1], [NETWORK_PATH_1], [DOMAIN_1]).
result: pass

### 5. Deny List Terms Caught During Sanitization
expected: Sanitize text that contains a deny list term. The term is replaced with a [CUSTOM_N] placeholder. Matching is case-insensitive with word boundaries (e.g., "ACME Corp" matches "acme corp" but NOT "AcmeCorp").
result: pass

### 6. Desanitize Restores Original Text
expected: After sanitizing text, POST /desanitize with the sanitized text and the mappings from the sanitize response. Response returns the exact original text with all placeholders replaced by original values. The "complete" field is true.
result: pass

### 7. Portuguese Language Auto-Detection
expected: Sanitize Portuguese text (e.g., a pentest report excerpt in Portuguese). The response shows language="pt", confirming auto-detection selected the Portuguese spaCy model.
result: pass

### 8. Test Suite Passes in Docker
expected: Build the test image and run pytest: `docker build -f Dockerfile.test -t layer8-sanitizer-test sanitization-service/ && docker run --rm layer8-sanitizer-test`. All 66 test cases pass (0 failures).
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
