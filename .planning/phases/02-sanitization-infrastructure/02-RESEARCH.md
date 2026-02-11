# Phase 2: Sanitization Infrastructure - Research

**Researched:** 2026-02-11
**Domain:** PII/PHI Detection & Anonymization, NLP-based Entity Recognition, Python Microservices
**Confidence:** HIGH

## Summary

Production-grade PII sanitization requires Microsoft Presidio (analyzer + anonymizer) with spaCy NLP models, custom regex-based recognizers for pentest-specific entities, and FastAPI microservice architecture. The core challenge is balancing false positives (over-detection) against false negatives (missed PII) while maintaining sub-100ms performance for typical documents.

Presidio provides battle-tested infrastructure for 40+ standard PII types (names, emails, credit cards, SSNs) via NLP and pattern matching, but pentest reports require custom recognizers for IP addresses, hostnames, Active Directory objects, and network paths. The reversible mapping requirement means using custom operators rather than built-in encryption, with session-scoped storage in Redis.

Language detection adds complexity: spaCy requires loading separate 500MB+ models (en_core_web_lg, pt_core_news_lg) which take 3-5 seconds on cold start, requiring health/readiness endpoints for orchestration. Image handling in DOCX requires custom extraction/replacement logic, as python-docx doesn't natively support placeholder workflows.

**Primary recommendation:** Use presidio-analyzer 2.2.360 + presidio-anonymizer 2.2.360 with FastAPI 0.128.7, implement custom Replace operator with in-memory mapping storage, delegate to Redis via Node backend for session TTL management, and use fast-langdetect for language detection before model selection.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entity Detection Scope**
- Full standard PII set: names, emails, phone numbers, credit cards, IBANs, SSNs/NIFs, physical addresses, dates of birth (Presidio built-in)
- Custom pentest recognizers for: IP addresses, hostnames (internal FQDNs like .local, .internal, .corp), Active Directory objects (CN=, OU=, DC=), external domains, network paths
- Smart IP detection: detect IPs in prose/tables but skip version strings (e.g., 'OpenSSH 8.2'), CIDR in code blocks, localhost/RFC5737 ranges
- Internal hostnames detected as sensitive entities — most common PII leak in pentest reports
- Code blocks sanitized selectively: IPs, hostnames, and credentials inside code blocks are sanitized, but tool names, flags, and technical syntax are preserved
- Images sanitized: remove images, insert placeholder, restore originals during desanitization (screenshots of client systems, network diagrams contain sensitive data)

**spaCy & Language Support**
- Dual language models: en_core_web_lg (English) and pt_core_news_lg (Portuguese)
- Auto-detect document language and select appropriate model
- spaCy handles fuzzy entities (person names, org names, locations); pentest-specific entities use regex/rule-based recognizers

**Mapping & Placeholder Strategy**
- Typed + indexed placeholder format: [PERSON_1], [IP_ADDR_3], [HOSTNAME_2], [IMAGE_1], etc.
- Consistent mapping: same entity always maps to same placeholder throughout the document (critical for LLM to understand cross-references)
- Session-scoped mappings stored in Redis with TTL matching user session TTL (mappings expire when session expires)
- No mapping export/import for v1 — each sanitization creates fresh mappings

**Pipeline Behavior**
- Python microservice (FastAPI) exposing sanitize/desanitize endpoints, called from Node backend via HTTP
- Low-confidence detections flagged with confidence scores — downstream review UI (Phase 8) lets users approve/dismiss
- Zero PII detected: return clean result with warning ("No PII detected. Verify this is expected.")
- Desanitization completeness validation: after restoring originals, scan output for remaining placeholder tokens — raise error if any found
- Health/readiness endpoint (GET /health): returns model loading status and supported languages; Node backend waits for readiness before routing requests

**Deny List & Custom Terms**
- Deny list runs BEFORE Presidio — exact string matches on known terms take priority over NER
- Case-insensitive matching: 'Acme Corp' matches 'ACME CORP', 'acme corp', etc.
- Word boundary matching: 'Acme' matches 'Acme Corp', 'Acme-Internal' but not 'AcmeticSoft'
- Both global + per-session scope: admin-managed global deny list (stored in DB, auto-applies) plus per-session additions via Phase 8 UI
- Deny list matches tagged as CUSTOM entity type in results

**Testing & Validation**
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

