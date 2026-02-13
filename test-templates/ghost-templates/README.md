# Ghostwriter Reference Template Catalogue

DEV-ONLY reference templates for LLM placeholder pattern learning. These files are NOT user-facing and NOT loaded into the application at runtime.

## Template Inventory (8 files)

| Template | Language | Placeholders | Filename |
|----------|----------|:------------:|----------|
| Web EN | English | 24 | Web_-_EN_2025_-_v2.0_m6w3nHW_FuwLOkd.docx |
| Web PT (A Cliente) | Portuguese | 24 | Web_-_A_Cliente_-_PT_2025_-_v2.0.docx |
| Web PT (O Cliente) | Portuguese | 24 | Web_-_O_Cliente_-_PT_2025_-_v2.0.docx |
| Internal EN | English | 32 | Interna_-_EN_2025_-_v2.0.docx |
| Internal PT (A Cliente) | Portuguese | 32 | Interna_-_A_Cliente_-_PT_2025_-_v2.0_dnZFPJ2.docx |
| Internal PT (O Cliente) | Portuguese | 32 | Interna_-_O_Cliente_-_PT_2025_-_v2.0_yejFaQl.docx |
| Mobile EN | English | 24 | Mobile_-_EN_2025_v2.0.docx |
| Mobile PT (O Cliente) | Portuguese | 24 | Mobile_-_O_Cliente_-_PT_2025_v2.0.docx |

## Common Placeholder Patterns (All Templates)

| Placeholder | GW GraphQL Source |
|---|---|
| `{{ client.short_name }}` | `report.project.client.shortName` |
| `{{ project.start_date }}` | `report.project.startDate` |
| `{{ project.end_date }}` | `report.project.endDate` |
| `{{ report_date }}` | `report.creation` |
| `{{ team[0].name }}` | `report.project.assignments[0].user.name` |
| `{{ team[0].email }}` | `report.project.assignments[0].user.email` |
| `{{ finding.title }}` | `finding.title` |
| `{{ finding.severity_rt }}` | `finding.severity.severity` (rich text formatted) |
| `{{p finding.description_rt }}` | `finding.description` (HTML) |
| `{{p finding.recommendation_rt }}` | `finding.mitigation` (HTML) |
| `{{p finding.replication_steps_rt }}` | `finding.replication_steps` (HTML) |

## Web and Mobile Additional Placeholders

| Placeholder | GW GraphQL Source |
|---|---|
| `{{ finding.affected_entities_rt }}` | `finding.affectedEntities` (HTML) |
| `{{ finding.classification_rt }}` | `finding.findingType.findingType` |
| `{{ finding.cvss_vector_link_rt }}` | Computed from `finding.cvssVector` |
| `{{p finding.impact_rt }}` | `finding.impact` (HTML) |
| `{{ item.scope }}` | `scope.scope` (via `{%tr for item in scope %}`) |
| `{{ totals.findings }}` | `len(findings)` (computed) |
| `{{ '%02d' % loop.index }}` | Jinja2 loop counter (computed) |

## Internal Template Features (32 placeholders)

The Internal templates add category-based finding grouping using a custom `filter_type()` Jinja2 filter.

Categories: AD, Infrastructure, Physical, Servers, UAC, Web

Uses namespace counters for indexed numbering:
```
{% set ns = namespace(counter=0) %}
```

Internal templates do NOT use scope or affected_entities fields.

## Rich Text Markers

| Marker | Meaning |
|---|---|
| `{{p ... }}` | Paragraph-level rich text: HTML content rendered as DOCX paragraphs |
| `{{r ... }}` | Run-level rich text: HTML content rendered as DOCX runs within a paragraph |
| `{%tr for ... %}` / `{%tr endfor %}` | Table row loop markers |

## PT Template Variants

Portuguese templates come in two grammatical variants (A Cliente / O Cliente) for gendered client references. The placeholder structure is identical to their English counterparts; only the static text content differs.

## Purpose

This catalogue serves as the reference for:
1. GW-to-template data mapping validation (Plan 04-03)
2. LLM prompt engineering for template adaptation (Phase 5)
3. Jinja2 rendering context verification (Plan 04-04)
