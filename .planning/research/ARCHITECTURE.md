# Architecture Patterns

**Domain:** AI-powered document processing and report generation
**Researched:** 2026-02-10
**Confidence:** HIGH

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER (React + TS)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Template     │  │ Report Gen   │  │ Annotation   │  │ Auth/Session │    │
│  │ Adapter UI   │  │ UI           │  │ Canvas       │  │ UI           │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │             │
│         └─────────────────┴─────────────────┴─────────────────┘             │
│                                     │                                        │
│                              SSE/WebSocket                                   │
│                                     │                                        │
├─────────────────────────────────────┴───────────────────────────────────────┤
│                        API GATEWAY LAYER (FastAPI)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Template     │  │ Report       │  │ Annotation   │  │ Auth         │    │
│  │ Endpoints    │  │ Endpoints    │  │ Endpoints    │  │ Middleware   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │             │
├─────────┴─────────────────┴─────────────────┴─────────────────┴─────────────┤
│                         SERVICE LAYER (Business Logic)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐   │
│  │ LLM Service        │  │ Document Service   │  │ Session Service      │   │
│  │ - Streaming        │  │ - PDF Generation   │  │ - Redis Backend      │   │
│  │ - Multi-provider   │  │ - Template Render  │  │ - Mapping Storage    │   │
│  └─────────┬──────────┘  └──────────┬─────────┘  └──────────┬───────────┘   │
│            │                        │                       │               │
│  ┌─────────┴─────────┐  ┌───────────┴─────────┐  ┌──────────┴───────────┐   │
│  │ Sanitization Svc  │  │ Audit Service       │  │ Background Jobs      │   │
│  │ - Presidio        │  │ - Compliance Logs   │  │ - Celery/ARQ         │   │
│  │ - spaCy NER       │  │ - Hash-chain Trail  │  │ - Bulk Processing    │   │
│  └───────────────────┘  └─────────────────────┘  └──────────────────────┘   │
│            │                        │                       │               │
├────────────┴────────────────────────┴───────────────────────┴───────────────┤
│                      INFRASTRUCTURE LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ PostgreSQL   │  │ Redis        │  │ LLM APIs     │  │ External     │    │
│  │ - Session    │  │ - Sessions   │  │ - CLIProxy   │  │ - Ghostwriter│    │
│  │ - Audit Log  │  │ - Job Queue  │  │ - Anthropic  │  │   GraphQL    │    │
│  │ - Templates  │  │ - Cache      │  │ (fallback)   │  │ - LibreOffice│    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        SANITIZATION PIPELINE (Docker)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐        ┌────────────────────┐                       │
│  │ Presidio Analyzer  │───────→│ Presidio Anonymizer│                       │
│  │ (PII Detection)    │        │ (PII Redaction)    │                       │
│  │ - spaCy NER        │        │ - Mapping Store    │                       │
│  │ - Pattern Matching │        │ - Reversible       │                       │
│  └────────────────────┘        └────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **Frontend (React + TS)** | User interface, SSE client, annotation canvas, preview rendering | API Gateway (REST + SSE), Browser storage |
| **API Gateway (FastAPI)** | Request routing, authentication, session validation, SSE orchestration | All service layer components, Redis |
| **LLM Service** | Multi-provider LLM client, streaming responses, prompt formatting, fallback handling | CLIProxyAPI, Anthropic API, Audit Service |
| **Document Service** | .docx manipulation with Jinja2, PDF conversion via LibreOffice, template rendering | File system, LibreOffice headless, PostgreSQL |
| **Sanitization Service** | PII detection and redaction, reversible mapping storage, session-scoped mapping | Presidio containers, Redis, Session Service |
| **Session Service** | Session lifecycle management, sanitization mapping storage, annotation state persistence | Redis, PostgreSQL |
| **Audit Service** | Compliance logging, hash-chain trail, LLM interaction logging, retention policy enforcement | PostgreSQL, Background Jobs |
| **Background Jobs** | Bulk template processing, cleanup tasks, PDF generation queue | Celery/ARQ workers, Redis queue, PostgreSQL |
| **Presidio Analyzer** | Named entity recognition, PII pattern matching, confidence scoring | spaCy models, Presidio Anonymizer |
| **Presidio Anonymizer** | PII redaction/replacement, mapping generation, format-preserving transformation | Redis (mapping storage), Presidio Analyzer |

## Feature-Specific Data Flows

### Feature 1: Template Adapter (LLM-powered Jinja2 Insertion)

```
User uploads .docx → Document Service
                            ↓
                  Parse with python-docx
                            ↓
                  Extract text content
                            ↓
               User provides instructions ────→ LLM Service
                            ↓                        ↓
                  Build prompt with context    Stream to OpenAI/Anthropic
                            ↓                        ↓
                  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ← SSE Stream (Jinja2 suggestions)
                            ↓
                  Collect streamed placeholders
                            ↓
               User reviews annotations ────→ Annotation Service
                            │                        ↓
                            │                  Store feedback
                            │                        ↓
                            └── Refinement loop ──────┘
                            ↓
            Insert Jinja2 tags into .docx
                            ↓
            Render preview with sample data
                            ↓
           Convert to PDF (LibreOffice) ────→ Document Service
                            ↓
           Display pixel-perfect preview
                            ↓
           User downloads template
```