### Deferred Ideas (OUT OF SCOPE)
- Mapping export/import for cross-document consistency within an engagement — future enhancement if users request it
- Per-engagement deny list scoping (grouping documents by client engagement) — requires engagement management concept
- Sanitization review UI (preview, approve/reject entities, highlight missed data) — Phase 8

</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| presidio-analyzer | 2.2.360 | PII entity detection | Microsoft's production-grade PII detector, 40+ built-in recognizers, extensible custom recognizers, battle-tested in enterprise deployments |
| presidio-anonymizer | 2.2.360 | PII replacement/masking | Paired with analyzer, supports multiple operators (replace, redact, hash, encrypt, custom), handles deanonymization |
| FastAPI | 0.128.7 | Python microservice framework | Async-first, auto-generated OpenAPI docs, dependency injection, production-ready with uvicorn ASGI server |
| spaCy | 3.8.x | NLP engine for NER | Industry standard for entity recognition, pre-trained models, fast inference, integrates seamlessly with Presidio |
| en_core_web_lg | 3.8.x | English NER model | Large model (560MB) with highest accuracy for person/org/location detection, recommended for production |
| pt_core_news_lg | 3.8.x | Portuguese NER model | Portuguese equivalent of en_core_web_lg, ensures multilingual support |
| fast-langdetect | 1.x | Language detection | 80x faster than langdetect, 95% accuracy, supports Python 3.9-3.13, uses FastText under hood |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-docx | 1.2.x | DOCX file parsing | Required for reading/writing Word documents, extracting paragraphs/tables/images |
| Pillow | 10.x | Image processing | Needed for handling extracted images from DOCX, placeholder image generation |
| pydantic | 2.x | Request/response validation | FastAPI dependency for data validation, auto-generates JSON schemas |
| uvicorn | 0.34.x | ASGI server | Production server for FastAPI, handles async/await, HTTP/2 support |
| redis-py[async] | 5.2.x | Async Redis client | Session-scoped mapping storage, TTL management, async/await compatible |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Presidio | AWS Comprehend / Google DLP API | SaaS services offer better accuracy/coverage but cost $$, require external API calls, less customizable for pentest-specific entities |
| spaCy | Stanza / Transformers | Stanza (Stanford NLP) more accurate but 5-10x slower; Transformers (BERT) highest accuracy but requires GPU and 100x slower |
| fast-langdetect | langdetect / pycld2 | langdetect 1100x slower (unusable for production); pycld2 fast but Google CLD2 deprecated, limited language support |
| FastAPI | Flask / Django | Flask lacks async and auto-docs; Django too heavy for microservice, WSGI not async-native |

**Installation:**
```bash
# Python environment (>= 3.9, < 3.14)
pip install presidio-analyzer==2.2.360 presidio-anonymizer==2.2.360
pip install fastapi==0.128.7 uvicorn[standard]==0.34.0
pip install spacy==3.8.3
pip install fast-langdetect>=1.0
pip install python-docx==1.2.0 Pillow>=10.0
pip install redis[async]>=5.2.0

# Download spaCy models (560MB each, ~2 minutes download)
python -m spacy download en_core_web_lg
python -m spacy download pt_core_news_lg
```

---

## Architecture Patterns

### Recommended Project Structure
```
sanitization-service/
├── app/
│   ├── main.py                    # FastAPI app + routes
│   ├── config.py                  # Settings (Pydantic BaseSettings)
│   ├── models/
│   │   ├── request.py             # Pydantic request schemas
│   │   └── response.py            # Pydantic response schemas
│   ├── services/
│   │   ├── sanitizer.py           # Core sanitization logic
│   │   ├── language_detector.py   # Language detection
│   │   ├── deny_list.py           # Deny list matching
│   │   └── mapping_manager.py     # Mapping storage/retrieval
│   ├── recognizers/
│   │   ├── base.py                # Custom recognizer base class
│   │   ├── ip_address.py          # IP recognizer
│   │   ├── hostname.py            # Hostname/domain recognizer
│   │   ├── ad_objects.py          # Active Directory recognizer
│   │   └── network_paths.py       # UNC/network path recognizer
│   ├── operators/
│   │   └── custom_replace.py      # Custom Replace operator with mapping
│   ├── processors/
│   │   ├── text.py                # Text sanitization
│   │   ├── docx.py                # DOCX handling
│   │   └── images.py              # Image extraction/restoration
│   └── health.py                  # Health/readiness checks
├── tests/
│   ├── fixtures/
│   │   └── synthetic_reports/     # Synthetic pentest reports
│   ├── test_recognizers.py
│   ├── test_sanitization.py
│   └── test_roundtrip.py
├── Dockerfile
├── requirements.txt
└── README.md
```

