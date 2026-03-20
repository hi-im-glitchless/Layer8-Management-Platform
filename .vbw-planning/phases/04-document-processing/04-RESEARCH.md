# Phase 04: Document Processing -- Research

**Date:** 2026-02-13
**Source:** Live GW introspection, template analysis, codebase audit

## Ghostwriter GraphQL API

### Endpoint & Authentication
- **URL:** `https://localhost/v1/graphql` (dev), dedicated instance in prod
- **Auth:** `Authorization: Bearer <JWT>` header
- **Engine:** Hasura GraphQL over PostgreSQL
- **TLS:** Self-signed cert in dev (need `rejectUnauthorized: false` or equivalent)

### Schema (Verified via Introspection)

**report** (query: `report_by_pk(id)`)
- `id`, `title`, `complete`, `delivered`, `creation`, `last_update`
- `project` -> project relation
- `findings` -> reportedFinding[] (supports `order_by: {position: asc}`)
- `docxTemplate`, `pptxTemplate` -> template relations
- `extraFields` (jsonb)

**project** (nested via report.project)
- `id`, `codename`, `description`, `startDate`, `endDate`, `startTime`, `endTime`, `timezone`
- `client` -> client relation
- `scopes` -> scope[]
- `assignments` -> projectAssignment[]
- `projectType` -> projectType

**client** (nested via project.client)
- `id`, `name`, `shortName`, `address`, `codename`, `description`
- `logo`, `logo_height`, `logo_width`
- `contacts` -> clientContact[]

**reportedFinding** (nested via report.findings)
- `id`, `title`, `position`, `addedAsBlank`, `complete`
- `severity` -> findingSeverity (`severity: String`, `color: String`, `weight: Int`)
- `findingType` -> findingType (`findingType: String`)
- `cvssScore` (float8), `cvssVector` (String)
- `affectedEntities`, `description`, `impact`, `mitigation`, `replication_steps` (all String, contain HTML)
- `references`, `findingGuidance`, `hostDetectionTechniques`, `networkDetectionTechniques`
- `extraFields` (jsonb)

**scope** (nested via project.scopes)
- `id`, `name`, `scope` (the actual scope string), `description`, `disallowed`, `requiresCaution`

**projectAssignment** (nested via project.assignments)
- `id`, `startDate`, `endDate`, `description`
- `user` -> user (`username`, `email`, `name`)
- `projectRole` -> projectRole (`projectRole: String`)

**findingSeverity**: `severity`, `color`, `weight`
**findingType**: `findingType` (String)

### Actual Data (Report ID 1)
```json
{
  "title": "AI Tempalte Engine Penetration Test (2026-02-13) Report",
  "project": {
    "codename": "AMBER YAK",
    "startDate": "2026-02-13",
    "endDate": "2026-12-11",
    "client": { "name": "AI Tempalte Engine", "shortName": "" }
  },
  "findings": [
    { "title": "HSTS", "severity": "High", "findingType": "Cloud", "cvssScore": 6.1 },
    { "title": "mass form", "severity": "Low", "findingType": "Cloud", "cvssScore": 2.2 },
    { "title": "SQLI", "severity": "Critical", "findingType": "Web", "cvssScore": 6.2 },
    { "title": "XSS Reflected", "severity": "Medium", "findingType": "Web", "cvssScore": 5.3 }
  ]
}
```

### generateReport Mutation
- Available but returns 500 (GW action webhook issue -- not a Layer8 problem)
- Returns `reportData` (base64 JSON) and `docxUrl`, `pptxUrl`, `xlsxUrl`
- We will NOT use this mutation; instead, we query raw data via GraphQL and render templates ourselves

### Key Query for Layer8
```graphql
query GetReportData($id: bigint!) {
  report_by_pk(id: $id) {
    id title creation last_update
    project {
      id codename startDate endDate
      client { id name shortName }
      scopes { id scope name }
      assignments {
        user { username email name }
        projectRole { projectRole }
      }
    }
    findings(order_by: {position: asc}) {
      id title position
      severity { severity color weight }
      findingType { findingType }
      cvssScore cvssVector
      affectedEntities description impact
      mitigation replication_steps references
    }
  }
}
```

## Reference Template Jinja2 Placeholders

### Common Across All Templates (Web, Internal, Mobile)
| Placeholder | GW GraphQL Source |
|---|---|
| `{{ client.short_name }}` | `report.project.client.shortName` |
| `{{ project.start_date }}` | `report.project.startDate` |
| `{{ project.end_date }}` | `report.project.endDate` |
| `{{ report_date }}` | `report.creation` |
| `{{ team[0].name }}` | `report.project.assignments[0].user.name` |
| `{{ team[0].email }}` | `report.project.assignments[0].user.email` |
| `{{ finding.title }}` | `finding.title` |
| `{{ finding.severity_rt }}` / `{{r finding.severity_rt }}` | `finding.severity.severity` (with rich text formatting) |
| `{{p finding.description_rt }}` | `finding.description` (HTML->DOCX rich text) |
| `{{p finding.recommendation_rt }}` | `finding.mitigation` |
| `{{p finding.replication_steps_rt }}` | `finding.replication_steps` |