**Key architectural decisions:**
- **python-docx-template (docxtpl)** for Jinja2 insertion: Allows direct manipulation of .docx XML while preserving formatting
- **LibreOffice headless** for PDF conversion: Industry standard for pixel-perfect rendering (not thread-safe, queue required)
- **SSE over WebSocket**: Simpler unidirectional streaming, better proxy compatibility, auto-reconnect
- **Annotation batching**: Collect highlights/comments client-side, batch submit to reduce API calls

### Feature 2: Executive Report Generation (Sanitized LLM Processing)

```
User uploads technical report (.docx) → Document Service
                                              ↓
                                   Extract text with python-docx
                                              ↓
                              ┌───────────────┴────────────────┐
                              ↓                                ↓
                    Sanitization Service              Session Service
                    (Presidio Pipeline)               (Create mapping session)
                              ↓                                ↓
            ┌─────────────────┴────────────────┐               │
            ↓                                  ↓               │
    Presidio Analyzer                  Presidio Anonymizer    │
    (Detect PII entities)              (Generate replacements)│
            ↓                                  ↓               │
    Entity list with confidence        Sanitized text         │
            └──────────────────────────────────┴───────────────┘
                                              ↓
                              Store mapping in Redis (session-scoped)
                                              ↓
                              Send sanitized text to LLM Service
                                              ↓
                              ┌───────────────┴────────────────┐
                              ↓                                ↓
                    CLIProxyAPI (primary)         Anthropic API (fallback)
                              ↓                                ↓
                              └────────→ Stream response ←──────┘
                                              ↓
                              ← ─ ─ ─ ─ SSE Stream (exec summary) ─ ─ ─ ─ →
                                              ↓
                              Collect streamed response
                                              ↓
                              Log full interaction to Audit Service
                                              ↓
                     User reviews output in annotation canvas
                                              ↓
                              Feedback loop (highlight issues)
                                              ↓
                              Refine prompt with annotations
                                              ↓
                              Re-stream from LLM (same session)
                                              ↓
                              Final output ready
                                              ↓
                     Retrieve mapping from Redis (reverse PII)
                                              ↓
                     Insert real PII back into response
                                              ↓
                     Generate .docx with docxtpl
                                              ↓
                     Convert to PDF (LibreOffice queue)
                                              ↓
                     User downloads executive report
```

**Key architectural decisions:**
- **Session-scoped sanitization**: Each user session maintains its own PII mapping in Redis with TTL
- **Reversible mapping architecture**: Presidio Anonymizer generates format-preserving replacements stored as `{entity_id: {original, replacement}}` in Redis
- **Pre-LLM sanitization**: All PII stripped before cloud API access (GDPR/NDA compliance)
- **Hash-chain audit trail**: Every LLM interaction logged with cryptographic integrity (AuditableLLM pattern)
- **Background job for bulk**: Large reports queued in Celery/ARQ to avoid blocking API

## Shared Infrastructure Patterns

### Pattern 1: Streaming Response Architecture

**What:** Server-Sent Events (SSE) for streaming LLM tokens from backend to frontend

**When to use:** All LLM interactions (template suggestions, report generation, refinement loops)

**Trade-offs:**
- **Pros:** Simpler than WebSocket, auto-reconnect, CDN-friendly, HTTP/2 multiplexing
- **Cons:** Unidirectional only (sufficient for this use case)

**Implementation:**

**Backend (FastAPI):**
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
import asyncio

app = FastAPI()

async def llm_token_generator(prompt: str, session_id: str):
    """Stream LLM tokens as SSE events"""
    async for token in llm_service.stream(prompt):
        # Audit log each token (optional: batch for performance)
        await audit_service.log_token(session_id, token)

        # Yield SSE event
        yield {
            "event": "token",
            "data": token,
            "id": session_id
        }

    # Final event signals completion
    yield {
        "event": "done",
        "data": "Stream complete"
    }

@app.get("/api/template/suggest")
async def suggest_placeholders(
    template_id: str,
    session: dict = Depends(get_session)
):
    prompt = build_prompt(template_id, session)
    return EventSourceResponse(
        llm_token_generator(prompt, session['id']),
        media_type="text/event-stream"
    )