### Pattern 1: Startup Model Loading with Health Checks
**What:** Load spaCy models during FastAPI startup event, expose health endpoint that reports loading status
**When to use:** Always — spaCy models take 3-5 seconds to load (560MB each), orchestrator needs to know when service is ready
**Example:**
```python
# Source: https://fastapi.tiangolo.com/advanced/events/ + community patterns
from fastapi import FastAPI, status
import spacy

app = FastAPI()
nlp_models = {}
models_loaded = False

@app.on_event("startup")
async def load_models():
    global nlp_models, models_loaded
    try:
        nlp_models['en'] = spacy.load("en_core_web_lg")
        nlp_models['pt'] = spacy.load("pt_core_news_lg")
        models_loaded = True
    except Exception as e:
        app.logger.error(f"Model loading failed: {e}")
        models_loaded = False

@app.get("/health", status_code=200)
async def health_check():
    if not models_loaded:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unavailable",
                "models_loaded": False,
                "supported_languages": []
            }
        )
    return {
        "status": "healthy",
        "models_loaded": True,
        "supported_languages": list(nlp_models.keys())
    }
```

### Pattern 2: Custom Recognizer with Context-Aware Regex
**What:** PatternRecognizer subclass with regex + context validation, returns confidence scores
**When to use:** For structured patterns (IPs, hostnames, AD objects) where regex alone causes false positives
**Example:**
```python
# Source: https://microsoft.github.io/presidio/analyzer/developing_recognizers/
from presidio_analyzer import PatternRecognizer, Pattern
import re

class IPAddressRecognizer(PatternRecognizer):
    PATTERNS = [
        Pattern(
            name="ipv4_pattern",
            regex=r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b",
            score=0.6  # Base score
        )
    ]

    CONTEXT = ["server", "host", "IP", "address", "network", "subnet"]

    def __init__(self):
        super().__init__(
            supported_entity="IP_ADDRESS",
            patterns=self.PATTERNS,
            context=self.CONTEXT
        )

    def validate_result(self, pattern_text):
        """Filter out version numbers and RFC5737 test ranges"""
        # Skip if preceded by version-like context
        # Skip localhost (127.0.0.1), RFC5737 test ranges (192.0.2.0/24, etc.)
        if pattern_text.startswith("127.") or pattern_text.startswith("192.0.2."):
            return None
        return True  # Return confidence boost if context matches
```

### Pattern 3: Custom Mapping Operator
**What:** Custom AnonymizerEngine operator that maintains consistent entity→placeholder mappings
**When to use:** Required for reversible sanitization where same entity must always map to same placeholder
**Example:**
```python
# Source: https://microsoft.github.io/presidio/anonymizer/adding_operators/
from presidio_anonymizer.entities import OperatorConfig
from typing import Dict

class MappingReplaceOperator:
    """Replace operator that maintains consistent mappings"""

    def __init__(self):
        self.mappings: Dict[str, Dict[str, str]] = {}  # entity_type -> {original: placeholder}
        self.counters: Dict[str, int] = {}  # entity_type -> next_index

    def operate(self, text: str, params: Dict) -> str:
        """Replace text with consistent placeholder"""
        entity_type = params.get("entity_type")

        if entity_type not in self.mappings:
            self.mappings[entity_type] = {}
            self.counters[entity_type] = 0

        # Check if we've seen this value before
        if text in self.mappings[entity_type]:
            return self.mappings[entity_type][text]

        # Create new placeholder
        self.counters[entity_type] += 1
        placeholder = f"[{entity_type}_{self.counters[entity_type]}]"
        self.mappings[entity_type][text] = placeholder

        return placeholder

    def get_mappings(self) -> Dict:
        """Export mappings for storage in Redis"""
        return {
            "mappings": self.mappings,
            "counters": self.counters
        }

    def load_mappings(self, data: Dict):
        """Import mappings from Redis"""
        self.mappings = data.get("mappings", {})
        self.counters = data.get("counters", {})
```

