# Pitfalls Research

**Domain:** AI-Powered Pentest Report Automation
**Researched:** 2026-02-10
**Confidence:** MEDIUM-HIGH

## Critical Pitfalls

### Pitfall 1: python-docx Formatting Loss on Complex Templates

**What goes wrong:**
Client-provided Word templates with advanced formatting (text boxes, floating images, custom styles, SmartArt, nested tables, track changes, custom fonts) silently lose formatting when processed through python-docx, producing broken templates after Jinja2 placeholder insertion.

**Why it happens:**
python-docx only supports a subset of Word's OOXML features. When you apply a style that's not defined in the file, Word ignores it without error. The library preserves complex elements it doesn't understand, but cannot manipulate them. Highly-stylized documents require workarounds that developers discover only after implementation.

**How to avoid:**
1. Validate client templates during upload against a whitelist of supported features
2. Generate a "compatibility report" showing which elements will/won't survive processing
3. Build a reference template library showing supported patterns
4. Implement template preview BEFORE Jinja2 insertion to catch fidelity issues early
5. Consider python-docx-template for better preservation of complex structures
6. For mission-critical formatting, evaluate alternative approaches (PyWin32 for Windows hosts, or docx4j for JVM-based processing)

**Warning signs:**
- Client templates use text boxes or floating objects (python-docx doesn't support these)
- Templates have custom bullet styles or complex numbering schemes
- Round-trip test (read → save → compare) shows formatting differences
- Preview rendering differs significantly from original template
- LibreOffice headless rendering produces layout shifts

**Phase to address:**
Phase 1 (Template Upload/Validation) - Build template compatibility checker before allowing users to upload templates. Reject or warn about unsupported features upfront.

---

### Pitfall 2: Context Leakage Through Sanitized Data Relationships

**What goes wrong:**
Even after Presidio successfully sanitizes individual PII entities (names, IPs, domains), the semantic relationships and context between sanitized entities remain intact, allowing inference attacks to reconstruct sensitive information from LLM-processed content. Example: "[PERSON_1] accessed [IP_1] using credentials from [DOMAIN_1]" still reveals attack patterns and organizational structure.

**Why it happens:**
Traditional sanitization focuses on entity removal at surface level without addressing deeper semantic vulnerabilities. Research shows that identifier removal methods preserve underlying semantic connections that enable inference attacks despite altering surface text. Each tool invocation in AI agents represents a potential data leak, and agents chain operations where data from one secure system might be passed to another, creating unintended data commingling.

**How to avoid:**
1. Implement multi-layer sanitization: entity removal + semantic obfuscation
2. Deploy PrivacyChecker-style validation (reduces leakage from 33% to 8% on GPT-4o)
3. Add context scrubbing beyond entity detection (attack flow descriptions, timestamps that correlate events)
4. Build custom pentest-specific deny lists for client-unique terminology
5. Implement pre-sanitization and review-time deny lists as dual-gate protection
6. Use differential privacy techniques to add noise to patterns
7. Audit LLM outputs for reconstructable information even with tokens removed

**Warning signs:**
- Sanitized reports still contain phrases like "the same credentials" or "both systems"
- Temporal correlations survive sanitization (timestamps, sequence indicators)
- Generic descriptions leak specifics ("legacy Windows domain controller" reveals tech stack)
- Test prompts can reconstruct original entities from sanitized context
- Review-time feedback contains unsanitized references that weren't caught

**Phase to address:**
Phase 1 (Sanitization Engine) - Implement defense-in-depth sanitization with semantic analysis, not just entity removal. Phase 2 (Executive Report Generator) must validate that context doesn't leak through LLM-generated summaries.

---

### Pitfall 3: LLM Dropping or Hallucinating Jinja2 Placeholder Tokens

**What goes wrong:**
LLM generates template content or executive reports but silently drops Jinja2 placeholder tokens ({{ client.name }}), substitutes them with hallucinated values ("Acme Corp"), or mangles the syntax ({{ client name }} without dot notation), breaking the template system and causing data corruption during final rendering.

**Why it happens:**
Language models hallucinate because standard training rewards guessing over acknowledging uncertainty. Even frontier models have >15% hallucination rates when analyzing provided statements. LLMs treat placeholders as natural language patterns to "improve" rather than literal tokens to preserve. Structured output generation is particularly vulnerable when placeholders look like incomplete or malformed text.

**How to avoid:**
1. Pre-generation: Use system prompts with explicit "PRESERVE EXACT SYNTAX" instructions + examples
2. Use structured prompting (chain-of-thought) which reduces hallucinations in prompt-sensitive scenarios
3. Post-generation validation: Regex scan for expected placeholders, fail if missing/malformed
4. Implement placeholder counting: input placeholders = output placeholders
5. Use LLM-specific structured output modes (JSON mode, function calling) where available
6. Test with adversarial cases: templates with many placeholders, placeholders mid-sentence
7. Build a "placeholder verification phase" before preview rendering
8. Consider fine-tuning on pentest template preservation tasks if base model fails consistently

**Warning signs:**
- Preview renders show hardcoded client names instead of placeholder values
- Template syntax errors during Ghostwriter data injection
- Placeholders appear with spacing issues or case changes
- LLM responses contain natural-sounding but incorrect values
- Validation shows missing tokens that were in reference template
- Different runs produce different placeholder syntax for same input

**Phase to address:**
Phase 1 (Template Adapter) - Implement placeholder validation BEFORE storing templates. Phase 2 (Executive Report) - Add token preservation checks in LLM output validation.

---

### Pitfall 4: LibreOffice Headless Rendering Fidelity Failures

**What goes wrong:**
Pixel-perfect PDF previews generated via LibreOffice headless mode exhibit layout shifts, missing images, truncated tables, wrong fonts, or inconsistent pagination compared to the original Word document or how Microsoft Word would render the same file. This breaks the "what you see is what you get" promise for pentest report previews.

**Why it happens:**
LibreOffice and Microsoft Word interpret DOCX formatting differently. LibreOffice headless conversion has documented issues: tables/images exceeding default page size get truncated to 8.5x11", layout inconsistencies occur with complex formatting, performance degrades severely with large documents (7500 pages = 26 minutes), and PDF export settings cannot be controlled via command-line interface. LibreOffice is also not thread-safe, forcing sequential processing.

**How to avoid:**
1. Set explicit paper size/margins in LibreOffice conversion commands to prevent default truncation
2. Validate preview fidelity by comparing against known reference documents during development
3. Implement async job queue for LibreOffice processing to handle non-thread-safe constraint
4. Add timeout protection (don't let 15-min conversions block the system)
5. Consider hybrid approach: LibreOffice for simple templates, Microsoft Office COM/REST API for complex ones
6. Build template complexity scoring to route simple→LibreOffice, complex→alternative renderer
7. Warn users if template complexity score suggests preview may differ from final output
8. Cache rendered PDFs aggressively to minimize repeated conversions

**Warning signs:**
- PDF previews show different fonts than Word document
- Tables or images cut off at page boundaries
- Conversion times exceed 30 seconds for typical templates
- Pagination differs from Word rendering
- Custom fonts fall back to default
- Images positioned incorrectly or missing entirely
- Side-by-side comparison shows layout drift

**Phase to address:**
Phase 1 (Preview Generation) - Implement fidelity validation and complexity scoring before relying on LibreOffice. Build fallback rendering strategy.

---

### Pitfall 5: Concurrent Session State Corruption in Sanitization Mappings

**What goes wrong:**
Multiple pentesters working simultaneously cause sanitization mapping collisions where User A's sanitized tokens (e.g., [IP_1]) overwrite or mix with User B's mappings, leading to data leakage across sessions, incorrect desanitization in previews, or exposure of User A's sensitive data in User B's LLM feedback loop.

**Why it happens:**
Data stored in session state or shared caches is susceptible to race conditions from concurrent access across separate threads/windows. Web applications must handle multiple active sessions simultaneously, but improper session isolation creates shared state. FastAPI with asyncio enables concurrent request handling, but sanitization mappings stored in global state or inadequately scoped storage lead to cross-contamination.

**How to avoid:**
1. Store sanitization mappings per-session with cryptographically strong session IDs
2. Use session-scoped storage (Redis with session-keyed namespaces, not in-process memory)
3. Implement row-level locking for sanitization map updates if using SQL storage
4. Add session validation checks: "Does this mapping belong to this user?"
5. Include session ID in all cache keys: `sanitization:{session_id}:{document_id}`
6. Implement automatic session cleanup on logout/timeout
7. Build comprehensive integration tests simulating concurrent users
8. Add audit logging that tracks which session accessed which sanitized data
9. Monitor for sanitization mapping collisions in production (alert if detected)

**Warning signs:**
- Integration tests with concurrent users occasionally fail
- Audit logs show user accessing sanitization maps created by different user
- Preview contains entities that weren't in the original document
- Intermittent desanitization errors that disappear on retry
- Session state persists after logout
- Race condition errors in logs during high concurrency

**Phase to address:**
Phase 1 (Session Architecture) - Design session isolation correctly from the start. Phase 2 (Executive Report) stress-test with concurrent users before production.

---

### Pitfall 6: Portuguese Variant Drift (European vs Brazilian)

**What goes wrong:**
LLM translation feature produces Brazilian Portuguese output instead of European Portuguese (PT-PT) despite explicit instructions, causing vocabulary mismatches ("trem" vs "comboio"), grammar differences ("você" vs "tu"), and tone inconsistencies that make reports appear unprofessional to European clients.

**Why it happens:**
Most LLMs are trained predominantly on Brazilian Portuguese due to population size. For example, if Llama 3's 8% multilingual data includes only 0.008% European Portuguese, that's insufficient for reliable PT-PT generation. LLMs default to majority variant without explicit constraints, and model training data imbalance means Brazilian Portuguese patterns dominate.

**How to avoid:**
1. Use system prompts with explicit "EUROPEAN PORTUGUESE ONLY (Portugal, NOT Brazil)" instructions
2. Provide few-shot examples of PT-PT vs PT-BR differences in prompt
3. Post-generation validation: scan for Brazilian-specific terms (trem, celular, você in informal contexts)
4. Build a PT-PT/PT-BR terminology validator with deny list for Brazilian terms
5. Consider hybrid approach: Claude 4 Opus for preserving tone + glossary enforcement
6. Implement user feedback loop: flag Brazilian Portuguese occurrences for model correction
7. Test with native PT-PT speakers during development
8. Maintain a PT-PT terminology reference database for validation

**Warning signs:**
- Output contains "celular" instead of "telemóvel"
- Informal contexts use "você" predominantly instead of "tu"
- Vocabulary from Brazilian Portuguese appears (trem, ônibus vs autocarro)
- Native Portuguese reviewers flag output as "Brazilian Portuguese"
- Grammar patterns match PT-BR conjugations
- Different LLM runs produce mixed variants

**Phase to address:**
Phase 2 (Translation Feature) - Implement PT-PT validation and terminology enforcement. Test extensively with European Portuguese native speakers.

---

### Pitfall 7: FastAPI Streaming Response Interruptions

**What goes wrong:**
LLM streaming responses to frontend break mid-stream, timeout unexpectedly, or disconnect without completing the generation, leaving users with partial executive reports and no error indication. Retries produce different outputs due to LLM non-determinism, causing confusion.

**Why it happens:**
Streaming responses are fragile: they can randomly stop (documented OpenAI API issue), timeout on long generations, or disconnect due to network/proxy issues. SSE (Server-Sent Events) connections require specific HTTP headers (Cache-Control, Connection) that might be stripped by intermediary proxies. LLM generation time is unpredictable, and default timeouts may be too short.

**How to avoid:**
1. Implement SSE with proper headers: `Cache-Control: no-cache`, `Connection: keep-alive`, `Content-Type: text/event-stream`
2. Add keepalive/heartbeat messages during long generations to prevent timeout
3. Set generous timeouts (5+ minutes) for LLM streaming endpoints
4. Implement client-side reconnection logic with exponential backoff
5. Store partial generations server-side so reconnections can resume
6. Add progress indicators: "Generating executive summary (step 2/4)..."
7. Implement fallback to non-streaming mode if stream fails repeatedly
8. Monitor stream interruption rates in production, alert on anomalies
9. Test with various network conditions (slow connections, mobile networks)
10. Consider chunked generation: generate sections separately, combine client-side

**Warning signs:**
- Streams terminate before completion marker
- Frontend shows partial content with no error
- Timeouts occur during normal-length generations
- Network tab shows connection closed unexpectedly
- Retries produce completely different outputs
- Users report "generation stopped halfway"

**Phase to address:**
Phase 2 (Executive Report Generator) - Implement robust streaming with reconnection/resume before production deployment.

---

### Pitfall 8: Presidio False Negatives on Pentest-Specific Entities

**What goes wrong:**
Presidio with custom pentest recognizers still misses domain-specific sensitive entities: internal hostnames (srv-dc01.internal.local), non-standard IP formats (IPv6, CIDR notation), Active Directory paths (CN=Admin,OU=IT,DC=corp,DC=local), custom credential formats, or client-specific codenames, causing sensitive data to leak to cloud LLM.

**Why it happens:**
Presidio's pattern recognition is less specific for domain-specific entities. A driver's license could be any 9-digit number; similarly, internal hostnames don't match standard DNS patterns. Every PII detection logic has trade-offs between false positives (falsely detected) and false negatives (missed entities). Pentest reports contain highly specialized formats not covered by standard PII recognizers. Custom recognizers may not cover all edge cases discovered only in production.

**How to avoid:**
1. Build comprehensive custom recognizers for pentest-specific patterns: AD paths, internal TLDs (.local, .corp, .internal), CIDR notation, MAC addresses, custom hash formats, client-specific naming conventions
2. Implement multi-pass recognition: standard entities first, then domain-specific, then custom deny lists
3. Add entropy-based detection for potential secrets/credentials (high-entropy strings near keywords like "password", "token")
4. Require manual review queue for flagged content before LLM processing
5. Test recognizers against real pentest report corpus to measure recall
6. Build allow lists for known safe patterns (public IPs, example.com, localhost)
7. Implement conservative mode: flag uncertain patterns for human review rather than auto-sanitizing
8. Track false negative discoveries in production and continuously update recognizers

**Warning signs:**
- Manual review finds unsanitized hostnames in LLM input
- IPv6 addresses pass through sanitization
- AD paths not recognized as sensitive
- Custom client terminology appears in LLM requests
- Test corpus shows <95% entity detection recall
- Production audit logs reveal entity types not in recognizer set

**Phase to address:**
Phase 1 (Sanitization Engine) - Build comprehensive custom recognizers with extensive test coverage before any LLM integration.

---

### Pitfall 9: Jinja2 Template Injection via Client Template Upload *(deprioritized — defense-in-depth)*

**Note:** This pitfall is deprioritized because uploaded templates are plain Word documents — the application inserts Jinja2 code, not the user. However, it remains a defense-in-depth concern since a crafted .docx could theoretically contain Jinja2 syntax in text content.

**What goes wrong:**
Malicious or compromised client template contains Jinja2 code injection payloads that execute during template processing, leading to remote code execution, data exfiltration, or system compromise. Example: `{{ ''.__class__.__mro__[1].__subclasses__() }}` in template docx executes during Jinja2 rendering.

**Why it happens:**
When generating reports in Word format, if the application fails to properly sanitize or validate input, the Jinja2 engine will execute the code. Recent vulnerabilities (CVE-2024-56326, CVE-2025-27516) show template injection through overlooked sandbox escapes, particularly via the `|attr` filter. Attackers can inject arbitrary Jinja2 code into templates, potentially executing malicious code on the server.

**How to avoid:**
1. Upgrade jinja2 to version 3.1.5+ immediately
2. Treat uploaded templates as untrusted input: never render without validation
3. Parse docx XML, scan for Jinja2-like patterns ({{ }}, {% %}) before accepting upload
4. Use Jinja2 sandbox mode with restricted execution context
5. Whitelist allowed Jinja2 constructs (variables only, no filters/methods)
6. Implement template static analysis: reject templates with dangerous patterns
7. Run template processing in isolated containers with minimal privileges
8. Never allow user-controlled template logic, only placeholder insertion
9. Audit logging for template upload with file hash for forensics
10. Implement template signature/approval workflow for enterprise deployments

**Warning signs:**
- Templates contain {% for %}, {% if %}, or other control structures
- Uploaded templates have unusual XML structure
- Template parsing triggers Jinja2 errors about restricted operations
- Security scans detect malicious patterns
- Templates contain {{ }} with method calls or attribute access
- Unexpected system behavior after template upload

**Phase to address:**
Phase 1 (Template Upload) - Implement template security validation as first line of defense before ANY processing occurs.

---

### Pitfall 10: Audit Log Tampering and Incompleteness

**What goes wrong:**
GDPR/NDA compliance-grade audit logging fails to capture critical events (who accessed what sanitized data, when), logs are vulnerable to modification/deletion by attackers or administrators, or logs don't contain sufficient detail to reconstruct data processing lineage during regulatory audits.

**Why it happens:**
Organizations deploy audit logging but don't implement tamper-proof mechanisms. Logs stored in standard database tables or files can be modified by privileged users. Incomplete logging requirements lead to missing LLM request/response details, sanitization mapping changes, or user actions. Documenting LLM processing activities is challenging due to scale, dynamic data sources, and frequent updates.

**How to avoid:**
1. Implement write-once/append-only log storage (WORM storage, blockchain, or signed logs)
2. Cryptographic signing of log entries to detect tampering
3. Ship logs to external SIEM immediately to prevent local deletion
4. Log all processing activities: sanitization mapping creation/access, LLM API calls with sanitized payloads, desanitization operations, user feedback loop interactions, template uploads/modifications
5. Include comprehensive metadata: session ID, user ID, timestamp (UTC), action type, data identifiers, LLM model/version, sanitization strategy applied
6. Maintain data lineage: track document from upload → sanitization → LLM processing → preview → final output
7. Implement tamper detection: periodic integrity checks on historical logs
8. Separate log access from application access: logs accessible only to auditors/compliance
9. Test audit log completeness: can you reconstruct entire processing flow from logs alone?
10. Document retention policies compliant with GDPR (right to erasure vs. audit requirements)

**Warning signs:**
- Gaps in log timeline (missing hours/days)
- Logs don't contain LLM request/response payloads
- Sanitization mappings not logged
- Admin accounts can delete/modify logs
- Logs lack session correlation
- Cannot reconstruct data processing flow from logs during mock audit
- No tamper detection alerts despite suspicious activity

**Phase to address:**
Phase 1 (Audit Infrastructure) - Build tamper-proof logging foundation before implementing ANY data processing features.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store sanitization mappings in-memory (global dict) | Simple implementation, no DB setup | Race conditions, memory leaks, session corruption | Never - too risky for compliance tool |
| Skip LibreOffice preview fidelity validation | Faster MVP, no test infrastructure | User trust eroded by incorrect previews | Only for internal-only alpha testing |
| Use generic Presidio recognizers only | Quick sanitization implementation | Production false negatives leak sensitive data | Never - pentest data too specialized |
| Single-pass LLM generation without validation | Faster responses | Hallucinated placeholders break templates | Never - validation is critical |
| Client-side sanitization mapping storage | Reduced server storage | Mapping leakage, client tampering risk | Never - GDPR violation risk |
| Skip template upload security scanning | Faster template processing | Template injection RCE vulnerability | Never - security-critical application |
| Use default session timeouts (30+ minutes) | Standard web app behavior | Sanitization mappings persist too long | Early development only, tighten for production |
| Store audit logs in main application database | Simple deployment | Admin can tamper with compliance records | Early prototype only, never production |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI/Anthropic LLM API | Sending unsanitized data directly | Always sanitize, validate post-generation, log both sanitized input and raw output |
| LibreOffice headless | Assuming thread-safety, no timeout protection | Use job queue, async processing, 5-min timeout, complexity-based routing |
| Presidio | Using default recognizers for specialized data | Build custom recognizers, multi-pass detection, manual review queue |
| FastAPI streaming | Not handling connection drops | SSE with keepalive, reconnection logic, partial storage for resume |
| python-docx | Assuming full Word feature support | Validate template compatibility upfront, preview before processing, whitelist supported features |
| Ghostwriter integration | Hardcoding field mappings | Dynamic schema discovery, version compatibility checks, test data validation |
| Translation services | Not specifying Portuguese variant | Explicit PT-PT instructions, terminology validation, native speaker review |
| Session storage (Redis) | Using global keys without session prefix | Session-scoped namespacing: `{session_id}:{resource}` |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous LibreOffice conversion | Request timeouts on complex templates | Async job queue with progress polling | >10 concurrent users or templates >50 pages |
| In-memory sanitization mapping storage | Memory growth, crashes | Redis/database with TTL, cleanup on session end | >100 concurrent sessions |
| No LLM response caching | Repeated identical API calls, high costs | Cache LLM responses by sanitized input hash | >100 reports/day or budget constraints |
| Sequential template processing | Queue backlog, slow bulk upload | Parallel processing with worker pool | >5 templates in bulk upload |
| Full document re-sanitization on edits | Slow user feedback loop | Incremental sanitization of changed sections only | Documents >10 pages with frequent edits |
| Unbounded audit log queries | Admin dashboard timeouts | Pagination, time-range filters, indexed queries | >10K audit entries |
| Loading all session mappings at once | Slow session restoration | Lazy loading, only fetch needed mappings | >50 sanitized entities per session |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not validating placeholder token integrity | LLM-injected malicious payloads in templates | Whitelist placeholder syntax, validate against known schema |
| Trusting sanitized data is truly clean | Context leakage reveals sensitive info | Semantic analysis, manual review queue, PrivacyChecker validation |
| Allowing user-controlled Jinja2 logic | Template injection RCE | Only allow variable placeholders, never control structures |
| Logging sanitization mappings in plaintext | Audit logs leak what you sanitized | Encrypt mapping values in logs, or log only metadata |
| No rate limiting on LLM endpoints | API key theft leads to bill shock | Per-user rate limits, cost budgets, anomaly detection |
| Desanitizing preview without re-validation | Stale mappings insert wrong data | Validate mapping freshness, session correlation |
| Sanitization bypass via file metadata | DOCX properties contain unsanitized data | Strip all metadata before processing |
| Cross-session mapping access | User A sees User B's sensitive data | Session-scoped storage with access validation |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No preview before final PDF generation | User wastes time on broken templates | Instant preview with dummy data, validate before LLM processing |
| Silent placeholder token loss | Reports break mysteriously at render time | Real-time validation with error highlighting |
| Preview differs from final output | User loses trust in system | Fidelity scoring, warn when preview may differ |
| No progress indication during LLM generation | User thinks system froze | Streaming updates: "Generating section 2/4..." |
| Sanitization without explainability | User can't verify what was hidden | Show sanitization report: "Replaced 15 IPs, 8 hostnames" |
| No bulk upload progress | User uploads 20 templates, no feedback | Per-template progress, ability to cancel/retry |
| Error messages expose system internals | "Jinja2 TemplateError: undefined variable" confuses users | User-friendly errors: "Template missing required field: client_name" |
| No PT-PT vs PT-BR language selection | System guesses wrong variant | Explicit dropdown: "European Portuguese" vs "Brazilian Portuguese" |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Template Preview:** Preview works but fidelity vs. LibreOffice vs. Word not validated — verify side-by-side comparison testing
- [ ] **Sanitization:** Presidio detects standard PII but custom pentest recognizers missing — verify comprehensive entity coverage
- [ ] **LLM Integration:** LLM generates content but placeholder preservation not validated — verify token counting and syntax validation
- [ ] **Session Management:** Sessions work but concurrent access not tested — verify race condition testing with concurrent users
- [ ] **Audit Logging:** Logs exist but tamper-proofing not implemented — verify write-once storage or cryptographic signing
- [ ] **Translation:** Translation works but PT-PT vs PT-BR not validated — verify native speaker review and terminology checking
- [ ] **Streaming:** Streaming works in testing but reconnection logic missing — verify network interruption handling
- [ ] **Template Upload:** Upload works but security scanning not implemented — verify Jinja2 injection detection
- [ ] **Error Handling:** Happy path works but partial failures not handled — verify resume/retry logic for all async operations
- [ ] **GDPR Compliance:** Features work but data lineage not traceable — verify audit log completeness for regulatory reconstruction

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| python-docx formatting loss | MEDIUM | 1. Identify affected templates via audit log 2. Notify users 3. Offer template redesign guidance or manual conversion |
| Context leakage in LLM output | HIGH | 1. Revoke API keys immediately 2. Audit all processed documents 3. Notify affected clients per GDPR breach protocol 4. Retrain/fine-tune model if applicable |
| Dropped placeholder tokens | MEDIUM | 1. Detect via validation before storage 2. Rollback template to previous version 3. Re-run LLM with stronger constraints 4. Manual placeholder insertion if needed |
| LibreOffice rendering failure | LOW | 1. Fallback to alternative renderer 2. Generate preview warning banner 3. Offer Word-based preview if available |
| Session state corruption | HIGH | 1. Invalidate affected sessions 2. Force re-sanitization from source 3. Audit cross-contamination scope 4. Notify users if data leaked |
| Portuguese variant drift | LOW | 1. Re-run translation with explicit PT-PT constraint 2. Build terminology validator to catch future occurrences |
| Streaming interruption | LOW | 1. Detect timeout/disconnect 2. Resume from last checkpoint if partial stored 3. Fallback to non-streaming mode 4. User retry with preserved state |
| Presidio false negative | CRITICAL | 1. Immediately revoke affected LLM requests if possible 2. Manual review of outputs 3. Update recognizers 4. Client notification per NDA/GDPR |
| Template injection | CRITICAL | 1. Isolate affected container 2. Forensic analysis of uploaded template 3. Audit all templates from same user 4. Patch and deploy template scanner |
| Audit log tampering | CRITICAL | 1. Restore from external SIEM backup 2. Forensic timeline reconstruction 3. Implement tamper detection 4. Regulatory notification if compliance-critical |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| python-docx formatting loss | Phase 1: Template Upload | Side-by-side fidelity comparison, whitelist validation |
| Context leakage sanitization | Phase 1: Sanitization Engine | PrivacyChecker-style inference attack testing |
| LLM placeholder drops | Phase 1: Template Adapter | Placeholder counting, syntax validation, adversarial testing |
| LibreOffice fidelity failures | Phase 1: Preview Generation | Complexity scoring, reference document comparison |
| Session state corruption | Phase 1: Session Architecture | Concurrent user stress testing, race condition detection |
| Portuguese variant drift | Phase 2: Translation Feature | Native speaker review, terminology validation |
| Streaming interruptions | Phase 2: Executive Report | Network interruption simulation, reconnection testing |
| Presidio false negatives | Phase 1: Sanitization Engine | Recall measurement on pentest corpus (target >95%) |
| Template injection | Phase 1: Template Upload *(deprioritized, defense-in-depth)* | Security scanner, penetration testing |
| Audit log incompleteness | Phase 1: Audit Infrastructure | Mock regulatory audit, data lineage reconstruction |

## Sources

### python-docx Limitations
- [Understanding Styles — python-docx Documentation](https://python-docx.readthedocs.io/en/latest/user/styles-understanding.html)
- [How to edit Microsoft Word documents in Python](https://www.rikvoorhaar.com/blog/python_docx)
- [python-docx-template Documentation](https://docxtpl.readthedocs.io/)
- [5 Best Ways to Read Microsoft Word Documents with Python](https://blog.finxter.com/5-best-ways-to-read-microsoft-word-documents-with-python/)

### Presidio Edge Cases
- [PII detection evaluation - Microsoft Presidio](https://microsoft.github.io/presidio/evaluation/)
- [GitHub - microsoft/presidio](https://github.com/microsoft/presidio)
- [Presidio FAQ](https://github.com/microsoft/presidio/blob/main/docs/faq.md)
- [Comparing Medical Text De-identification - John Snow Labs](https://www.johnsnowlabs.com/comparing-john-snow-labs-medical-text-de-identification-with-microsoft-presidio/)

### LLM Placeholder Preservation
- [Template Syntax Basics for LLM Prompts](https://latitude-blog.ghost.io/blog/template-syntax-basics-for-llm-prompts/)
- [From Prompts to Templates: Systematic Analysis](https://arxiv.org/html/2504.02052v2)
- [Templates - LLM Documentation](https://llm.datasette.io/en/stable/templates.html)

### LibreOffice Headless Rendering
- [Layout issue converting DOCX to PDF - Ask LibreOffice](https://ask.libreoffice.org/t/layout-issue-when-converting-to-docx-to-pdf-using-libreoffice-headless/127618)
- [Controlling PDF Export Paper Size - Ask LibreOffice](https://ask.libreoffice.org/t/controlling-pdf-export-paper-size-in-libreoffice-headless-mode/122580)
- [Headless LibreOffice slow to export DOCX to PDF](https://ask.libreoffice.org/t/headless-libreofficewriter-slow-to-export-docx-to-pdf/51995)

### FastAPI Streaming
- [Streaming Response Keeps Breaking - OpenAI Community](https://community.openai.com/t/streaming-response-keeps-on-breaking/823699)
- [Scalable Streaming with FastAPI and asyncio](https://medium.com/@mayvic/scalable-streaming-of-openai-model-responses-with-fastapi-and-asyncio-714744b13dd)
- [How to Stream LLM Responses Using FastAPI and SSE](https://blog.gopenai.com/how-to-stream-llm-responses-in-real-time-using-fastapi-and-sse-d2a5a30f2928)
- [Streaming LLM Responses: Building Real-Time AI Applications](https://dataa.dev/2025/02/18/streaming-llm-responses-building-real-time-ai-applications/)

### Portuguese Variant Challenges
- [LLMs and Translation: Brazilian vs European Portuguese](https://aclanthology.org/2024.propor-1.5/)
- [Benchmark for LLMs on European Portuguese](https://duarteocarmo.com/blog/a-benchmark-for-language-models-on-european-portuguese)
- [Best LLM for Translation in 2026](https://www.hakunamatatatech.com/our-resources/blog/best-llm-for-translation)
- [European vs Brazilian Portuguese Translation](https://www.lingarch.com/blog/european-vs-brazilian-portuguese-translation/)

### Session Management
- [Session Management - OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Testing for Concurrent Sessions - OWASP](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/11-Testing_for_Concurrent_Sessions)
- [Session and State Management in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0)

### Data Sanitization and Context Leakage
- [A False Sense of Privacy: Textual Data Sanitization](https://arxiv.org/html/2504.21035v1)
- [LLM02:2025 Sensitive Information Disclosure - OWASP](https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/)
- [Reducing Privacy Leaks in AI - Microsoft Research](https://www.microsoft.com/en-us/research/blog/reducing-privacy-leaks-in-ai-two-approaches-to-contextual-integrity/)
- [Data Leakage: AI's Plumbing Problem - CrowdStrike](https://www.crowdstrike.com/en-us/blog/data-leakage-ai-plumbing-problem/)
- [ForcedLeak: AI Agent Risks - Noma Security](https://noma.security/blog/forcedleak-agent-risks-exposed-in-salesforce-agentforce/)

### Jinja2 Template Injection
- [Server Side Template Injection with Jinja2 - OnSecurity](https://www.onsecurity.io/blog/server-side-template-injection-with-jinja2/)
- [Template Injection in jinja2 - CVE-2024-56326](https://security.snyk.io/vuln/SNYK-PYTHON-JINJA2-8548181)
- [Template Injection in jinja2 - CVE-2025-27516](https://security.snyk.io/vuln/SNYK-PYTHON-JINJA2-9292516)
- [Understanding Template Injection Vulnerabilities - Palo Alto Networks](https://www.paloaltonetworks.com/blog/cloud-security/template-injection-vulnerabilities/)

### LLM Hallucinations
- [It's 2026. Why Are LLMs Still Hallucinating? - Duke Libraries](https://blogs.library.duke.edu/blog/2026/01/05/its-2026-why-are-llms-still-hallucinating/)
- [LLM Hallucinations in 2025 - Lakera](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models)
- [Why Language Models Hallucinate - OpenAI](https://openai.com/index/why-language-models-hallucinate/)
- [Hallucination Detection and Mitigation in LLMs](https://arxiv.org/pdf/2601.09929)

### GDPR Audit Logging
- [Complete GDPR Compliance Guide (2026-Ready)](https://secureprivacy.ai/blog/gdpr-compliance-2026)
- [LLM Audit and Compliance Best Practices](https://mljourney.com/llm-audit-and-compliance-best-practices/)
- [Audit Logs for LLM Pipelines: Key Practices](https://www.newline.co/@zaoyang/audit-logs-for-llm-pipelines-key-practices--a08f2c2d)
- [Large Language Models GDPR Compliance](https://gdprlocal.com/large-language-models-llm-gdpr/)

### spaCy NER
- [Training Pipelines & Models - spaCy Documentation](https://spacy.io/usage/training)
- [Custom Named Entity Recognition using spaCy v3](https://www.analyticsvidhya.com/blog/2022/06/custom-named-entity-recognition-using-spacy-v3/)
- [How To Train Custom NER Model With SpaCy](https://www.newscatcherapi.com/blog-posts/train-custom-named-entity-recognition-ner-model-with-spacy-v3)

---
*Pitfalls research for: AI-Powered Pentest Report Automation*
*Researched: 2026-02-10*