```

**Frontend (React + TypeScript):**
```typescript
const useStreamingLLM = (endpoint: string, payload: object) => {
  const [tokens, setTokens] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const startStream = async () => {
    setIsStreaming(true);
    const eventSource = new EventSource(
      `${endpoint}?${new URLSearchParams(payload)}`
    );

    eventSource.addEventListener('token', (event) => {
      setTokens(prev => [...prev, event.data]);
    });

    eventSource.addEventListener('done', () => {
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.addEventListener('error', (err) => {
      console.error('SSE error:', err);
      eventSource.close();
      setIsStreaming(false);
    });
  };

  return { tokens, isStreaming, startStream };
};
```

**Sources:**
- [FastAPI + SSE for LLM Tokens (Medium, Jan 2026)](https://medium.com/@hadiyolworld007/fastapi-sse-for-llm-tokens-smooth-streaming-without-websockets-001ead4b5e53)
- [How to Stream LLM Responses Using FastAPI and SSE (GoPenAI)](https://blog.gopenai.com/how-to-stream-llm-responses-in-real-time-using-fastapi-and-sse-d2a5a30f2928)

### Pattern 2: Session-Scoped Sanitization Mapping

**What:** Store PII mappings in Redis with session-scoped keys and TTL expiration

**When to use:** Executive report generation (Feature 2) - never for template adapter (Feature 1)

**Trade-offs:**
- **Pros:** GDPR-compliant (auto-expiring), reversible, session-isolated, fast lookups
- **Cons:** Memory overhead for large documents (mitigate with compression)

**Implementation:**
```python
from typing import Dict, List
import redis.asyncio as redis
import json
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import RecognizerResult

class SanitizationService:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.analyzer = AnalyzerEngine()
        self.anonymizer = AnonymizerEngine()

    async def sanitize_for_llm(
        self,
        text: str,
        session_id: str,
        ttl_seconds: int = 3600
    ) -> tuple[str, str]:
        """
        Sanitize text and store reversible mapping

        Returns:
            (sanitized_text, mapping_key)
        """
        # Detect PII entities
        analyzer_results = self.analyzer.analyze(
            text=text,
            language='en',
            entities=['PERSON', 'EMAIL_ADDRESS', 'PHONE_NUMBER',
                      'CREDIT_CARD', 'IP_ADDRESS', 'LOCATION']
        )

        # Generate format-preserving replacements
        anonymized_result = self.anonymizer.anonymize(
            text=text,
            analyzer_results=analyzer_results,
            operators={
                "DEFAULT": {"type": "replace"},
                "PERSON": {"type": "replace", "new_value": "PERSON_<ID>"},
                "EMAIL_ADDRESS": {"type": "replace", "new_value": "email<ID>@example.com"}
            }
        )

        # Build reversible mapping
        mapping = {}
        for item in anonymized_result.items:
            mapping[item.operator] = {
                "original": item.text,
                "replacement": item.operator,
                "entity_type": item.entity_type,
                "start": item.start,
                "end": item.end
            }

        # Store in Redis with session-scoped key
        mapping_key = f"sanitization:{session_id}"
        await self.redis.setex(
            mapping_key,
            ttl_seconds,
            json.dumps(mapping)
        )

        return anonymized_result.text, mapping_key

    async def restore_pii(
        self,
        sanitized_text: str,
        session_id: str
    ) -> str:
        """Reverse the sanitization using stored mapping"""
        mapping_key = f"sanitization:{session_id}"
        mapping_json = await self.redis.get(mapping_key)

        if not mapping_json:
            raise ValueError(f"No mapping found for session {session_id}")

        mapping = json.loads(mapping_json)
        restored_text = sanitized_text

        # Reverse replacements (order matters: longest first)
        for item in sorted(mapping.values(),
                          key=lambda x: len(x['replacement']),
                          reverse=True):
            restored_text = restored_text.replace(
                item['replacement'],
                item['original']
            )

        return restored_text
```

**Sources:**
- [Presidio Documentation (Microsoft)](https://microsoft.github.io/presidio/analyzer/)
- [PII Sanitization for LLMs (Kong, 2026)](https://konghq.com/blog/enterprise/building-pii-sanitization-for-llms-and-agentic-ai)
- [Reversible Prompt Sanitization Research (arXiv)](https://arxiv.org/html/2411.11521)

### Pattern 3: Annotation Feedback Loop

**What:** Client-side annotation canvas that batches user feedback for LLM refinement

**When to use:** Both features - template suggestions and executive report review

**Trade-offs:**
- **Pros:** Reduces API calls, preserves context, enables iterative improvement
- **Cons:** Requires state synchronization between client and server

**Implementation:**

**Backend session state:**
```python
from pydantic import BaseModel
from typing import List, Dict, Optional

class Annotation(BaseModel):
    id: str
    text: str  # Highlighted text
    comment: str  # User's feedback
    position: Dict[str, int]  # Start/end character positions
    timestamp: str

class FeedbackSession(BaseModel):
    session_id: str
    original_prompt: str
    llm_response: str
    annotations: List[Annotation]
    iteration: int

class AnnotationService:
    async def submit_batch(
        self,
        session_id: str,
        annotations: List[Annotation]
    ) -> str:
        """
        Store annotations and generate refinement prompt
        """
        # Retrieve session from Redis
        session_key = f"feedback:{session_id}"
        session_data = await self.redis.get(session_key)

        if session_data:
            session = FeedbackSession.parse_raw(session_data)
        else:
            # New feedback session
            session = FeedbackSession(
                session_id=session_id,
                annotations=[],
                iteration=0
            )

        # Append new annotations
        session.annotations.extend(annotations)
        session.iteration += 1

        # Build refinement prompt
        refinement_prompt = self._build_refinement_prompt(session)

        # Store updated session
        await self.redis.setex(
            session_key,
            3600,  # 1 hour TTL
            session.json()
        )

        return refinement_prompt

    def _build_refinement_prompt(self, session: FeedbackSession) -> str:
        """Generate refinement prompt from user annotations"""
        base = f"Original request: {session.original_prompt}\n\n"
        base += f"Your previous response:\n{session.llm_response}\n\n"
        base += "User feedback:\n"

        for ann in session.annotations:
            base += f"- On '{ann.text}': {ann.comment}\n"

        base += "\nPlease revise your response addressing this feedback."
        return base
```

**Frontend annotation canvas:**
```typescript
interface Annotation {
  id: string;
  text: string;
  comment: string;
  position: { start: number; end: number };
  timestamp: string;
}

const AnnotationCanvas: React.FC<{ documentText: string }> = ({ documentText }) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedText, setSelectedText] = useState<string>('');

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      setSelectedText(selection.toString());
      // Show comment dialog
    }
  };

  const addAnnotation = (comment: string) => {
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      text: selectedText,
      comment,
      position: {
        start: range?.startOffset || 0,
        end: range?.endOffset || 0
      },
      timestamp: new Date().toISOString()
    };

    setAnnotations(prev => [...prev, annotation]);
  };

  const submitBatchFeedback = async () => {
    const response = await fetch('/api/annotations/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations })
    });

    const { refinement_prompt } = await response.json();

    // Start new SSE stream with refinement prompt
    startRefinementStream(refinement_prompt);
  };

  return (
    <div onMouseUp={handleTextSelection}>
      <DocumentPreview text={documentText} annotations={annotations} />
      <AnnotationList annotations={annotations} />
      <button onClick={submitBatchFeedback}>
        Refine with Feedback ({annotations.length})
      </button>
    </div>
  );
};
```

**Sources:**
- [Evaluator Reflect-Refine Loop Patterns (AWS)](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/evaluator-reflect-refine-loop-patterns.html)
- [Feedback-Driven AI Optimization (Medium)](https://medium.com/@aartijha96/feedback-driven-ai-the-key-to-building-better-llms-627518e364cc)
- [Real-Time Document Collaboration Architecture (MDPI)](https://www.mdpi.com/2076-3417/14/18/8356)

### Pattern 4: Background Job Queue Architecture

**What:** Celery/ARQ for async processing of heavy tasks (bulk templates, PDF generation)

**When to use:**
- Bulk template processing (>10 templates)
- Large PDF conversions (>50 pages)
- Scheduled cleanup tasks (audit retention, expired sessions)

**Trade-offs:**
- **Pros:** Non-blocking API, scalable workers, retry logic, monitoring
- **Cons:** Added complexity, Redis dependency, debugging harder than sync code

**Implementation:**

**Choice: ARQ over Celery for FastAPI async-native projects**

Why ARQ:
- Built for asyncio from ground up (natural fit for FastAPI)
- Simpler setup than Celery
- Redis-only (already using Redis for sessions)
- Lower overhead for small team (2-5 pentesters)

```python
# tasks.py
from arq import ArqRedis
from arq.connections import RedisSettings
import asyncio

