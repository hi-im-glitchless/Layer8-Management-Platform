import type { GWReport } from '@/types/ghostwriter.js';

/**
 * Jinja2 template context structure expected by the reference DOCX templates.
 * Field names use snake_case to match Jinja2 placeholder conventions.
 */
export interface TemplateContext {
  client: { short_name: string };
  project: { start_date: string; end_date: string };
  report_date: string;
  team: Array<{ name: string; email: string }>;
  findings: Array<{
    title: string;
    severity: string;
    severity_color: string;
    finding_type: string;
    cvss_score: number;
    cvss_vector: string;
    affected_entities: string;
    description: string;
    impact: string;
    recommendation: string;
    replication_steps: string;
    references: string;
  }>;
  scope: Array<{ scope: string }>;
  totals: { findings: number };
}

/**
 * Formats a date string (ISO or YYYY-MM-DD) into a display-friendly format.
 * Returns the original string if parsing fails.
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

/**
 * Transforms a Ghostwriter report into the Jinja2 template context
 * format expected by the reference DOCX templates.
 *
 * Rich text fields (description, impact, etc.) contain HTML from GW.
 * The actual HTML-to-DOCX rich text conversion happens in the Python
 * Jinja2 renderer (docx_generator), not here. This mapper passes
 * HTML strings through as-is.
 *
 * @param report - Parsed GWReport from the GraphQL client.
 * @returns TemplateContext ready for Jinja2 rendering.
 */
export function mapReportToTemplateContext(report: GWReport): TemplateContext {
  const client = {
    short_name: report.project.client.shortName || report.project.client.name,
  };

  const project = {
    start_date: formatDate(report.project.startDate),
    end_date: formatDate(report.project.endDate),
  };

  const reportDate = formatDate(report.creation);

  const team = (report.project.assignments || []).map((a) => ({
    name: a.user.name || a.user.username,
    email: a.user.email || '',
  }));

  // Sort findings by severity weight descending (Critical → High → Medium → Low),
  // then by CVSS score descending as tiebreaker within the same severity.
  const sortedFindings = [...(report.findings || [])].sort((a, b) => {
    const wA = a.severity?.weight ?? 0;
    const wB = b.severity?.weight ?? 0;
    if (wB !== wA) return wA - wB;
    return (b.cvssScore ?? 0) - (a.cvssScore ?? 0);
  });

  const findings = sortedFindings.map((f) => ({
    title: f.title,
    severity: f.severity?.severity || '',
    severity_color: f.severity?.color || '',
    finding_type: f.findingType?.findingType || '',
    cvss_score: f.cvssScore ?? 0,
    cvss_vector: f.cvssVector || '',
    affected_entities: f.affectedEntities || '',
    description: f.description || '',
    impact: f.impact || '',
    recommendation: f.mitigation || '',
    replication_steps: f.replicationSteps || '',
    references: f.references || '',
  }));

  const scope = (report.project.scopes || []).map((s) => ({
    scope: s.scope,
  }));

  return {
    client,
    project,
    report_date: reportDate,
    team,
    findings,
    scope,
    totals: { findings: findings.length },
  };
}
