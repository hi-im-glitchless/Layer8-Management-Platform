# Template AI Engine — AI-Powered Pentest Report Automation Platform

## Vision Document v1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Feature 1 — Ghostwriter Template Adapter](#4-feature-1--ghostwriter-template-adapter)
5. [Feature 2 — Executive Report Generator](#5-feature-2--executive-report-generator)
6. [System Architecture](#6-system-architecture)
7. [Data Sanitization Pipeline](#7-data-sanitization-pipeline)
8. [LLM Layer — Prompts & Agents](#8-llm-layer--prompts--agents)
9. [Ghostwriter Integration](#9-ghostwriter-integration)
10. [Tech Stack](#10-tech-stack)
11. [UI/UX Design](#11-uiux-design)
12. [Security Considerations](#12-security-considerations)
13. [Development Roadmap](#13-development-roadmap)
14. [Future Features](#14-future-features)
15. [Appendix A — Ghostwriter Template Variable Reference](#appendix-a--ghostwriter-template-variable-reference)
16. [Appendix B — Full Agent Prompts](#appendix-b--full-agent-prompts)
17. [Appendix C — Presidio Custom Recognizer Specifications](#appendix-c--presidio-custom-recognizer-specifications)

---

## 1. Executive Summary

Template AI Engine is an internal web application designed to automate two time-consuming tasks for the offensive security team:

1. **Template Adaptation** — Automatically converting client-provided Word templates into Ghostwriter-compatible templates with correctly placed Jinja2 placeholders, with support for English and European Portuguese (PT-PT).
2. **Executive Report Generation** — Generating executive-level summary reports from finalized technical pentest reports, with full data sanitization to protect sensitive client information before any data reaches the cloud LLM.

The application uses Claude (Opus 4.6) via CliProxyAPI, Presidio + spaCy for data sanitization (Feature 2 only), and integrates with the existing Ghostwriter instance for template preview rendering.

---

## 2. Problem Statement

### 2.1 Template Adaptation Pain

The team uses Ghostwriter for report generation. When clients require custom report templates, the team must manually adapt these templates to include the correct Jinja2 placeholders that Ghostwriter uses to populate vulnerability data, findings, metadata, and other report content. This manual process must be repeated for each report type (web/external, internal, mobile) and each language (English and PT-PT), resulting in significant time investment for every new client template.

### 2.2 Executive Report Demand

Clients increasingly request executive summary reports alongside the technical deliverable. Currently, these are written manually from scratch using the technical report as a reference. This is repetitive, time-consuming, and the output quality varies depending on who writes it and how much time is available.

### 2.3 What This Project Does NOT Address (Yet)

- **Automated report review** — Planned as a future feature. Improving report generation quality in Feature 2 will indirectly reduce review burden.
- **Project planning/management** — Identified as a tooling problem, not an AI problem. To be solved separately with a dedicated project management tool (e.g., Linear, Plane, Taiga) to replace Microsoft Teams Planner.

---

## 3. Solution Overview

### 3.1 Design Principles

- **Human-in-the-loop at every critical step** — The LLM assists, the human approves. No automated output reaches a client without explicit user approval.
- **Minimal data exposure** — Sensitive data is sanitized before leaving the local environment. Only Feature 2 involves sensitive data; Feature 1 works with empty templates (no client data).
- **Iterative feedback** — Both features include chatbox interfaces for the user to request corrections from the LLM before finalizing output.
- **Auditability** — Every generation is logged with inputs, outputs, user identity, modifications, and approvals.
- **Language-aware** — Full support for English and European Portuguese (PT-PT), with explicit handling to avoid Brazilian Portuguese drift.

### 3.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + TS)                    │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Feature 1:          │  │  Feature 2:                  │ │
│  │  Template Adapter     │  │  Executive Report Generator  │ │
│  │  - Upload template    │  │  - Upload technical report   │ │
│  │  - Preview with data  │  │  - Sanitization review       │ │
│  │  - Chat feedback      │  │  - Executive report preview  │ │
│  │  - Download output    │  │  - Chat feedback             │ │
│  │                       │  │  - Download output           │ │
│  └──────────┬───────────┘  └──────────────┬───────────────┘ │
└─────────────┼──────────────────────────────┼────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Python + FastAPI)                  │
│                                                              │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  LLM Wrapper   │  │  Presidio    │  │  Doc Engine     │  │
│  │  (CliProxyAPI) │  │  Pipeline    │  │  (python-docx)  │  │
│  │                │  │  (Feature 2  │  │                 │  │
│  │  - Abstracted  │  │   only)      │  │  - Read .docx   │  │
│  │  - Retry logic │  │              │  │  - Write .docx  │  │
│  │  - Caching     │  │  - Sanitize  │  │  - PDF preview  │  │
│  │  - Swappable   │  │  - Desanitize│  │                 │  │
│  └───────┬────────┘  └──────────────┘  └─────────────────┘  │
│          │                                                   │
│  ┌───────┴────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Agent Router  │  │  Audit Log   │  │  Ghostwriter    │  │
│  │                │  │  (SQLite/    │  │  API Client     │  │
│  │  - Template    │  │   Postgres)  │  │  (read-only)    │  │
│  │    Analyzer    │  │              │  │                 │  │
│  │  - Template    │  │              │  │                 │  │
│  │    Modifier    │  │              │  │                 │  │
│  │  - Executive   │  │              │  │                 │  │
│  │    Generator   │  │              │  │                 │  │
│  │  - Feedback    │  │              │  │                 │  │
│  │    Handler     │  │              │  │                 │  │
│  └───────┬────────┘  └──────────────┘  └────────┬────────┘  │
└──────────┼──────────────────────────────────────┼───────────┘
           │                                      │
           ▼                                      ▼
   ┌───────────────┐                    ┌──────────────────┐
   │  Claude Opus  │                    │  Ghostwriter     │
   │  4.6 via      │                    │  Instance        │
   │  CliProxyAPI  │                    │  (GraphQL API)   │
   └───────────────┘                    └──────────────────┘
```

---

## 4. Feature 1 — Ghostwriter Template Adapter

### 4.1 Overview

Converts client-provided Word templates into Ghostwriter-compatible templates by analyzing the template structure and inserting the correct Jinja2 placeholders. Since templates contain no sensitive client data (only structure, styling, and placeholder text), no sanitization is required. All LLM interactions happen directly.

### 4.2 Core Workflow

```
User uploads             LLM analyzes           LLM inserts          Preview rendered
client .docx     →      structure against   →   Jinja2          →   with dummy
template                 reference templates     placeholders         Ghostwriter data
                                                                          │
                                                                          ▼
                                                                    User reviews
                                                                    preview
                                                                          │
                                                          ┌───────────────┴───────────────┐
                                                          │                               │
                                                          ▼                               ▼
                                                    Looks good                     Issues found
                                                          │                               │
                                                          ▼                               ▼
                                                    User approves              User describes issue
                                                    & downloads                in chatbox
                                                                                          │
                                                                                          ▼
                                                                               LLM corrects
                                                                               & re-renders
                                                                                          │
                                                                                    (loop back
                                                                                    to preview)
```

### 4.3 Detailed Steps

1. **Upload** — User uploads the client's Word template (.docx). Selects the report type (web/external, internal, mobile) and target language(s).

2. **Analysis** — The LLM receives the uploaded template structure along with the corresponding reference template (the team's existing validated template for that report type). The LLM maps sections in the client template to sections in the reference template and determines where each Jinja2 placeholder should be inserted.

3. **Placeholder Insertion** — The LLM generates the adapted template with all Jinja2 placeholders correctly placed. This includes:
   - Report metadata variables (client name, assessment dates, scope, etc.)
   - Finding loops (`{% for finding in findings %}`)
   - Individual finding fields (title, severity, CVSS, description, impact, remediation, evidence)
   - Executive summary section variables
   - Table of contents markers
   - Any conditional blocks (`{% if %}` statements)

4. **Translation (if needed)** — If the source template is in PT-PT and an English version is also needed (or vice versa), the LLM handles translation of static text content while inserting placeholders. The Jinja2 variables remain identical across languages; only the surrounding prose and section headers are translated.

5. **Preview** — The app renders the template using data from a dedicated dummy Ghostwriter project. This dummy project contains:
   - A fake client with fake domains and infrastructure
   - Representative sample vulnerabilities across all severity levels (Critical, High, Medium, Low, Informational)
   - Findings across relevant categories (e.g., OWASP Top 10 for web, network-level for internal)
   - Realistic but entirely fictional data
   
   The preview is rendered as a PDF (server-side conversion via LibreOffice headless) so the user can see exactly how the final report will look when generated from Ghostwriter with real data.

6. **Feedback Loop** — If the preview reveals issues (misplaced placeholders, formatting problems, missing sections), the user describes the issue in a chatbox. The LLM receives the feedback along with the current template state and makes corrections. The preview re-renders. This loop continues until the user is satisfied.

7. **Approval & Download** — User approves the final template and downloads the .docx file ready for upload to Ghostwriter.

### 4.4 Template Modification Sub-Feature

Sometimes the team needs to modify an existing template rather than adapt a completely new one. For example, a client asks for their logo, a different color scheme, or an additional section added to the team's standard template.

**Workflow:**

1. **Select Base** — User selects an existing template from the app's reference template library.
2. **Describe Changes** — User describes the desired modifications in a chatbox (e.g., "Replace the logo with this one, change the header color to #003366, add a Compliance Mapping section after Recommendations"). User can upload assets (logos, images) as part of the request.
3. **LLM Modifies** — The LLM applies the described modifications to the selected base template. This is scoped to modifications of existing templates — not creating entirely new designs from scratch — because programmatic Word formatting (margins, fonts, logo placement) is difficult to get pixel-perfect without iterative refinement.
4. **Preview & Feedback** — Same preview and chatbox feedback loop as the core workflow.
5. **Handoff to Placeholder Pipeline** — Once the user approves the modified template, it feeds into the same placeholder insertion pipeline (steps 2-7 above) to ensure Ghostwriter compatibility.

### 4.5 Reference Template Storage

The app stores the team's existing validated Ghostwriter templates as reference material. These serve two purposes:

- **Ground truth for the LLM** — The LLM uses these as examples of correct placeholder implementation. Rather than working from Ghostwriter documentation alone, it can see concrete examples of how placeholders are structured, where loops go, and how conditional blocks are used.
- **Base templates for modification** — Available for the template modification sub-feature.

Templates are stored in the app's repository or a designated directory and version-controlled with Git. They are organized by report type and language:

```
/templates/reference/
├── web-external/
│   ├── en/template.docx
│   └── pt-pt/template.docx
├── internal/
│   ├── en/template.docx
│   └── pt-pt/template.docx
└── mobile/
    ├── en/template.docx
    └── pt-pt/template.docx
```

---

## 5. Feature 2 — Executive Report Generator

### 5.1 Overview

Generates executive-level summary reports from finalized, reviewed technical pentest reports. Because technical reports contain sensitive client data (IPs, domains, hostnames, usernames, client names, vulnerability details tied to specific infrastructure), all data is sanitized via Presidio + spaCy before reaching the cloud LLM. The user has full visibility and control over the sanitization process.

### 5.2 Core Workflow

```
User uploads              App auto-detects       Presidio              User reviews
finalized technical  →    language          →    sanitizes        →    sanitized
report (.docx)            (EN or PT-PT)          document              version
                                                                          │
                                                          ┌───────────────┴───────────────┐
                                                          │                               │
                                                          ▼                               ▼
                                                   All sensitive              Missed items found
                                                   data covered                       │
                                                          │                            ▼
                                                          ▼                   User highlights
                                                   User approves             missed data,
                                                   sanitization              regenerates
                                                          │                            │
                                                          │                      (loop back)
                                                          ▼
                                                   Sanitized report
                                                   sent to LLM with
                                                   executive template
                                                          │
                                                          ▼
                                                   LLM generates
                                                   executive report
                                                   (sanitized tokens
                                                   preserved)
                                                          │
                                                          ▼
                                                   App desanitizes
                                                   for user preview
                                                          │
                                                          ▼
                                                   User reviews
                                                   desanitized preview
                                                          │
                                                ┌─────────┴──────────┐
                                                │                    │
                                                ▼                    ▼
                                          Looks good           Changes needed
                                                │                    │
                                                ▼                    ▼
                                          User approves       User gives feedback
                                          → final               in chatbox
                                          desanitization             │
                                          → download .docx           ▼
                                                              App re-sanitizes
                                                              feedback → sends
                                                              to LLM → loop
```

### 5.3 Detailed Steps

1. **Upload** — User uploads the finalized technical report (.docx). This is the version that has already been generated by Ghostwriter and reviewed/approved by a senior pentester. The user does NOT pull this from Ghostwriter directly — the reviewed .docx is the authoritative input.

2. **Language Detection** — The app auto-detects the document language (English or PT-PT). This becomes the default output language. The user has the option to override and generate the executive report in the other language, but this is expected to be rare.

3. **Presidio Sanitization** — The app extracts text content from the Word document and runs it through the Presidio pipeline with custom recognizers (see Section 7). All identified sensitive entities are replaced with deterministic placeholder tokens. A mapping dictionary is stored locally:

   ```
   Mapping (stored locally, NEVER sent to LLM):
   {
       "192.168.1.50": "[IP_1]",
       "192.168.1.51": "[IP_2]",
       "dc01.clientcorp.local": "[HOST_1]",
       "app-server.clientcorp.local": "[HOST_2]",
       "clientcorp.com": "[DOMAIN_1]",
       "John Smith": "[PERSON_1]",
       "ClientCorp Ltd": "[ORG_1]",
       ...
   }
   ```

4. **Sanitization Review** — The user previews the sanitized version of the document. Sensitive data appears as placeholders (e.g., `[IP_1]`, `[HOST_3]`). The user checks whether Presidio caught everything. If the user spots missed sensitive information:
   - The user highlights or selects the missed text
   - The app adds it to the sanitization mapping
   - The document is re-sanitized with the updated rules
   - The user reviews again
   
   This loop continues until the user is confident all sensitive data is covered.

5. **User Approves Sanitization** — Explicit approval gate. No data leaves the local environment until this step is completed.

6. **LLM Generation** — The sanitized report is sent to Claude (Opus 4.6) via CliProxyAPI along with:
   - The default executive report template/style guide (see Section 8.4)
   - Explicit instructions to preserve all placeholder tokens in the output
   - Language instructions (default to source language, or override if specified)
   
   The LLM generates the executive report using only the sanitized content. It has no access to the real data.

7. **Placeholder Validation** — Before showing the preview, the app validates that all placeholder tokens from the sanitized input that were referenced in context survive in the LLM's output. If any are missing or mangled, the app flags this for attention.

8. **Desanitized Preview** — The app applies the reverse mapping to produce a desanitized version of the executive report for the user to review. The user sees the report with real client data restored, exactly as it would be delivered.

9. **Feedback Loop** — If the user wants changes:
   - The user describes the change in the chatbox, referencing the desanitized (readable) content
   - The app re-sanitizes the user's feedback text using the same mapping before sending it to the LLM
   - The LLM receives the feedback in sanitized form and adjusts the report
   - The updated output is desanitized for the user to review again
   - This loop continues until the user is satisfied

10. **Final Approval & Download** — User approves the final version. The app performs final desanitization and generates the executive report as a .docx file using the executive report template formatting. The user downloads the file.

### 5.4 Executive Report Template

The app includes a default executive report template that defines the structure, tone, and content expectations for generated reports. This template is used as a style guide for the LLM. Key sections include:

- **Cover Page** — Client name, assessment type, date range, classification
- **Executive Overview** — 1-2 paragraph high-level summary of the engagement and overall security posture
- **Risk Summary** — Visual/tabular summary of findings by severity (Critical/High/Medium/Low/Info counts)
- **Key Findings** — Top findings described in business-impact language, not technical jargon. Focus on what the risk means to the business, not how the exploit works.
- **Strategic Recommendations** — Prioritized recommendations grouped by effort/impact, written for a non-technical audience (C-level, board members)
- **Scope & Methodology** — Brief description of what was tested and how
- **Conclusion** — Overall assessment and suggested next steps

The template can be customized per client if needed. Some clients want a one-pager; others want five pages with charts. The default serves as the baseline.

### 5.5 Language Handling

- **Default behavior:** Output language matches the input technical report language (auto-detected).
- **Override:** User can toggle to the other supported language (EN ↔ PT-PT).
- **PT-PT specificity:** The LLM is explicitly instructed to use European Portuguese (PT-PT), not Brazilian Portuguese. This is enforced in the system prompt with specific vocabulary and phrasing guidance (see Section 8.4).

---

## 6. System Architecture

### 6.1 Deployment Model

Self-hosted via Docker Compose. All components run on an internal server or private cloud instance controlled by the team. The only external network call is to Claude via CliProxyAPI, and by that point (in Feature 2) data is already sanitized.

```
docker-compose.yml
├── frontend        (React app, served via Nginx)
├── backend         (FastAPI application)
├── presidio-analyzer   (Presidio analyzer service)
├── presidio-anonymizer (Presidio anonymizer service)
└── db              (SQLite file or PostgreSQL container)
```

### 6.2 Backend Structure

```
/backend
├── main.py                     # FastAPI app entry point
├── config.py                   # Environment variables, settings
├── /api
│   ├── /routes
│   │   ├── templates.py        # Feature 1 endpoints
│   │   ├── executive.py        # Feature 2 endpoints
│   │   └── audit.py            # Audit log endpoints
│   └── /middleware
│       └── auth.py             # Authentication middleware
├── /agents
│   ├── base.py                 # Base agent class
│   ├── template_analyzer.py    # Feature 1: analyzes and inserts placeholders
│   ├── template_modifier.py    # Feature 1: modifies existing templates
│   ├── executive_generator.py  # Feature 2: generates executive reports
│   └── feedback_handler.py     # Shared: processes user corrections
├── /llm
│   ├── client.py               # Abstracted LLM client (CliProxyAPI today, swappable)
│   ├── prompts.py              # System prompt templates
│   └── cache.py                # Response caching layer
├── /sanitization
│   ├── pipeline.py             # Presidio orchestration
│   ├── custom_recognizers.py   # Pentest-specific entity recognizers
│   └── mapping.py              # Sanitization/desanitization mapping store
├── /documents
│   ├── reader.py               # Word document parsing
│   ├── writer.py               # Word document generation
│   ├── preview.py              # PDF preview generation (LibreOffice headless)
│   └── jinja_renderer.py       # Jinja2 template rendering for preview
├── /ghostwriter
│   └── client.py               # Ghostwriter GraphQL API client (read-only)
├── /storage
│   ├── files.py                # File storage (local/S3)
│   └── audit.py                # Audit log database operations
└── /templates
    └── /reference              # Validated reference templates
        ├── /web-external
        ├── /internal
        └── /mobile
```

### 6.3 LLM Client Abstraction

The LLM layer is abstracted behind a common interface so that CliProxyAPI can be swapped for the official Anthropic API, Bedrock, or any other provider with a single file change.

```python
# /llm/client.py

from abc import ABC, abstractmethod
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class LLMClient(ABC):
    """Abstract base for LLM interactions. Swap implementations without
    touching the rest of the codebase."""

    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        messages: list[dict],
        model: str = "opus-4.6",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> str:
        ...


class CliProxyAPIClient(LLMClient):
    """Current implementation using CliProxyAPI."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key

    async def complete(
        self,
        system_prompt: str,
        messages: list[dict],
        model: str = "opus-4.6",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> str:
        # Implementation with retry logic, exponential backoff,
        # timeout handling, and error reporting.
        # Retries up to 3 times with 2/4/8 second backoff.
        # Returns the LLM response text or raises LLMUnavailableError.
        ...


class AnthropicAPIClient(LLMClient):
    """Fallback implementation using the official Anthropic API.
    Ready to swap in if CliProxyAPI becomes unavailable."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def complete(self, system_prompt, messages, model, max_tokens, temperature):
        # Standard Anthropic SDK implementation
        ...
```

### 6.4 Caching Strategy

To reduce LLM calls and exposure to rate limits/reliability issues:

- **Template analysis results** are cached by file hash. If the same template is uploaded again, the cached analysis is reused.
- **Preview renders** are cached. If no changes have been made since the last render, the cached PDF is served.
- **Feedback loop context** is stored in-memory per session. Each feedback round appends to the conversation history rather than re-sending the full context from scratch.

### 6.5 Error Handling & Graceful Degradation

If the LLM (CliProxyAPI) is unavailable:

- **Feature 1:** Users can still upload templates and view them. The analysis/placeholder insertion step shows a clear "LLM temporarily unavailable" message with retry option. No data is lost.
- **Feature 2:** Users can still upload reports and run the Presidio sanitization step (which is entirely local). The LLM generation step queues the request and notifies the user when the service is back, or allows manual retry.
- All in-progress work (uploads, sanitization approvals, feedback history) is preserved across LLM outages.

---

## 7. Data Sanitization Pipeline

### 7.1 Scope

The sanitization pipeline applies **only to Feature 2** (Executive Report Generator). Feature 1 works with empty templates that contain no sensitive client data.

### 7.2 Pipeline Architecture

```
Technical Report (.docx)
        │
        ▼
┌─────────────────────┐
│  Document Parser     │    Extract text content from .docx
│  (python-docx)       │    preserving paragraph/section structure
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Presidio Analyzer   │    Run NER + custom recognizers
│  + spaCy NLP engine  │    Identify all sensitive entities
│  + Custom recognizers│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Presidio Anonymizer │    Replace entities with deterministic
│                      │    placeholder tokens
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Mapping Store       │    Persist original ↔ placeholder mapping
│  (per-session,       │    locally. NEVER sent to LLM.
│   in-memory + disk)  │
└─────────┬───────────┘
          │
          ▼
   Sanitized Document
   (ready for user review)
```

### 7.3 Custom Recognizers

Standard Presidio recognizers cover common PII (names, emails, phone numbers, credit cards). For pentest reports, the following custom recognizers are required:

| Recognizer | Pattern / Logic | Example Matches |
|-----------|----------------|-----------------|
| `InternalIPRecognizer` | RFC1918 ranges + custom client ranges | `192.168.1.50`, `10.0.0.1`, `172.16.5.200` |
| `HostnameRecognizer` | Regex for FQDN patterns, especially `.local`, `.internal`, `.corp` suffixes | `dc01.clientcorp.local`, `app-server.internal` |
| `DomainRecognizer` | Domain name patterns beyond standard URL detection | `clientcorp.com`, `client-staging.net` |
| `NetworkPathRecognizer` | UNC paths and file shares | `\\fileserver\share`, `\\dc01\sysvol` |
| `FilePathRecognizer` | Linux/Windows file paths that may contain sensitive context | `/opt/app/config/db.conf`, `C:\Users\admin\` |
| `UsernameRecognizer` | Common username patterns in pentest context | `admin@clientcorp.com`, `svc_backup`, `CLIENTCORP\jsmith` |
| `ProjectCodeRecognizer` | Client project codes/identifiers (configurable per engagement) | `PRJ-2025-0042`, `CLIENTCORP-PT-Q1` |
| `ActiveDirectoryRecognizer` | AD domain patterns, DN strings | `CN=John Smith,OU=Users,DC=clientcorp,DC=local` |
| `CVSSVectorRecognizer` | Preserves CVSS vectors (should NOT be sanitized, but needs to be recognized to be left alone) | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` |

### 7.4 Per-Project Deny List

On top of pattern-based recognizers, each engagement may have client-specific terms that must be sanitized but don't match any pattern. The app supports a configurable deny list per generation session:

- Client company name and subsidiaries
- Internal tool names or proprietary system names
- Project codenames
- Environment names (staging, prod hostnames)
- Employee names that appeared in the report

The user can add to this deny list during the sanitization review step.

### 7.5 Placeholder Token Format

Tokens follow a consistent, deterministic format:

```
[ENTITY_TYPE_N]

Examples:
[IP_1], [IP_2], [IP_3]
[HOST_1], [HOST_2]
[DOMAIN_1]
[PERSON_1], [PERSON_2]
[ORG_1]
[PATH_1], [PATH_2]
[USERNAME_1]
[PROJECT_1]
```

The format is chosen to be:
- Easily distinguishable from normal text
- Unambiguous for the LLM to preserve in output
- Simple to regex-match for validation and desanitization

### 7.6 Desanitization

Reverse mapping is applied by simple string replacement using the stored mapping dictionary. The app validates:
- All placeholder tokens in the LLM output exist in the mapping
- No original sensitive values appear in the LLM output (defense against LLM hallucinating real-looking data)
- The desanitized output reads naturally (no broken sentences around replaced tokens)

---

## 8. LLM Layer — Prompts & Agents

### 8.1 Model Configuration

- **Model:** Claude Opus 4.6 (via CliProxyAPI)
- **Temperature:** 0.3 for template analysis and placeholder insertion (precision matters), 0.5 for executive report generation (some creative flexibility for business language), 0.3 for feedback handling (precision for corrections)
- **Max tokens:** 4096 default, adjustable per task
- **Fallback model:** Claude Sonnet 4.5 can be used as a cost/speed fallback for template analysis tasks if rate limits are hit on Opus

### 8.2 Agent Overview

Each "agent" is a specialized system prompt + context package. There is no complex agent framework — just well-crafted prompts dispatched by the backend based on the task.

| Agent | Purpose | Used In |
|-------|---------|---------|
| `template_analyzer` | Analyzes uploaded templates, maps sections to Ghostwriter variables, inserts Jinja2 placeholders | Feature 1 (core) |
| `template_modifier` | Modifies existing templates based on user descriptions | Feature 1 (sub-feature) |
| `executive_generator` | Generates executive reports from sanitized technical reports | Feature 2 (core) |
| `feedback_handler` | Processes user feedback and applies corrections to any prior output | Feature 1 & 2 (shared) |

### 8.3 Prompt: Template Analyzer Agent

```
SYSTEM PROMPT — template_analyzer
═══════════════════════════════════

You are a Ghostwriter template specialist. Your task is to analyze a client-
provided Word document template and insert the correct Jinja2 placeholders so
that the template is fully compatible with Ghostwriter's report generation
engine.

## Context

You will receive:
1. The structure and content of the client's Word template (section headers,
   paragraph text, table structures, etc.)
2. A reference template — an existing, validated Ghostwriter-compatible
   template for the same report type. Use this as your primary guide for
   where and how to place placeholders.
3. The Ghostwriter template variable documentation (provided below).
4. The report type: one of [web-external, internal, mobile].
5. The target language(s): English, PT-PT, or both.

## Your Task

1. Analyze each section of the client template and identify its purpose
   (e.g., executive summary, scope, findings list, methodology, etc.).
2. Map each section to the corresponding section in the reference template.
3. Insert the appropriate Jinja2 placeholders from the Ghostwriter variable
   set. Preserve the client template's visual structure, formatting, and
   section ordering — only replace content areas with the correct variables.
4. For sections that contain lists of findings, insert the correct
   {% for finding in findings %} loop structure with all required finding
   fields.
5. For conditional content, use {% if %} blocks as demonstrated in the
   reference template.
6. If the client template has sections that do not exist in the reference
   template, preserve them as static content (no placeholders needed).
7. If the client template is missing sections that are present in the
   reference template and contain critical placeholders (e.g., findings
   loop), flag this to the user with a note explaining what is missing and
   suggesting where to add it.

## Translation Rules (if applicable)

If you are asked to produce a template in a different language from the source:
- Translate ALL static text (section headers, boilerplate paragraphs,
  labels, table headers) to the target language.
- DO NOT translate Jinja2 variables or template logic. These remain identical
  across all languages.
- For Portuguese, use ONLY European Portuguese (PT-PT). Never use Brazilian
  Portuguese. Key differences to observe:
  - Use "segurança" not "seguridade"
  - Use "vulnerabilidade" not "vulnerabilidad"
  - Use "relatório" not "relatório" (same, but phrasing around it differs)
  - Use "recomendação" not "recomendação" (same word, but sentence
    construction differs)
  - Verb conjugation: use "tu" form and mesoclisis where appropriate
  - Use "telemóvel" not "celular"
  - Use "ecrã" not "tela"
  - General: prefer formal register, technical terminology consistent with
    PT-PT cybersecurity industry standards.

## Output Format

Return the complete template content with all Jinja2 placeholders correctly
inserted. For each placeholder you insert, include a brief inline comment
(using Jinja2 comment syntax {# comment #}) explaining what data it pulls.

If you encounter ambiguity about where a placeholder should go, explain your
reasoning and ask the user to confirm.

## Ghostwriter Template Variables Reference

{GHOSTWRITER_VARIABLES_DOCUMENTATION}

## Reference Template

{REFERENCE_TEMPLATE_CONTENT}

## Client Template to Adapt

{CLIENT_TEMPLATE_CONTENT}

## Report Type

{REPORT_TYPE}

## Target Language(s)

{TARGET_LANGUAGES}
```

### 8.4 Prompt: Executive Report Generator Agent

```
SYSTEM PROMPT — executive_generator
═════════════════════════════════════

You are a cybersecurity executive report writer. Your task is to produce a
polished, professional executive summary report from a technical penetration
testing report. Your audience is non-technical: C-level executives, board
members, and senior management who need to understand business risk, not
technical exploits.

## Context

You will receive:
1. A sanitized technical penetration testing report. All sensitive data
   (IPs, hostnames, domains, names, organizations) has been replaced with
   placeholder tokens like [IP_1], [HOST_3], [ORG_1], etc.
2. The executive report template/style guide (structure and tone expectations).
3. The target language: English or PT-PT.

## CRITICAL RULES

1. **PRESERVE ALL PLACEHOLDER TOKENS EXACTLY.** Every token like [IP_1],
   [HOST_3], [DOMAIN_1], [PERSON_2], [ORG_1], etc. must appear in your
   output EXACTLY as written. Do not:
   - Remove any placeholder token
   - Modify any placeholder token
   - Combine or merge placeholder tokens
   - Invent new placeholder tokens not present in the input
   - Replace placeholder tokens with descriptive text
   If you reference an asset, system, or entity from the report, use the
   exact placeholder token provided.

2. **WRITE FOR A NON-TECHNICAL AUDIENCE.** Translate technical findings into
   business risk language:
   - Instead of "SQL injection in the login form": "A critical vulnerability
     was identified that could allow unauthorized access to the application
     and its underlying data."
   - Instead of "Missing HTTP security headers": "Several configuration
     weaknesses were found that reduce the application's resilience against
     common web-based attacks."
   - Focus on IMPACT (data breach, financial loss, regulatory exposure,
     reputational damage), not MECHANISM (the exploit technique).

3. **PRIORITIZE BY BUSINESS IMPACT.** Order and emphasize findings by their
   real-world business consequence, not just CVSS score. A Medium-severity
   finding that exposes customer PII may warrant more executive attention
   than a High-severity finding on an isolated test system.

4. **BE CONCISE.** Executives have limited time. Every sentence should
   deliver value. Avoid repetition, filler, and unnecessary technical
   context.

## Executive Report Structure

Follow this structure unless the user specifies otherwise:

### 1. Cover Page
- Client: [ORG_1] (or relevant organization placeholder)
- Assessment type and date range
- Classification level
- Prepared by: [your organization name — this will be provided]

### 2. Executive Overview (1-2 paragraphs)
- What was tested (scope summary in plain language)
- Why it was tested (compliance, risk management, client request)
- Overall security posture assessment (strong/moderate/weak with
  justification)
- Most significant risks identified (1-2 sentence preview)

### 3. Risk Summary
- Total findings by severity (Critical: X, High: X, Medium: X, Low: X,
  Informational: X)
- Overall risk rating with brief justification
- Comparison to industry benchmarks if applicable

### 4. Key Findings (top 3-5 findings)
For each:
- Finding title (business-friendly language)
- Business impact (what could happen if exploited)
- Affected area (using placeholder tokens)
- Risk level
- Recommended action (one sentence, non-technical)

### 5. Strategic Recommendations
- Grouped by priority (immediate, short-term, long-term)
- Each recommendation tied to specific findings
- Effort/impact indication where possible
- Written as actionable items for management

### 6. Scope & Methodology (brief)
- What was in scope
- Testing methodology (1-2 sentences, e.g., "OWASP Testing Guide",
  "network penetration testing following PTES")
- Any limitations or constraints

### 7. Conclusion
- Restate overall posture
- Emphasize most critical next steps
- Offer to discuss findings in detail

## Language Rules

Target language: {TARGET_LANGUAGE}

If PT-PT:
- Use ONLY European Portuguese. Never use Brazilian Portuguese.
- Use formal register appropriate for executive communication.
- Key terminology:
  - "Resumo Executivo" (not "Sumário Executivo")
  - "Vulnerabilidade" (standard)
  - "Recomendações" (standard)
  - "Avaliação de Segurança" (not "Teste de Segurança" in executive context)
  - "Risco Crítico / Elevado / Médio / Baixo" for severity levels
  - "Âmbito" for "Scope"
  - "Metodologia" for "Methodology"
  - "Conclusão" for "Conclusion"
- Sentence construction: prefer formal conjugations, avoid colloquialisms.
- If translating from an English source, do not produce a literal
  translation — write naturally in PT-PT executive language.

If English:
- Use formal business English appropriate for executive communication.
- Avoid jargon, acronyms without expansion, or overly casual tone.

## Executive Report Style Guide

{EXECUTIVE_TEMPLATE_CONTENT}

## Sanitized Technical Report

{SANITIZED_TECHNICAL_REPORT}
```

### 8.5 Prompt: Template Modifier Agent

```
SYSTEM PROMPT — template_modifier
══════════════════════════════════

You are a Word document template designer for cybersecurity reports. Your
task is to modify an existing report template based on user instructions.

## Context

You will receive:
1. The current template structure and content.
2. The user's modification instructions (natural language description of
   desired changes).
3. Any uploaded assets (logos, images) referenced by the user.

## Your Task

Apply the requested modifications to the template while:
- Preserving the overall professional quality of the document
- Maintaining consistent formatting (fonts, spacing, heading hierarchy)
- Keeping any existing Jinja2 placeholders intact and functional
- Ensuring the modified template remains valid and well-structured

## Scope of Modifications

You can handle:
- Logo replacement (swap header/footer/cover page logos)
- Color scheme changes (headers, accent colors, table styling)
- Section additions (add new sections with appropriate formatting)
- Section removals or reordering
- Header/footer modifications
- Table of contents adjustments
- Font changes
- Page layout adjustments (margins, orientation)
- Adding/modifying boilerplate text

You should flag to the user if a requested change would:
- Break existing Jinja2 placeholder functionality
- Significantly alter the document structure in a way that might affect
  Ghostwriter compatibility
- Require capabilities beyond Word template modification (e.g., complex
  dynamic charts)

## Output

Return the complete modified template content. Clearly note all changes
made so the user can verify each modification in the preview.

## Current Template

{CURRENT_TEMPLATE_CONTENT}

## User Instructions

{USER_MODIFICATION_INSTRUCTIONS}

## Uploaded Assets

{UPLOADED_ASSETS_IF_ANY}
```

### 8.6 Prompt: Feedback Handler Agent

```
SYSTEM PROMPT — feedback_handler
═════════════════════════════════

You are an assistant that processes user feedback to correct and improve
a previously generated document. You work in the context of cybersecurity
report automation.

## Context

You will receive:
1. The current version of the document (the output you or another agent
   previously generated).
2. The conversation history (previous feedback rounds, if any).
3. The user's new feedback describing what needs to change.

## Rules

1. Apply ONLY the changes the user requests. Do not make unsolicited
   modifications to other parts of the document.
2. If the feedback is ambiguous, ask for clarification rather than guessing.
3. Preserve all existing Jinja2 placeholders (Feature 1) or sanitization
   placeholder tokens like [IP_1], [HOST_3] (Feature 2) exactly as they
   are, unless the user explicitly asks to change their placement.
4. Maintain the document's formatting, structure, and style consistency.
5. After making changes, briefly summarize what you modified so the user
   can verify.

## For Feature 2 (Executive Reports) — Additional Rule

The user's feedback text has been re-sanitized before reaching you. The
user wrote their feedback referencing real data, but you will see it with
the same placeholder tokens used in the report. This is expected. Treat
the placeholder tokens as the actual entity names and apply the feedback
accordingly.

## Current Document

{CURRENT_DOCUMENT}

## Conversation History

{FEEDBACK_HISTORY}

## User Feedback

{USER_FEEDBACK}
```

---

## 9. Ghostwriter Integration

### 9.1 Purpose

The Ghostwriter integration serves one purpose: providing realistic data for Feature 1 template previews. It is read-only and accesses a single dedicated dummy project.

### 9.2 Dummy Project Specification

A permanent project in the Ghostwriter instance with:

- **Client:** "Acme Corporation" (fictional)
- **Domains:** `acme-corp.com`, `staging.acme-corp.com`, `acme-corp.local`
- **Infrastructure:** Mix of IPs, hostnames, servers
- **Findings:** 10-15 representative vulnerabilities spanning:
  - All severity levels (2 Critical, 3 High, 4 Medium, 3 Low, 2 Info)
  - Various categories (injection, authentication, configuration, etc.)
  - Complete data for each finding (title, severity, CVSS vector/score, description, impact, affected assets, evidence/screenshots, remediation)
- **Report metadata:** Assessment dates, scope description, methodology notes, assessor names

This project is maintained as a fixture and updated only when Ghostwriter's data model changes.

### 9.3 API Integration

Ghostwriter uses a GraphQL API. The app needs:

```python
# /ghostwriter/client.py

class GhostwriterClient:
    """Read-only client for Ghostwriter GraphQL API.
    Only used to fetch dummy project data for template previews."""

    def __init__(self, base_url: str, api_token: str, dummy_project_id: int):
        self.base_url = base_url
        self.api_token = api_token
        self.dummy_project_id = dummy_project_id

    async def get_preview_data(self) -> dict:
        """Fetches all data from the dummy project needed to render
        a template preview. Returns a dict matching Ghostwriter's
        Jinja2 template variable structure."""
        # GraphQL query to fetch:
        # - Project metadata (client, dates, scope)
        # - All findings with full details
        # - Infrastructure/targets
        # Returns data structured to match Ghostwriter's template
        # variable schema exactly
        ...
```

Configuration via environment variables:

```
GHOSTWRITER_URL=https://ghostwriter.internal.example.com
GHOSTWRITER_API_TOKEN=<token>
GHOSTWRITER_DUMMY_PROJECT_ID=1
```

---

## 10. Tech Stack

### 10.1 Summary

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| Frontend | React + TypeScript | 18.x | Rich UI needs (upload, preview, chat, diff views) |
| UI Library | shadcn/ui | Latest | Clean, accessible components with Tailwind |
| Backend | Python + FastAPI | 3.11+ / 0.100+ | Presidio/spaCy native, python-docx, async support |
| LLM Client | CliProxyAPI | Latest | Claude Opus 4.6 access via Max subscription |
| LLM Fallback | Anthropic Python SDK | Latest | Ready to swap in if CliProxyAPI fails |
| Sanitization | Presidio + spaCy | Latest | PII detection with custom recognizer support |
| Doc Manipulation | python-docx | Latest | Read/write/modify Word documents |
| Doc Preview | LibreOffice Headless | Latest | Server-side .docx → PDF conversion |
| Template Rendering | Jinja2 | 3.x | Render Ghostwriter templates with dummy data |
| Database | SQLite (start) → PostgreSQL (scale) | — | Audit logs, session state |
| File Storage | Local filesystem (start) → S3/MinIO (scale) | — | Uploaded files, generated outputs |
| Containerization | Docker + Docker Compose | Latest | Self-hosted deployment |
| Web Server | Nginx | Latest | Frontend serving, reverse proxy to backend |
| Authentication | SSO/AD integration or local accounts | — | User identity for audit trail |

### 10.2 Python Dependencies

```
# requirements.txt (core)
fastapi>=0.100.0
uvicorn>=0.23.0
python-docx>=0.8.11
python-multipart>=0.0.6
jinja2>=3.1.0
presidio-analyzer>=2.2.0
presidio-anonymizer>=2.2.0
spacy>=3.7.0
httpx>=0.25.0           # For CliProxyAPI and Ghostwriter API calls
pydantic>=2.0.0
python-jose>=3.3.0      # JWT for auth
aiosqlite>=0.19.0       # Async SQLite
```

### 10.3 Node Dependencies (Frontend)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "@radix-ui/react-*": "latest",
    "tailwindcss": "^3.4.0",
    "lucide-react": "latest",
    "react-dropzone": "latest",
    "react-pdf": "latest",
    "axios": "latest"
  }
}
```

---

## 11. UI/UX Design

### 11.1 Layout

Two-tab interface:
- **Tab 1: Template Adapter** (Feature 1)
- **Tab 2: Executive Report** (Feature 2)

Shared header with app logo, user identity, and navigation to audit log.

### 11.2 Feature 1 UI Flow

```
┌──────────────────────────────────────────────────────────┐
│  Template Adapter                                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Step 1: Upload & Configure                         │  │
│  │                                                     │  │
│  │  [  Drop .docx here or click to upload  ]           │  │
│  │                                                     │  │
│  │  Report Type:  ○ Web/External  ○ Internal  ○ Mobile │  │
│  │  Language:     ○ English  ○ PT-PT  ○ Both           │  │
│  │                                                     │  │
│  │  Mode:  ○ Adapt new template                        │  │
│  │         ○ Modify existing template [select ▼]       │  │
│  │                                                     │  │
│  │                          [ Analyze Template → ]     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐  │
│  │  Preview Panel       │  │  Chat Panel               │  │
│  │                      │  │                            │  │
│  │  (PDF preview of     │  │  Agent: I've placed all   │  │
│  │   rendered template  │  │  placeholders. The         │  │
│  │   with dummy         │  │  findings loop starts in   │  │
│  │   Ghostwriter data)  │  │  Section 4...              │  │
│  │                      │  │                            │  │
│  │                      │  │  You: The severity table   │  │
│  │                      │  │  is misaligned, move it    │  │
│  │                      │  │  to after the finding      │  │
│  │                      │  │  title                     │  │
│  │                      │  │                            │  │
│  │                      │  │  Agent: Done. Updated      │  │
│  │                      │  │  preview rendering...      │  │
│  │                      │  │                            │  │
│  │                      │  │  [  Type feedback...    ]  │  │
│  └──────────────────────┘  └───────────────────────────┘  │
│                                                           │
│  [ ← Back ]                    [ Approve & Download ↓ ]   │
└──────────────────────────────────────────────────────────┘
```

### 11.3 Feature 2 UI Flow

```
┌──────────────────────────────────────────────────────────┐
│  Executive Report Generator                               │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Step 1: Upload Technical Report                    │  │
│  │                                                     │  │
│  │  [  Drop .docx here or click to upload  ]           │  │
│  │                                                     │  │
│  │  Detected Language: English  [ Override ▼ ]         │  │
│  │                                                     │  │
│  │                          [ Sanitize Report → ]      │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Step 2: Review Sanitization                        │  │
│  │                                                     │  │
│  │  ┌─────────────────────────────────────────────┐    │  │
│  │  │  Sanitized Document Preview                 │    │  │
│  │  │                                             │    │  │
│  │  │  ... [ORG_1] engaged our team to perform    │    │  │
│  │  │  a penetration test on [DOMAIN_1]. The      │    │  │
│  │  │  domain controller [HOST_1] at [IP_1] was   │    │  │
│  │  │  found to be vulnerable to...               │    │  │
│  │  │                                             │    │  │
│  │  │  [ Highlight missed sensitive data ]        │    │  │
│  │  └─────────────────────────────────────────────┘    │  │
│  │                                                     │  │
│  │  Sanitization Summary:                              │  │
│  │  IPs: 12 found | Hosts: 8 found | Domains: 3 found │  │
│  │  Persons: 5 found | Orgs: 2 found                  │  │
│  │                                                     │  │
│  │  [ ← Re-sanitize ]          [ Approve & Generate ]  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐  │
│  │  Executive Report    │  │  Chat Panel               │  │
│  │  Preview             │  │                            │  │
│  │  (desanitized view)  │  │  Agent: Executive report   │  │
│  │                      │  │  generated. 3 critical     │  │
│  │  ClientCorp Ltd      │  │  findings highlighted...   │  │
│  │  engaged our team... │  │                            │  │
│  │                      │  │  You: Add more detail on   │  │
│  │                      │  │  the business impact of    │  │
│  │                      │  │  the AD compromise         │  │
│  │                      │  │                            │  │
│  │                      │  │  Agent: Updated. The AD    │  │
│  │                      │  │  section now includes...   │  │
│  │                      │  │                            │  │
│  │                      │  │  [  Type feedback...    ]  │  │
│  └──────────────────────┘  └───────────────────────────┘  │
│                                                           │
│  [ ← Back ]                    [ Approve & Download ↓ ]   │
└──────────────────────────────────────────────────────────┘
```

---

## 12. Security Considerations

### 12.1 Data Flow Classification

| Data Type | Sensitivity | Leaves Local Environment? |
|-----------|------------|---------------------------|
| Client Word templates (Feature 1) | Low — no client data | Yes — sent to LLM directly |
| Reference templates | None — internal tooling | No |
| Dummy Ghostwriter project data | None — fictional | No (used locally for preview) |
| Technical reports (Feature 2) | HIGH — full client data | **Never** — only sanitized version leaves |
| Sanitized report text | Low — no identifiable data | Yes — sent to LLM |
| Sanitization mapping | HIGH — links placeholders to real data | **Never** — stored locally only |
| Executive report (sanitized) | Low — no identifiable data | Exists in LLM context during generation |
| Executive report (desanitized) | HIGH — full client data | No — generated locally from mapping |
| User feedback text (Feature 2) | Potentially high | Re-sanitized before sending to LLM |
| Audit logs | Medium — contains user actions | No — stored locally |

### 12.2 Network Security

- The application runs on an internal server, accessible only within the corporate network or via VPN.
- HTTPS is enforced for all connections, even internal ones.
- The only outbound connection is to CliProxyAPI (Claude). This connection should be restricted via firewall rules to only the CliProxyAPI endpoint.
- Ghostwriter API calls are internal (server to server within the same network).

### 12.3 Authentication & Authorization

- Integrate with existing SSO/Active Directory for user authentication.
- All users are members of the offensive security team — no role-based access control is needed initially.
- Every action (upload, sanitization approval, generation, feedback, final approval, download) is logged with the authenticated user's identity.

### 12.4 Data Retention

- Uploaded technical reports are deleted from the server after the generation session ends (or after a configurable TTL, e.g., 24 hours).
- Sanitization mappings are deleted with the session.
- Generated executive reports are stored until downloaded, then deleted (or retained per policy).
- Audit logs are retained indefinitely (they contain metadata, not sensitive content).
- Template files (Feature 1) can be retained longer as they contain no sensitive data.

---

## 13. Development Roadmap

### Phase 1 — Foundation (Weeks 1-2)

**Goal:** Core infrastructure, end-to-end skeleton.

- [ ] Initialize repository with project structure
- [ ] Set up Docker Compose (FastAPI backend, React frontend, Nginx)
- [ ] Implement FastAPI skeleton with health check, file upload/download endpoints
- [ ] Implement LLM client abstraction with CliProxyAPI integration
- [ ] Implement retry logic, timeout handling, error reporting in LLM client
- [ ] Set up python-docx reading and writing utilities
- [ ] Set up LibreOffice headless for PDF preview generation
- [ ] Create basic React frontend with two-tab layout and file upload
- [ ] Implement basic authentication (can be simple token-based initially)
- [ ] Set up SQLite audit log schema and basic logging

### Phase 2 — Feature 1 Core (Weeks 3-4)

**Goal:** Template analysis and placeholder insertion working end-to-end.

- [ ] Store reference templates in the app (web/external, internal, mobile × EN, PT-PT)
- [ ] Implement template content extraction (read uploaded .docx structure)
- [ ] Build template_analyzer agent with system prompt
- [ ] Implement Jinja2 placeholder insertion into .docx files
- [ ] Build PDF preview pipeline (adapted template → rendered PDF)
- [ ] Implement template download endpoint
- [ ] Build frontend: upload flow, configuration options, preview panel
- [ ] Test with real client templates (anonymized)

### Phase 3 — Feature 1 Complete (Weeks 5-6)

**Goal:** Full Feature 1 with preview, feedback, and template modification.

- [ ] Set up Ghostwriter dummy project with representative data
- [ ] Implement Ghostwriter GraphQL API client (read-only)
- [ ] Build Jinja2 rendering pipeline (template + dummy data → preview)
- [ ] Implement chat feedback loop (frontend chat UI + feedback_handler agent)
- [ ] Build template modification sub-feature (template_modifier agent)
- [ ] Implement EN ↔ PT-PT translation in template adaptation
- [ ] End-to-end testing of full Feature 1 workflow
- [ ] Team demo and feedback collection

### Phase 4 — Feature 2 Core (Weeks 7-9)

**Goal:** Executive report generation with sanitization pipeline.

- [ ] Set up Presidio + spaCy in Docker Compose
- [ ] Implement standard Presidio recognizers configuration
- [ ] Build all custom recognizers (IP, hostname, domain, path, username, AD, project code)
- [ ] Implement sanitization pipeline (extract text → analyze → anonymize → mapping store)
- [ ] Build sanitization preview UI (show sanitized doc, highlight controls)
- [ ] Implement user highlight-and-add-to-deny-list flow
- [ ] Build executive_generator agent with system prompt
- [ ] Implement placeholder survival validation
- [ ] Implement desanitization for preview
- [ ] Build executive report .docx generation with template formatting
- [ ] Build frontend: upload, sanitization review, executive report preview

### Phase 5 — Feature 2 Complete + Polish (Weeks 10-12)

**Goal:** Full Feature 2 with feedback loop, audit trail, production-ready polish.

- [ ] Implement chat feedback loop with re-sanitization of user feedback
- [ ] Implement language auto-detection and override
- [ ] Build executive report template customization (per-client overrides)
- [ ] Complete audit trail implementation (all actions logged with full metadata)
- [ ] Implement versioning (track all generations and modifications per session)
- [ ] Implement data retention policies (auto-cleanup of sensitive files)
- [ ] Security review of full pipeline (verify no sensitive data leakage)
- [ ] End-to-end testing with real reports (sanitized before testing with LLM)
- [ ] Performance testing (large reports, multiple concurrent users)
- [ ] Team-wide deployment and training
- [ ] Documentation (user guide, admin guide, troubleshooting)

---

## 14. Future Features

These features are identified but out of scope for the initial release. They can be added incrementally as the platform matures.

### 14.1 Automated Technical Report Review (Priority: High)

An LLM-powered first-pass QA layer for technical reports. Would check:
- Severity ratings align with CVSS scores
- Reproduction steps are present and clear
- Remediation recommendations are appropriate and complete
- Writing style consistency across findings (especially when multiple pentesters contribute)
- Grammar and language quality (EN and PT-PT)
- Completeness against a configurable checklist

Shares the sanitization pipeline with Feature 2. Would be implemented as a new agent with its own system prompt.

### 14.2 Bulk Template Generation

Generate all language variants and report types from a single client template in one operation, rather than running the adaptation for each variant separately.

### 14.3 Template Version Management

Track template versions over time. When Ghostwriter updates its variable schema, automatically identify which templates need updates and what changes are required.

### 14.4 Executive Report Templates Library

A library of executive report style templates that users can choose from, tailored to different client expectations (one-pager, detailed five-page, board presentation format, compliance-focused, etc.).

### 14.5 Direct Ghostwriter Integration for Feature 2

Instead of manual upload, pull the finalized technical report directly from Ghostwriter once it's marked as reviewed/approved. This requires a more robust Ghostwriter integration and workflow state tracking.

---

## Appendix A — Ghostwriter Template Variable Reference

This section should be populated with the complete Ghostwriter template variable documentation from:
https://www.ghostwriter.wiki/features/reporting/report-templates/word-template-variables

Key variable categories to include:

- **Report-level variables:** Client name, assessment type, dates, scope, methodology, assessors
- **Finding loop:** `{% for finding in findings %}` with all finding fields
- **Finding fields:** title, severity, severity_color, cvss_score, cvss_vector, description, impact, recommendation, replication_steps, references, affected_entities, evidence/screenshots
- **Conditional blocks:** `{% if %}` for optional sections
- **Filters and formatting:** Date formatting, text transformations
- **Infrastructure variables:** Targets, domains, servers

*Note: Populate this section from the live Ghostwriter documentation during implementation. The documentation URL is: https://www.ghostwriter.wiki/features/reporting/report-templates/word-template-variables*

---

## Appendix B — Full Agent Prompts

All agent system prompts are documented in Section 8 (Sections 8.3 through 8.6). During implementation, these prompts should be:

1. Stored as versioned template files in `/backend/llm/prompts/`
2. Loaded dynamically with variable substitution at runtime
3. Version-tracked in Git alongside the codebase
4. Updated based on testing feedback and prompt engineering iterations

Prompt file structure:

```
/backend/llm/prompts/
├── template_analyzer.md
├── template_modifier.md
├── executive_generator.md
└── feedback_handler.md
```

Each prompt file contains the raw system prompt with `{VARIABLE}` placeholders that are substituted at runtime by the agent orchestration layer.

---

## Appendix C — Presidio Custom Recognizer Specifications

### C.1 InternalIPRecognizer

```python
from presidio_analyzer import PatternRecognizer, Pattern

internal_ip_recognizer = PatternRecognizer(
    supported_entity="INTERNAL_IP",
    name="InternalIPRecognizer",
    patterns=[
        Pattern(
            name="rfc1918_10",
            regex=r"\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
            score=0.9,
        ),
        Pattern(
            name="rfc1918_172",
            regex=r"\b172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}\b",
            score=0.9,
        ),
        Pattern(
            name="rfc1918_192",
            regex=r"\b192\.168\.\d{1,3}\.\d{1,3}\b",
            score=0.9,
        ),
    ],
    supported_language="en",
)
```

### C.2 HostnameRecognizer

```python
hostname_recognizer = PatternRecognizer(
    supported_entity="HOSTNAME",
    name="HostnameRecognizer",
    patterns=[
        Pattern(
            name="internal_fqdn",
            regex=r"\b[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\."
                  r"(local|internal|corp|lan|intranet|ad|domain)"
                  r"(\.[a-zA-Z]{2,})?\b",
            score=0.85,
        ),
        Pattern(
            name="server_naming",
            regex=r"\b(dc|srv|app|web|db|mail|dns|fw|gw|vpn|rdp|fs|nas|san)"
                  r"[0-9]{1,3}(\.[a-zA-Z0-9\.\-]+)?\b",
            score=0.7,
        ),
    ],
    supported_language="en",
)
```

### C.3 NetworkPathRecognizer

```python
network_path_recognizer = PatternRecognizer(
    supported_entity="NETWORK_PATH",
    name="NetworkPathRecognizer",
    patterns=[
        Pattern(
            name="unc_path",
            regex=r"\\\\[a-zA-Z0-9\.\-]+\\[a-zA-Z0-9\$\.\-\\]+",
            score=0.9,
        ),
        Pattern(
            name="linux_sensitive_path",
            regex=r"/(?:etc|opt|var|home|root|srv)/[a-zA-Z0-9\./\-_]+",
            score=0.6,
        ),
    ],
    supported_language="en",
)
```

### C.4 ActiveDirectoryRecognizer

```python
ad_recognizer = PatternRecognizer(
    supported_entity="AD_OBJECT",
    name="ActiveDirectoryRecognizer",
    patterns=[
        Pattern(
            name="distinguished_name",
            regex=r"(?:CN|OU|DC)=[^,]+(?:,(?:CN|OU|DC)=[^,]+)+",
            score=0.95,
        ),
        Pattern(
            name="domain_user",
            regex=r"\b[A-Z][A-Z0-9\-]{1,15}\\[a-zA-Z0-9\.\-_]+\b",
            score=0.8,
        ),
    ],
    supported_language="en",
)
```

### C.5 DomainRecognizer

```python
domain_recognizer = PatternRecognizer(
    supported_entity="DOMAIN_NAME",
    name="DomainRecognizer",
    patterns=[
        Pattern(
            name="fqdn",
            regex=r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+"
                  r"(?:com|net|org|io|co|pt|uk|de|fr|es|eu|gov|edu|mil|"
                  r"info|biz|xyz|tech|cloud|dev|app|security)\b",
            score=0.75,
        ),
    ],
    supported_language="en",
)
```

### C.6 Registration of Custom Recognizers

```python
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import SpacyNlpEngine

def build_analyzer() -> AnalyzerEngine:
    """Build Presidio analyzer with all custom recognizers."""
    nlp_engine = SpacyNlpEngine(models=[
        {"lang_code": "en", "model_name": "en_core_web_lg"},
        {"lang_code": "pt", "model_name": "pt_core_news_lg"},
    ])

    analyzer = AnalyzerEngine(nlp_engine=nlp_engine)

    # Register all custom recognizers
    analyzer.registry.add_recognizer(internal_ip_recognizer)
    analyzer.registry.add_recognizer(hostname_recognizer)
    analyzer.registry.add_recognizer(network_path_recognizer)
    analyzer.registry.add_recognizer(ad_recognizer)
    analyzer.registry.add_recognizer(domain_recognizer)
    # Add more as needed

    return analyzer
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-10 | — | Initial vision document |

---

*This document captures the complete vision for Template AI Engine as discussed and agreed. It should be treated as a living document, updated as implementation reveals new requirements or the team's needs evolve.*