async def generate_pdf_background(ctx: dict, template_id: str, data: dict) -> str:
    """
    Background job for PDF generation using LibreOffice

    LibreOffice is not thread-safe, so serialize via queue
    """
    from services.document_service import DocumentService

    doc_service = DocumentService()

    # Render template with data
    docx_path = await doc_service.render_template(template_id, data)

    # Convert to PDF (LibreOffice headless)
    # This is slow (~2-5 seconds per doc), hence background job
    pdf_path = await doc_service.convert_to_pdf(docx_path)

    # Store result
    await ctx['redis'].setex(
        f"pdf_result:{template_id}",
        3600,  # 1 hour
        pdf_path
    )

    return pdf_path

async def bulk_template_processing(ctx: dict, template_ids: list[str]) -> dict:
    """Process multiple templates in parallel (up to worker limit)"""
    results = {}

    for template_id in template_ids:
        # Enqueue individual PDF jobs
        job = await ctx['redis'].enqueue_job(
            'generate_pdf_background',
            template_id,
            {}  # Empty data for previews
        )
        results[template_id] = job.job_id

    return results

# Worker settings
class WorkerSettings:
    functions = [generate_pdf_background, bulk_template_processing]
    redis_settings = RedisSettings(host='redis', port=6379)
    max_jobs = 3  # LibreOffice concurrency limit
    job_timeout = 300  # 5 min timeout
    keep_result = 3600  # Keep results for 1 hour
```

**API integration:**
```python
from arq import create_pool
from arq.connections import RedisSettings

@app.post("/api/templates/bulk-preview")
async def bulk_preview(
    template_ids: list[str],
    redis_pool: ArqRedis = Depends(get_arq_pool)
):
    """Enqueue bulk PDF generation"""
    job = await redis_pool.enqueue_job(
        'bulk_template_processing',
        template_ids
    )

    return {
        "job_id": job.job_id,
        "status_url": f"/api/jobs/{job.job_id}/status"
    }

@app.get("/api/jobs/{job_id}/status")
async def job_status(
    job_id: str,
    redis_pool: ArqRedis = Depends(get_arq_pool)
):
    """Poll job status"""
    job = await redis_pool.job(job_id)

    if not job:
        raise HTTPException(404, "Job not found")

    result = await job.result()

    return {
        "job_id": job_id,
        "status": job.status,
        "result": result
    }