### Web & Mobile Templates (24 placeholders each)
Additional to common:
| Placeholder | GW GraphQL Source |
|---|---|
| `{{ finding.affected_entities_rt }}` | `finding.affectedEntities` |
| `{{ finding.classification_rt }}` | `finding.findingType.findingType` |
| `{{ finding.cvss_vector_link_rt }}` | Computed from `finding.cvssVector` |
| `{{p finding.impact_rt }}` | `finding.impact` |
| `{{ item.scope }}` | `scope.scope` (via `{%tr for item in scope %}`) |
| `{{ totals.findings }}` | `len(findings)` (computed) |
| `{{ '%02d' % loop.index }}` | Jinja2 loop counter (computed) |

### Internal Template (32 placeholders)
Additional features:
- Uses `filter_type()` custom Jinja2 filter to categorize findings by type
- Categories: AD, Infrastructure, Physical, Servers, UAC, Web
- Uses namespace counters (`{% set ns = namespace(counter=0) %}`)
- No scope or affected_entities fields

### PT Templates
Identical placeholder structure to EN counterparts -- only text content differs.

### Rich Text Markers
- `{{p ...}}` -- Paragraph-level rich text (HTML content rendered as DOCX paragraphs)
- `{{r ...}}` -- Run-level rich text (HTML content rendered as DOCX runs within a paragraph)
- `{%tr for ...%}` / `{%tr endfor %}` -- Table row loop markers

## GW Data -> Jinja2 Context Mapping

The rendering context passed to Jinja2 must be:
```python
{
    "client": {"short_name": str},
    "project": {"start_date": str, "end_date": str},
    "report_date": str,
    "team": [{"name": str, "email": str}, ...],
    "findings": [
        {
            "title": str,
            "severity_rt": RichText,  # from severity.severity
            "description_rt": RichText,  # from description HTML
            "impact_rt": RichText,  # from impact HTML
            "recommendation_rt": RichText,  # from mitigation HTML
            "replication_steps_rt": RichText,  # from replication_steps HTML
            "affected_entities_rt": RichText,  # from affectedEntities HTML
            "classification_rt": str,  # from findingType.findingType
            "cvss_vector_link_rt": RichText,  # computed from cvssVector
        }, ...
    ],
    "scope": [{"scope": str}, ...],
    "totals": {"findings": int},
}
```

## Existing Codebase Patterns

### Backend (Node.js/Express/TypeScript)
- **Routes:** `backend/src/routes/{name}.ts` -- Router with Zod validation, delegates to service layer
- **Services:** `backend/src/services/{name}.ts` -- Business logic, external calls
- **Config:** `backend/src/config.ts` -- Zod-validated env vars (already has GW fields as optional)
- **API call pattern:** Backend calls sanitization-service via `fetch()` with JSON payloads

### Frontend (React/Vite/TypeScript)
- **Features:** `frontend/src/features/{domain}/api.ts` + `hooks.ts` + optional `types.ts`
- **Components:** `frontend/src/components/{domain}/ComponentName.tsx` (PascalCase)
- **UI primitives:** `frontend/src/components/ui/` (shadcn components)
- **API client:** `frontend/src/lib/api.ts` -- `apiClient<T>()` with CSRF, `apiUpload<T>()` for FormData
- **State:** TanStack Query for all server state

### Sanitization Service (FastAPI/Python)
- **Routes:** `app/routes/{name}.py` -- APIRouter, delegates to services
- **Services:** `app/services/{name}.py` -- Business logic
- **Models:** `app/models/request.py`, `app/models/response.py` -- Pydantic models
- **Config:** `app/config.py` -- Pydantic BaseSettings with `SANITIZER_` env prefix
- **Tests:** `tests/` with conftest.py fixtures, pytest-asyncio
- **Dependencies already installed:** `python-docx>=1.2.0`, `Pillow>=10.0`, `Jinja2` (via FastAPI)

### Docker
- No docker-compose.yml exists yet -- Gotenberg will be the first Docker service
- Backend runs directly, sanitization service runs directly, Redis runs locally

## Technology Decisions

| Component | Technology | Rationale |
|---|---|---|
| DOCX parse/generate | python-docx (already in requirements.txt) | Best Python DOCX library, already installed |
| PDF generation | Gotenberg (Docker) | LibreOffice wrapper, pixel-perfect, same dev/prod |
| GraphQL client | Node.js backend (graphql-request or raw fetch) | Proxies GW queries, backend handles auth |
| Jinja2 rendering | Python Jinja2 in sanitization-service | Natural fit alongside DOCX processing |
| PDF viewer | react-pdf | pdf.js wrapper, good page navigation |
| File upload | multer (already in backend deps) | Already installed, handles multipart |
| Background queue | BullMQ (Redis-backed) | PDF gen queue, LibreOffice not thread-safe |

## Upload Security Requirements
- Whitelist: `.docx` and `.pdf` only
- Max size: 50MB
- MIME verification (magic bytes, not just extension)
- Randomised filenames (UUID)
- Storage: `backend/uploads/documents/` (outside webroot for API-only access)
- Auto-cleanup on session expiry