### Pattern 4: Deny List Pre-Processing
**What:** Run exact string matching before Presidio analysis, case-insensitive with word boundaries
**When to use:** Always — deny list takes priority over NER for known client-specific terms
**Example:**
```python
# Pattern based on Presidio custom recognizer patterns
import re
from typing import List, Tuple

class DenyListMatcher:
    def __init__(self, global_terms: List[str], session_terms: List[str] = None):
        self.terms = global_terms + (session_terms or [])
        # Build regex with word boundaries, case-insensitive
        escaped_terms = [re.escape(term) for term in self.terms]
        pattern = r'\b(' + '|'.join(escaped_terms) + r')\b'
        self.regex = re.compile(pattern, re.IGNORECASE)

    def find_matches(self, text: str) -> List[Tuple[str, int, int]]:
        """Returns (matched_text, start, end) tuples"""
        matches = []
        for match in self.regex.finditer(text):
            matches.append((match.group(), match.start(), match.end()))
        return matches
```

### Pattern 5: Language Detection with Model Selection
**What:** Detect document language, select appropriate spaCy model before analysis
**When to use:** Always — using wrong language model drastically reduces NER accuracy
**Example:**
```python
# Source: https://github.com/LlmKira/fast-langdetect
from fast_langdetect import detect_language

def select_nlp_model(text: str, nlp_models: Dict):
    """Detect language and return appropriate spaCy model"""
    # Use first 500 chars for detection (sufficient, faster)
    sample = text[:500]

    lang_result = detect_language(sample)  # Returns {"lang": "en", "score": 0.95}
    detected_lang = lang_result.get("lang")
    confidence = lang_result.get("score", 0.0)

    # Map to model keys
    lang_map = {"en": "en", "pt": "pt"}
    model_key = lang_map.get(detected_lang, "en")  # Default to English

    if confidence < 0.7:
        # Low confidence, log warning and use English default
        logger.warning(f"Low language detection confidence: {confidence}")

    return nlp_models[model_key], detected_lang
```

### Pattern 6: DOCX Image Extraction and Placeholder
**What:** Extract images from DOCX, store with unique IDs, insert text placeholder, restore during desanitization
**When to use:** Always for DOCX — images contain sensitive client infrastructure screenshots
**Example:**
```python
# Source: python-docx documentation + community patterns
from docx import Document
from docx.shared import Inches
import base64

def extract_images(doc_path: str) -> Dict:
    """Extract images and replace with placeholders"""
    doc = Document(doc_path)
    images = {}
    image_counter = 0

    for rel in doc.part.rels.values():
        if "image" in rel.target_ref:
            image_counter += 1
            image_id = f"IMAGE_{image_counter}"

            # Store image bytes
            images[image_id] = {
                "data": base64.b64encode(rel.target_part.blob).decode(),
                "content_type": rel.target_part.content_type,
                "rId": rel.rId
            }

            # Replace with placeholder text (manual approach)
            # Note: python-docx doesn't support direct image->text replacement
            # This requires iterating paragraphs and finding InlineShapes

    return images

def restore_images(doc: Document, images: Dict):
    """Restore images from mapping"""
    for image_id, image_data in images.items():
        # Find placeholder text in document
        # Replace with actual image
        # Note: Requires custom logic to handle InlineShapes
        pass
```

### Anti-Patterns to Avoid
- **Loading spaCy models per request:** Models are 560MB, loading takes 3-5 seconds — load once at startup
- **Synchronous Redis calls in async FastAPI:** Use redis[async] with await, not blocking redis.Redis()
- **Regex-only IP detection without validation:** Matches "999.999.999.999", version strings like "OpenSSH 8.2.1" — validate octet ranges and context
- **Returning 200 OK when models not loaded:** Use 503 Service Unavailable until models ready, orchestrator can't distinguish broken from booting
- **Storing mappings in Python service memory:** Lost on restart, can't scale horizontally — delegate to Redis via Node backend
- **Using Presidio Encrypt operator for reversible mapping:** Encryption is 1:1 but doesn't provide typed placeholders ([PERSON_1] format) — use custom Replace operator

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PII entity recognition | Custom NER model training | Presidio Analyzer | Presidio has 40+ built-in recognizers covering global/regional PII types, battle-tested on production data, supports multiple languages, extensible via custom recognizers |
| Language detection | Custom n-gram models | fast-langdetect (FastText) | FastText models pre-trained on 176 languages, 95% accuracy, 80x faster than alternatives, actively maintained |
| Regex for IP addresses | Hand-written regex | Presidio PatternRecognizer + validation | IPv4/IPv6 edge cases (leading zeros, octet ranges, CIDR notation, IPv6 compression) are complex; Presidio's pattern framework handles context scoring |
| DOCX parsing | XML parsing with zipfile | python-docx | DOCX is complex zip of XML files with relationships, styles, embedded objects; python-docx handles document structure, formatting, images correctly |
| Async web framework | Custom async server | FastAPI | FastAPI provides async/await, dependency injection, auto OpenAPI docs, Pydantic validation, production ASGI server integration — building equivalent is multi-month effort |
| Session TTL management | Custom expiration logic | Redis EXPIRE | Redis handles TTL natively with efficient memory management, active/passive expiration, persistence options, atomicity guarantees |