```

**Sources:**
- [FastAPI Background Tasks Guide (official docs)](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [ARQ vs Celery for FastAPI (2026 comparison)](https://davidmuraya.com/blog/fastapi-background-tasks-arq-vs-built-in/)
- [Complete Guide to FastAPI + Celery (Jan 2026)](https://blog.greeden.me/en/2026/01/27/the-complete-guide-to-background-processing-with-fastapi-x-celery-redishow-to-separate-heavy-work-from-your-api-to-keep-services-stable/)

### Pattern 5: Compliance Audit Trail with Hash-Chain Integrity

**What:** Tamper-evident logging of all LLM interactions using hash-chain architecture

**When to use:** All LLM API calls (required for GDPR/NDA compliance)

**Trade-offs:**
- **Pros:** Cryptographic integrity, regulatory compliance, incident investigation
- **Cons:** Storage overhead, cannot delete logs (only expire)

**Implementation:**
```python
import hashlib
from datetime import datetime, timedelta
from typing import Optional

class AuditLog(BaseModel):
    id: str
    timestamp: datetime
    session_id: str
    user_id: str
    event_type: str  # 'llm_request', 'llm_response', 'sanitization', etc.
    data: dict  # Full prompt/response
    previous_hash: Optional[str]
    current_hash: str

