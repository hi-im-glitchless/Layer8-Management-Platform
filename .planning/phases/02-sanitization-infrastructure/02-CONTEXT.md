# Phase 2: Sanitization Infrastructure - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-grade PII sanitization pipeline with custom pentest recognizers and session-scoped reversible mappings. The pipeline sanitizes documents before LLM processing and desanitizes outputs to restore original values. This phase delivers the backend sanitization service and its integration with the Node backend — the sanitization review UI (preview, approve/reject, highlight missed entities) is built in Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Entity Detection Scope
- Full standard PII set: names, emails, phone numbers, credit cards, IBANs, SSNs/NIFs, physical addresses, dates of birth (Presidio built-in)
- Custom pentest recognizers for: IP addresses, hostnames (internal FQDNs like .local, .internal, .corp), Active Directory objects (CN=, OU=, DC=), external domains, network paths
- Smart IP detection: detect IPs in prose/tables but skip version strings (e.g., 'OpenSSH 8.2'), CIDR in code blocks, localhost/RFC5737 ranges
- Internal hostnames detected as sensitive entities — most common PII leak in pentest reports
- Code blocks sanitized selectively: IPs, hostnames, and credentials inside code blocks are sanitized, but tool names, flags, and technical syntax are preserved
- Images sanitized: remove images, insert placeholder, restore originals during desanitization (screenshots of client systems, network diagrams contain sensitive data)

### spaCy & Language Support
- Dual language models: en_core_web_lg (English) and pt_core_news_lg (Portuguese)
- Auto-detect document language and select appropriate model
- spaCy handles fuzzy entities (person names, org names, locations); pentest-specific entities use regex/rule-based recognizers

### Mapping & Placeholder Strategy
- Typed + indexed placeholder format: [PERSON_1], [IP_ADDR_3], [HOSTNAME_2], [IMAGE_1], etc.
- Consistent mapping: same entity always maps to same placeholder throughout the document (critical for LLM to understand cross-references)
- Session-scoped mappings stored in Redis with TTL matching user session TTL (mappings expire when session expires)
- No mapping export/import for v1 — each sanitization creates fresh mappings

### Pipeline Behavior
- Python microservice (FastAPI) exposing sanitize/desanitize endpoints, called from Node backend via HTTP
- Low-confidence detections flagged with confidence scores — downstream review UI (Phase 8) lets users approve/dismiss
- Zero PII detected: return clean result with warning ("No PII detected. Verify this is expected.")
- Desanitization completeness validation: after restoring originals, scan output for remaining placeholder tokens — raise error if any found
- Health/readiness endpoint (GET /health): returns model loading status and supported languages; Node backend waits for readiness before routing requests

### Deny List & Custom Terms
- Deny list runs BEFORE Presidio — exact string matches on known terms take priority over NER
- Case-insensitive matching: 'Acme Corp' matches 'ACME CORP', 'acme corp', etc.
- Word boundary matching: 'Acme' matches 'Acme Corp', 'Acme-Internal' but not 'AcmeticSoft'
- Both global + per-session scope: admin-managed global deny list (stored in DB, auto-applies) plus per-session additions via Phase 8 UI
- Deny list matches tagged as CUSTOM entity type in results

### Testing & Validation
- Synthetic pentest report test data (no real PII in repo)
- Round-trip tests: sanitize → desanitize → compare with original
- Unit tests per recognizer with known patterns and edge cases

### Claude's Discretion
- FastAPI service structure and endpoint design
- Exact regex patterns for pentest recognizers
- spaCy model loading strategy (lazy vs eager)
- Redis key structure for mapping storage
- Error handling and retry logic between Node backend and Python service
- Synthetic test data content and structure

</decisions>

<specifics>
## Specific Ideas

- Images in DOCX should be extracted, replaced with placeholders, and restored during desanitization — important because pentest reports contain screenshots of client infrastructure
- Confidence scores must be preserved in the sanitization result so the Phase 8 review UI can show uncertain detections distinctly
- The deny list global terms should be manageable by admins — this feeds into the admin panel built in Phase 1
- Health endpoint needed because spaCy model loading takes several seconds on cold start

</specifics>

<deferred>
## Deferred Ideas

- Mapping export/import for cross-document consistency within an engagement — future enhancement if users request it
- Per-engagement deny list scoping (grouping documents by client engagement) — requires engagement management concept
- Sanitization review UI (preview, approve/reject entities, highlight missed data) — Phase 8

</deferred>

---

*Phase: 02-sanitization-infrastructure*
*Context gathered: 2026-02-11*