**Key insight:** PII detection has enormous edge cases (names like "X Æ A-12", international phone formats, OCR noise, contextual disambiguation). Presidio represents years of production hardening. Extending it with custom recognizers is 10x faster than building from scratch and maintains compatibility with future Presidio improvements.

---

## Common Pitfalls

### Pitfall 1: False Positives from Overly-Broad Patterns
**What goes wrong:** IP regex matches version strings ("OpenSSH 8.2.1"), hostname regex matches product names ("internal.com pricing"), person names match common words ("Will", "May", "June")
**Why it happens:** Regex without context validation, NER trained on general text not domain-specific documents
**How to avoid:**
- Use Presidio's confidence scores, filter results below threshold (0.5-0.7 depending on entity)
- Implement context validation in custom recognizers (check surrounding words)
- For IPs: validate octet ranges (0-255), check for version-like context ("OpenSSH X.X.X")
- For hostnames: require TLDs in whitelist (.local, .internal, .corp, .com, .net), check context
**Warning signs:** User complaints about over-redaction, LLM outputs with excessive placeholders, review UI shows many false positives

### Pitfall 2: False Negatives from Incomplete Patterns
**What goes wrong:** Missing PII variations (international phone formats, non-US addresses, IPv6, FQDN variations like "server01.ad.corp.local"), OCR errors in images
**Why it happens:** Custom recognizers only cover common cases, built-in recognizers optimized for US/Western formats
**How to avoid:**
- Test recognizers with synthetic data covering edge cases (see Presidio's presidio-research for datasets)
- Use multiple pattern variations (IPv4 + IPv6, short hostname + FQDN)
- Combine regex patterns with NER (fuzzy matching catches OCR errors)
- Review logs for "No PII detected" warnings on known-sensitive documents
**Warning signs:** User reports of leaked data, "No PII detected" on obviously sensitive reports, low entity counts compared to expected baseline

### Pitfall 3: spaCy Model Loading Blocking Startup
**What goes wrong:** Health endpoint returns 503 for 5-10 seconds during deployment, orchestrator kills container thinking it's failed, restart loop
**Why it happens:** Large models (560MB each) take 3-5 seconds to load, FastAPI startup event runs synchronously
**How to avoid:**
- Set orchestrator readiness probe initial delay to 10 seconds, probe interval to 2 seconds
- Health endpoint checks `models_loaded` flag, returns 503 until true
- Log model loading progress ("Loading en_core_web_lg...", "Loaded 2/2 models")
- Consider pre-loading models into Docker image layer (adds 1.2GB to image size but eliminates startup delay)
**Warning signs:** Container restarts during deployment, 503 errors on /health for >10 seconds, orchestrator logs show failed readiness checks

### Pitfall 4: Mapping Inconsistency Across Requests
**What goes wrong:** Same entity maps to different placeholders in different requests ("10.1.2.3" becomes [IP_ADDR_1] then [IP_ADDR_5]), LLM confused by inconsistent references
**Why it happens:** Mapping stored in service memory, lost between requests or across scaled instances
**How to avoid:**
- Store mappings in Redis keyed by session ID, load before sanitization
- Reset counters from Redis (track highest index per entity type)
- Include session_id in all sanitization requests, validate against Redis
- Don't rely on Python service for state — delegate to Node backend or Redis
**Warning signs:** User reports inconsistent placeholders, mapping counts don't match entity counts, desanitization fails to restore all values

### Pitfall 5: Deny List Not Applied Before Presidio
**What goes wrong:** Client's company name "Acme Corp" detected as ORG with low confidence (0.4), ignored; should be CUSTOM with high confidence (1.0)
**Why it happens:** Presidio analysis runs first, deny list checked after, confidence scores already assigned
**How to avoid:**
- Run deny list matching BEFORE Presidio analyzer
- Create RecognizerResult objects for deny list matches with score=1.0, entity_type="CUSTOM"
- Merge deny list results with Presidio results, deny list takes priority for overlapping spans
- Pre-process text to mask deny list terms before Presidio (less flexible)
**Warning signs:** Review UI shows deny list terms with wrong entity types, deny list terms not consistently replaced, confidence scores <1.0 for known custom terms

### Pitfall 6: Desanitization Completeness Not Validated
**What goes wrong:** Desanitization runs but some placeholders remain ([PERSON_3] in output), data sent to user with placeholders instead of original values
**Why it happens:** Mapping incomplete (lost Redis key), placeholder format inconsistent, regex didn't match all placeholder patterns
**How to avoid:**
- After desanitization, scan output for placeholder pattern regex: `\[([A-Z_]+)_(\d+)\]`
- If matches found, raise error with list of remaining placeholders
- Log comparison: placeholders in input vs. mappings available vs. placeholders after desanitization
- Include desanitization_complete: true/false in response
**Warning signs:** User reports placeholders in outputs, support tickets about "weird codes" in documents, regex shows `\[.*?\]` in production data

### Pitfall 7: Image Handling Not Tested with Real DOCX Structure
**What goes wrong:** Image extraction works on test files but fails on client DOCX (embedded charts, SmartArt, grouped images), images duplicated or lost
**Why it happens:** DOCX images stored in multiple ways (InlineShapes, Shapes, embedded OLE objects), test data doesn't cover all variations
**How to avoid:**
- Test with realistic DOCX samples (screenshots, charts, diagrams, logos)
- Handle multiple image types: InlineShapes (inline with text), Shapes (floating), embedded objects
- Store image metadata (relationship ID, position, size) for accurate restoration
- Log warning when image extraction skips unsupported types
**Warning signs:** User reports missing images after desanitization, images in wrong locations, embedded charts lost, file corruption errors

---

## Code Examples

Verified patterns from official sources and production best practices.

### Custom Recognizer: Active Directory Distinguished Names
```python
# Source: https://microsoft.github.io/presidio/analyzer/developing_recognizers/
from presidio_analyzer import PatternRecognizer, Pattern

class ActiveDirectoryRecognizer(PatternRecognizer):
    """Detects AD Distinguished Names (DN) like CN=User,OU=IT,DC=corp,DC=local"""

    PATTERNS = [
        Pattern(
            name="ad_dn_pattern",
            regex=r'\b(?:CN|OU|DC)=(?:[^,]|\\,)+(?:,(?:CN|OU|DC)=(?:[^,]|\\,)+)*\b',
            score=0.7
        )
    ]

    CONTEXT = ["Active Directory", "LDAP", "DN", "distinguished name", "domain"]

    def __init__(self):
        super().__init__(
            supported_entity="AD_OBJECT",
            patterns=self.PATTERNS,
            context=self.CONTEXT
        )
```

### Sanitization Pipeline with Language Detection
```python
# Source: FastAPI + Presidio official patterns
from fastapi import FastAPI, HTTPException
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from fast_langdetect import detect_language

app = FastAPI()

@app.post("/sanitize")
async def sanitize_text(request: SanitizeRequest):
    # Detect language
    lang_result = detect_language(request.text[:500])
    lang = lang_result.get("lang")

    # Select model
    model_key = "en" if lang not in ["pt"] else lang
    nlp_model = nlp_models[model_key]

    # Analyze
    analyzer = AnalyzerEngine()
    analyzer.registry.add_recognizer(IPAddressRecognizer())
    analyzer.registry.add_recognizer(ActiveDirectoryRecognizer())

    results = analyzer.analyze(
        text=request.text,
        language=model_key,
        entities=request.entities or None
    )

    # Anonymize with custom mapping operator
    anonymizer = AnonymizerEngine()
    mapping_operator = MappingReplaceOperator()

    anonymized = anonymizer.anonymize(
        text=request.text,
        analyzer_results=results,
        operators={"DEFAULT": OperatorConfig("custom_replace", {"operator": mapping_operator})}
    )

    return {
        "text": anonymized.text,
        "entities": [
            {
                "type": r.entity_type,
                "start": r.start,
                "end": r.end,
                "score": r.score
            }
            for r in results
        ],
        "language": lang,
        "mapping_id": request.session_id  # For Redis storage
    }
```

### Health Check with Model Status
```python
# Source: https://fastapi.tiangolo.com/advanced/events/
from fastapi import FastAPI, status
from fastapi.responses import JSONResponse

@app.get("/health")
async def health_check():
    health_status = {
        "status": "healthy" if models_loaded else "unavailable",
        "models": {
            "en_core_web_lg": models_loaded,
            "pt_core_news_lg": models_loaded
        },
        "supported_languages": ["en", "pt"] if models_loaded else []
    }

    status_code = status.HTTP_200_OK if models_loaded else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(status_code=status_code, content=health_status)
```

### Round-Trip Test Pattern
```python
# Source: Testing best practices
import pytest

def test_sanitization_roundtrip():
    """Verify sanitization is fully reversible"""
    original_text = "Contact John Smith at john@acme.com or 10.1.2.3"

    # Sanitize
    sanitized = sanitizer.sanitize(original_text, session_id="test-123")

    # Verify PII removed
    assert "John Smith" not in sanitized.text
    assert "john@acme.com" not in sanitized.text
    assert "10.1.2.3" not in sanitized.text

    # Verify placeholders present
    assert "[PERSON_" in sanitized.text
    assert "[EMAIL_" in sanitized.text
    assert "[IP_ADDR_" in sanitized.text

    # Desanitize
    desanitized = sanitizer.desanitize(sanitized.text, session_id="test-123")

    # Verify exact match
    assert desanitized.text == original_text

    # Verify no placeholders remain
    assert not re.search(r'\[([A-Z_]+)_(\d+)\]', desanitized.text)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| langdetect library | fast-langdetect (FastText) | 2024 | 80x performance improvement, supports Python 3.9-3.13 |
| Synchronous redis-py | redis-py[async] with asyncio | 2020 | Native async/await, no blocking in FastAPI event loop |
| Manual spaCy model downloads | python -m spacy download | 2018 | Automated dependency resolution, version locking |
| Presidio 1.x (separate repos) | Presidio 2.2.x (unified) | 2023 | Single versioning, better analyzer/anonymizer integration |
| spaCy 2.x | spaCy 3.8.x | 2020-2024 | Transformer support, better multilingual models, faster inference |
| Python 3.7 (end-of-life) | Python 3.9-3.13 | 2023 | Type hints improvements, async performance gains, security patches |

**Deprecated/outdated:**
- **aioredis:** Merged into redis-py 4.2.0+ as redis.asyncio, use redis[async] instead
- **FastAPI 0.6x:** Major breaking changes in 0.100+, use 0.128.7 for production stability
- **spacy.load() without error handling:** Can fail silently, always wrap in try/except with logging
- **Presidio standalone image-redactor:** Now integrated into presidio-image-redactor package

---

## Open Questions

1. **How to handle DOCX images with complex embedding (charts, SmartArt)?**
   - What we know: python-docx handles InlineShapes and Shapes, but embedded charts are OLE objects
   - What's unclear: Can we extract/restore OLE objects without corrupting DOCX structure?
   - Recommendation: Test with realistic samples, log warnings for unsupported types, accept limitation for v1 (most pentest screenshots are simple images)

2. **Should Redis connection pool be managed by FastAPI or Node backend?**
   - What we know: FastAPI can use redis[async] directly, but user constraint says "delegate to Redis via Node backend"
   - What's unclear: Does "delegate" mean Node backend makes all Redis calls, or just owns session management?
   - Recommendation: Clarify in planning — Python service could make direct Redis calls for mappings, Node backend manages session TTL separately

3. **How to handle mixed-language documents (English report with Portuguese screenshots)?**
   - What we know: fast-langdetect detects primary language from first 500 chars
   - What's unclear: Will detection fail on mixed documents? Should we run both models?
   - Recommendation: Use primary language detection for initial pass, accept that minority-language entities may have lower accuracy (NER still works cross-language with reduced confidence)

4. **What confidence threshold for entity filtering?**
   - What we know: Presidio returns scores 0.0-1.0, lower = more false positives, higher = more false negatives
   - What's unclear: Optimal threshold for pentest reports (different from general text)
   - Recommendation: Start with 0.5, measure false positive rate during Phase 8 review UI testing, adjust based on user feedback

---

## Sources

### Primary (HIGH confidence)
- [Microsoft Presidio Official Documentation](https://microsoft.github.io/presidio/) - Architecture, components, limitations
- [Presidio Best Practices for Custom Recognizers](https://microsoft.github.io/presidio/analyzer/developing_recognizers/) - Performance requirements, dependency management
- [Presidio Supported Entities](https://microsoft.github.io/presidio/supported_entities/) - Built-in PII types
- [Presidio Anonymizer Documentation](https://microsoft.github.io/presidio/anonymizer/) - Operators, reversibility
- [Presidio FAQ](https://microsoft.github.io/presidio/faq/) - Common issues, false positives/negatives
- [presidio-analyzer PyPI](https://pypi.org/project/presidio-analyzer/) - Version 2.2.360, dependencies
- [FastAPI Official Documentation](https://fastapi.tiangolo.com/) - Startup events, health checks
- [FastAPI Release Notes](https://fastapi.tiangolo.com/release-notes/) - Version 0.128.7 details
- [spaCy Models Documentation](https://spacy.io/usage/models) - Model loading, installation

### Secondary (MEDIUM confidence)
- [Modern FastAPI Architecture Patterns for Scalable Production Systems](https://medium.com/algomart/modern-fastapi-architecture-patterns-for-scalable-production-systems-41a87b165a8b) - Layered architecture, microservice patterns
- [Build Scalable Microservices with FastAPI](https://medium.com/@azizmarzouki/build-scalable-microservices-with-fastapi-architecture-logging-and-config-made-simple-92e35552a707) - Service structure recommendations
- [FastAPI Health Check Endpoint Example](https://www.index.dev/blog/how-to-implement-health-check-in-python) - Health check patterns
- [How to Use Redis Key Expiration Effectively](https://oneuptime.com/blog/post/2026-01-25-redis-key-expiration-effectively/view) - Redis TTL best practices (2026)
- [How to Implement Sliding TTL in Redis](https://oneuptime.com/blog/post/2026-01-26-redis-sliding-ttl/view) - Session TTL patterns (2026)
- [fast-langdetect GitHub](https://github.com/LlmKira/fast-langdetect) - Performance benchmarks, API
- [Python Regular Expression for IP Address Validation: Complete 2026 Guide](https://copyprogramming.com/howto/python-regular-expression-for-ip-address-python) - IP regex patterns
- [Understanding LDAP Attributes: CN, OU, and DC](https://smartupworld.com/what-are-cn-ou-dc-in-an-ldap-search/) - AD DN structure
- [FastAPI + Redis Dependency Injection Example](https://python-dependency-injector.ets-labs.org/examples/fastapi-redis.html) - Async Redis patterns
- [Setting Up Async Redis Client in FastAPI](https://medium.com/@geetansh2k1/setting-up-and-using-an-async-redis-client-in-fastapi-the-right-way-0409ad3812e6) - Connection pooling

### Tertiary (LOW confidence - community observations, needs validation)
- [Working with Images - Python .docx Module](https://www.geeksforgeeks.org/python/working-with-images-python-docx-module/) - Image extraction basics
- [Replace Placeholders in a Word Document Using Python](https://medium.com/@alexaae9/find-and-replace-placeholders-in-a-word-document-using-python-83b80c78236c) - Placeholder patterns
- [Text anonymization with Presidio and Faker](https://medium.com/@olegolego1997/text-anonymization-with-presidio-and-faker-be251f36d5bf) - Custom operator examples
- WebSearch results for pentest report sanitization patterns - No specific 2026 documentation found

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official PyPI versions verified, Presidio/FastAPI extensively documented, spaCy models production-proven
- Architecture: HIGH - FastAPI patterns from official docs, Presidio recognizer patterns from official best practices, Redis patterns from 2026 sources
- Pitfalls: MEDIUM-HIGH - False positive/negative issues documented in Presidio FAQ, spaCy loading issues confirmed in GitHub discussions, mapping consistency based on Redis patterns

**Research date:** 2026-02-11
**Valid until:** 2026-03-15 (30 days - stable ecosystem, Presidio/FastAPI mature projects with infrequent breaking changes)

**Notes:**
- DOCX image handling is the lowest confidence area — python-docx has limited documentation for complex embedded objects, may need experimentation during implementation
- Exact regex patterns for pentest entities (IPs, hostnames, AD objects) need validation with synthetic test data during development
- Redis key structure and mapping storage format are implementation details left to planner's discretion per CONTEXT.md