class AuditService:
    def __init__(self, db):
        self.db = db

    async def log_llm_interaction(
        self,
        session_id: str,
        user_id: str,
        prompt: str,
        response: str,
        sanitized: bool = False
    ) -> str:
        """
        Log LLM interaction with hash-chain integrity
        """
        # Get last log entry for this session
        last_log = await self.db.fetch_one(
            "SELECT current_hash FROM audit_logs "
            "WHERE session_id = $1 ORDER BY timestamp DESC LIMIT 1",
            session_id
        )

        previous_hash = last_log['current_hash'] if last_log else None

        # Build log entry
        log_data = {
            "prompt": prompt,
            "response": response,
            "sanitized": sanitized,
            "timestamp": datetime.utcnow().isoformat()
        }

        # Calculate hash
        current_hash = self._compute_hash(
            session_id,
            user_id,
            log_data,
            previous_hash
        )

        # Insert into database
        log_id = await self.db.execute(
            """
            INSERT INTO audit_logs
            (id, timestamp, session_id, user_id, event_type, data,
             previous_hash, current_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            str(uuid.uuid4()),
            datetime.utcnow(),
            session_id,
            user_id,
            'llm_interaction',
            json.dumps(log_data),
            previous_hash,
            current_hash
        )

        return log_id

    def _compute_hash(
        self,
        session_id: str,
        user_id: str,
        data: dict,
        previous_hash: Optional[str]
    ) -> str:
        """SHA-256 hash of log entry + previous hash"""
        hash_input = f"{session_id}{user_id}{json.dumps(data)}{previous_hash or ''}"
        return hashlib.sha256(hash_input.encode()).hexdigest()

    async def verify_chain_integrity(self, session_id: str) -> bool:
        """Verify hash chain for a session"""
        logs = await self.db.fetch_all(
            "SELECT * FROM audit_logs WHERE session_id = $1 ORDER BY timestamp ASC",
            session_id
        )

        previous_hash = None
        for log in logs:
            expected_hash = self._compute_hash(
                log['session_id'],
                log['user_id'],
                json.loads(log['data']),
                previous_hash
            )

            if expected_hash != log['current_hash']:
                return False  # Tampering detected

            previous_hash = log['current_hash']

        return True

    async def enforce_retention_policy(self, days: int = 90):
        """Auto-cleanup logs older than retention period"""
        cutoff = datetime.utcnow() - timedelta(days=days)

        await self.db.execute(
            "DELETE FROM audit_logs WHERE timestamp < $1",
            cutoff
        )
```

**Database schema:**
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    previous_hash VARCHAR(64),
    current_hash VARCHAR(64) NOT NULL,

    INDEX idx_session_timestamp (session_id, timestamp),
    INDEX idx_user_timestamp (user_id, timestamp)
);
```

**Sources:**
- [AuditableLLM: Hash-Chain Framework (MDPI)](https://www.mdpi.com/2079-9292/15/1/56)
- [LLM Audit and Compliance Best Practices (ML Journey)](https://mljourney.com/llm-audit-and-compliance-best-practices/)
- [LLM Guardrails Logging for Compliance](https://cybersierra.co/blog/llm-guardrails-logging/)

## Recommended Project Structure

```
template-ai-engine/
├── frontend/                      # React + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── template/          # Feature 1: Template Adapter UI
│   │   │   │   ├── TemplateUpload.tsx
│   │   │   │   ├── PlaceholderSuggestions.tsx
│   │   │   │   └── PDFPreview.tsx
│   │   │   ├── report/            # Feature 2: Report Generation UI
│   │   │   │   ├── ReportUpload.tsx
│   │   │   │   ├── ExecutiveSummary.tsx
│   │   │   │   └── SanitizationIndicator.tsx
│   │   │   ├── annotation/        # Shared: Annotation canvas
│   │   │   │   ├── AnnotationCanvas.tsx
│   │   │   │   ├── AnnotationList.tsx
│   │   │   │   └── FeedbackDialog.tsx
│   │   │   └── auth/              # Authentication UI
│   │   │       ├── Login.tsx
│   │   │       └── TOTPVerification.tsx
│   │   ├── hooks/
│   │   │   ├── useStreamingLLM.ts # SSE client hook
│   │   │   ├── useAnnotations.ts  # Annotation state management
│   │   │   └── useSession.ts      # Session context
│   │   ├── services/
│   │   │   ├── api.ts             # API client
│   │   │   └── sse.ts             # SSE helper utilities
│   │   └── types/
│   │       ├── template.ts
│   │       ├── annotation.ts
│   │       └── session.ts
│   └── package.json
│
├── backend/                       # FastAPI + Python
│   ├── app/
│   │   ├── main.py               # FastAPI app entry point
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── template.py   # Feature 1 endpoints
│   │   │   │   ├── report.py     # Feature 2 endpoints
│   │   │   │   ├── annotation.py # Annotation endpoints
│   │   │   │   ├── auth.py       # Authentication endpoints
│   │   │   │   └── jobs.py       # Background job status
│   │   │   └── dependencies.py   # Shared dependencies (DB, Redis, session)
│   │   ├── services/
│   │   │   ├── llm_service.py    # Multi-provider LLM client (CLIProxy + Anthropic)
│   │   │   ├── document_service.py # python-docx + LibreOffice
│   │   │   ├── sanitization_service.py # Presidio integration
│   │   │   ├── session_service.py # Redis session management
│   │   │   ├── audit_service.py  # Compliance logging
│   │   │   └── annotation_service.py # Feedback loop logic
│   │   ├── models/
│   │   │   ├── database.py       # SQLAlchemy/asyncpg models
│   │   │   ├── session.py        # Session schemas
│   │   │   └── audit.py          # Audit log schemas
│   │   ├── core/
│   │   │   ├── config.py         # Settings (Pydantic BaseSettings)
│   │   │   ├── security.py       # TOTP, password hashing
│   │   │   └── middleware.py     # Auth, CORS, logging
│   │   └── tasks/
│   │       ├── worker.py         # ARQ worker settings
│   │       └── jobs.py           # Background job definitions
│   ├── tests/
│   │   ├── test_template.py
│   │   ├── test_sanitization.py
│   │   └── test_audit.py
│   └── requirements.txt
│
├── presidio/                      # Presidio Docker setup
│   ├── Dockerfile.analyzer
│   ├── Dockerfile.anonymizer
│   └── config/
│       └── recognizers.yaml      # Custom PII recognizers
│
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── Dockerfile.worker         # ARQ worker
│   └── libreoffice/
│       └── Dockerfile.libreoffice # Headless LibreOffice service
│
├── docker-compose.yml             # Full stack orchestration
├── .env.example
└── README.md
```

### Structure Rationale

- **Frontend modular by feature**: Template and Report UIs are separate, but share annotation components
- **Backend service layer**: Clean separation of concerns (LLM, Document, Sanitization, Audit)
- **Presidio as separate service**: Isolation for PII processing, can scale independently
- **ARQ tasks separate from API**: Background jobs don't pollute API code
- **LibreOffice as Docker service**: Not thread-safe, so dedicated container with queue

## Build Order (Dependency Graph)

Based on component dependencies, suggested build order for roadmap phases:

```
Phase 1: Foundation
    ├── PostgreSQL + Redis setup
    ├── FastAPI skeleton + CORS
    ├── Authentication (TOTP MFA)
    └── Session management (Redis backend)

Phase 2: Core Infrastructure (parallel tracks)
    ├── Track A: LLM Service
    │   ├── CLIProxyAPI client
    │   ├── Anthropic fallback
    │   └── SSE streaming
    │
    └── Track B: Document Service
        ├── python-docx integration
        ├── LibreOffice headless setup
        └── PDF conversion queue

Phase 3: Feature 1 - Template Adapter (depends on Phase 2)
    ├── Template upload endpoint
    ├── Jinja2 insertion with docxtpl
    ├── Frontend annotation canvas
    └── PDF preview pipeline

Phase 4: Sanitization Pipeline (parallel to Phase 3)
    ├── Presidio Analyzer + Anonymizer Docker
    ├── Sanitization service with reversible mapping
    ├── Session-scoped Redis storage
    └── Integration tests

Phase 5: Feature 2 - Report Generation (depends on Phase 3 + 4)
    ├── Technical report upload
    ├── Pre-LLM sanitization flow
    ├── Executive summary generation
    ├── PII restoration
    └── Feedback refinement loop

Phase 6: Compliance & Observability (parallel to Phase 5)
    ├── Audit service with hash-chain
    ├── Retention policy enforcement
    ├── Logging middleware
    └── Compliance dashboard

Phase 7: Production Readiness
    ├── Background jobs (ARQ)
    ├── Bulk processing
    ├── Monitoring (Prometheus/Grafana)
    └── Docker Compose production config
```

**Critical path:** Phase 1 → Phase 2 → Phase 3/4 → Phase 5 → Phase 7

**Parallel work opportunities:**
- Phase 2 Track A and Track B (different developers)
- Phase 3 and Phase 4 (Feature 1 doesn't need sanitization)
- Phase 5 and Phase 6 (compliance can be added retroactively, but should be early)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Sanitization Mappings in Database

**What people do:** Store PII mappings in PostgreSQL for "persistence"

**Why it's wrong:**
- GDPR/NDA violation (data must auto-expire)
- Slower than Redis for session lookups
- Harder to enforce TTL (requires cron jobs)

**Do this instead:** Redis with `SETEX` for automatic expiration after session ends or 1-hour timeout

### Anti-Pattern 2: Synchronous PDF Conversion in API Endpoint

**What people do:** Call LibreOffice directly in FastAPI route handler

**Why it's wrong:**
- LibreOffice is not thread-safe (crashes with concurrent requests)
- Blocks API response for 2-5 seconds per document
- No retry logic if conversion fails

**Do this instead:** ARQ background job queue with dedicated worker pool (max 3 concurrent LibreOffice processes)

### Anti-Pattern 3: Per-Token Audit Logging

**What people do:** Log every SSE token to database individually

**Why it's wrong:**
- Massive write overhead (100s of INSERT per response)
- Database connection pool exhaustion
- Slow down streaming response

**Do this instead:** Buffer tokens in memory, log complete response as single audit entry after stream completes

### Anti-Pattern 4: WebSocket for Unidirectional LLM Streaming

**What people do:** Use WebSocket because "it's real-time"

**Why it's wrong:**
- Overhead of bidirectional protocol when only server→client needed
- Doesn't auto-reconnect on network issues
- Harder to debug than HTTP-based SSE
- Many proxies/CDNs don't handle WebSocket well

**Do this instead:** Server-Sent Events (SSE) with `EventSourceResponse` - simpler, auto-reconnect, HTTP/2 multiplexing

### Anti-Pattern 5: Shared Session for Sanitization Across Users

**What people do:** Store all PII mappings in single Redis hash to "save memory"

**Why it's wrong:**
- Security violation (User A could access User B's mappings)
- Race conditions on concurrent updates
- Cannot isolate TTL per user session

**Do this instead:** Session-scoped keys `sanitization:{session_id}` with individual TTLs

### Anti-Pattern 6: Mixing Sanitized and Unsanitized Data in Same Database

**What people do:** Store both raw technical reports and sanitized versions in same table

**Why it's wrong:**
- Accidental PII leakage if wrong column queried
- Unclear which data is safe to send to LLM
- Audit trail ambiguity

**Do this instead:**
- Never persist raw PII (only process in-memory)
- Store only sanitized text in DB if needed
- Use separate `sanitized_content` table with foreign key to audit log

## Scaling Considerations

| Concern | 2-5 Users (MVP) | 10-20 Users | 50+ Users |
|---------|-----------------|-------------|-----------|
| **Database** | SQLite (initial prototyping) → PostgreSQL | PostgreSQL with connection pooling (10 connections) | PostgreSQL with PgBouncer (100 connections), read replicas |
| **Redis** | Single Redis instance (8GB) | Redis with persistence enabled (RDB snapshots) | Redis Cluster (3 nodes) or Sentinel for HA |
| **LLM API** | CLIProxyAPI primary, Anthropic fallback | Rate limiting (10 req/min per user) | Load balancing across multiple API keys, request queueing |
| **LibreOffice** | 1 worker with queue (max 3 concurrent jobs) | 2 workers (6 concurrent jobs) | Dedicated LibreOffice service cluster, pre-warmed instances |
| **Presidio** | Single Docker container (2 CPU, 4GB RAM) | Horizontal scaling (2-3 replicas) | Separate Analyzer/Anonymizer services, GPU for spaCy NER |
| **SSE Connections** | No special handling | Nginx with `proxy_buffering off` and timeout increase | Redis Pub/Sub for multi-server SSE (if load balanced) |
| **Background Jobs** | 2 ARQ workers (1 for PDF, 1 for cleanup) | 5 ARQ workers with priority queues | Separate worker pools per job type, autoscaling based on queue depth |
| **Audit Logs** | PostgreSQL table with monthly partitions | Partition by month, archive to S3 after 90 days | Time-series DB (TimescaleDB) for high-volume logging |

### Scaling Priorities

1. **First bottleneck: LibreOffice PDF conversion**
   - **Symptom:** API timeouts on bulk template previews
   - **Fix:** Increase ARQ workers from 2 to 5, add Redis queue monitoring
   - **When:** >20 templates processed per hour

2. **Second bottleneck: Presidio NER processing**
   - **Symptom:** Slow sanitization (>5 seconds for large reports)
   - **Fix:** GPU acceleration for spaCy models, increase Presidio container resources
   - **When:** Reports >10 pages or >5 concurrent sanitization requests

3. **Third bottleneck: SSE connection limits**
   - **Symptom:** Nginx 502 errors on concurrent streaming
   - **Fix:** Increase `worker_connections` in Nginx, enable Redis Pub/Sub for multi-server SSE
   - **When:** >10 concurrent LLM streaming sessions

4. **Fourth bottleneck: Audit log write throughput**
   - **Symptom:** Slow INSERT times, database connection pool exhaustion
   - **Fix:** Batch audit writes, switch to TimescaleDB, partition by month
   - **When:** >1000 LLM interactions per day

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **CLIProxyAPI** | HTTP REST client with streaming support | Primary LLM provider, OpenAI-compatible API |
| **Anthropic API** | Official Python SDK with async support | Fallback when CLIProxyAPI unavailable or rate-limited |
| **Ghostwriter GraphQL** | Apollo Client (read-only queries) | Fetch project metadata for dummy data in template previews |
| **LibreOffice Headless** | Subprocess call via `python-libreoffice` | Not thread-safe, requires job queue |
| **Presidio Analyzer** | HTTP REST API (Python client) | PII detection service (separate Docker container) |
| **Presidio Anonymizer** | HTTP REST API (Python client) | PII redaction service (separate Docker container) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Frontend ↔ API Gateway** | REST + SSE over HTTPS | Session cookie for auth, SSE for LLM streaming |
| **API Gateway ↔ Service Layer** | Direct function calls (same process) | FastAPI dependency injection pattern |
| **Service Layer ↔ Redis** | `redis-py` async client | Session storage, job queue, PII mappings |
| **Service Layer ↔ PostgreSQL** | `asyncpg` connection pool | Audit logs, user data, template metadata |
| **Background Jobs ↔ Redis** | ARQ (Redis-based queue) | Job enqueue/dequeue, result storage |
| **Sanitization Service ↔ Presidio** | HTTP REST (retry with exponential backoff) | Critical path - must handle Presidio downtime |

## Sources

### Architecture Frameworks
- [Real-Time Document Collaboration System Architecture (MDPI, 2024)](https://www.mdpi.com/2076-3417/14/18/8356)
- [System Design of Collaborative Editing Tool (Django Stars)](https://djangostars.com/blog/collaborative-editing-system-development/)
- [AuditableLLM: Hash-Chain-Backed Compliance Framework (MDPI)](https://www.mdpi.com/2079-9292/15/1/56)

### Streaming & SSE
- [FastAPI + SSE for LLM Tokens (Medium, Jan 2026)](https://medium.com/@hadiyolworld007/fastapi-sse-for-llm-tokens-smooth-streaming-without-websockets-001ead4b5e53)
- [Streaming AI Agents Responses with SSE (Medium)](https://akanuragkumar.medium.com/streaming-ai-agents-responses-with-server-sent-events-sse-a-technical-case-study-f3ac855d0755)
- [How to Stream LLM Responses Using FastAPI and SSE (GoPenAI)](https://blog.gopenai.com/how-to-stream-llm-responses-in-real-time-using-fastapi-and-sse-d2a5a30f2928)

### Sanitization & Security
- [Microsoft Presidio GitHub](https://github.com/microsoft/presidio)
- [Presidio Official Documentation](https://microsoft.github.io/presidio/analyzer/)
- [PII Sanitization for LLMs (Kong, 2026)](https://konghq.com/blog/enterprise/building-pii-sanitization-for-llms-and-agentic-ai)
- [Reversible Prompt Sanitization (arXiv)](https://arxiv.org/html/2411.11521)
- [LLM Security Risks in 2026 (Sombra)](https://sombrainc.com/blog/llm-security-risks-2026)

### Session Management
- [FastAPI Redis Session (PyPI)](https://pypi.org/project/fastapi-redis-session/)
- [Redis Session Management Best Practices](https://redis.io/solutions/session-management/)
- [FastAPI Server Session GitHub](https://github.com/ahnaf-zamil/fastapi-server-session)

### Background Jobs
- [FastAPI Background Tasks (official docs)](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [Managing Background Tasks: ARQ vs Built-in](https://davidmuraya.com/blog/fastapi-background-tasks-arq-vs-built-in/)
- [Complete Guide to FastAPI + Celery (Jan 2026)](https://blog.greeden.me/en/2026/01/27/the-complete-guide-to-background-processing-with-fastapi-x-celery-redishow-to-separate-heavy-work-from-your-api-to-keep-services-stable/)
- [Asynchronous Tasks with FastAPI and Celery (TestDriven.io)](https://testdriven.io/blog/fastapi-and-celery/)

### Document Processing
- [python-docx-template GitHub](https://github.com/elapouya/python-docx-template)
- [python-docx-template Documentation](https://docxtpl.readthedocs.io/)
- [How to Automate Reports Using docx Templates (Medium)](https://medium.com/@engineering_holistic_ai/how-to-automate-creating-reports-using-docx-templates-bc3cbaae069e)
- [Convert DOCX to PDF with LibreOffice (Medium)](https://medium.com/@jha.aaryan/convert-docx-to-pdf-for-free-a-docker-libreoffice-implementation-guide-cca493831391)

### Compliance & Audit
- [LLM Audit and Compliance Best Practices (ML Journey)](https://mljourney.com/llm-audit-and-compliance-best-practices/)
- [LLM Guardrails Logging for Compliance (CyberSierra)](https://cybersierra.co/blog/llm-guardrails-logging/)
- [AI Audit Trail for Compliance (Medium)](https://medium.com/@kuldeep.paul08/the-ai-audit-trail-how-to-ensure-compliance-and-transparency-with-llm-observability-74fd5f1968ef)

### Feedback Loops
- [Evaluator Reflect-Refine Loop Patterns (AWS)](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/evaluator-reflect-refine-loop-patterns.html)
- [Feedback-Driven AI Optimization (Medium)](https://medium.com/@aartijha96/feedback-driven-ai-the-key-to-building-better-llms-627518e364cc)
- [Self-Refine: Iterative Refinement with Self-Feedback](https://learnprompting.org/docs/advanced/self_criticism/self_refine)

---
*Architecture research for: Template AI Engine*
*Researched: 2026-02-10*
*Confidence: HIGH (verified with current 2026 sources, official documentation, and established patterns)*
