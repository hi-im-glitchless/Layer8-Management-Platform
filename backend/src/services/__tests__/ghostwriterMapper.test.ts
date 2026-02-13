import { describe, it, expect } from 'vitest';
import { mapReportToTemplateContext } from '@/services/ghostwriterMapper.js';
import type { GWReport } from '@/types/ghostwriter.js';

/** Builds a minimal valid GWReport for testing. Override any field as needed. */
function makeReport(overrides: Partial<GWReport> = {}): GWReport {
  return {
    id: 1,
    title: 'Test Report',
    creation: '2026-02-13T09:00:00.000000+00:00',
    lastUpdate: '2026-02-13T12:00:00.000000+00:00',
    project: {
      id: 1,
      codename: 'AMBER YAK',
      startDate: '2026-02-13',
      endDate: '2026-12-11',
      client: { id: 1, name: 'AI Template Engine', shortName: '' },
      scopes: [
        { id: 1, scope: '192.168.1.0/24', name: 'Internal' },
        { id: 2, scope: 'app.example.com', name: 'Web App' },
      ],
      assignments: [
        {
          user: { username: 'admin', email: 'admin@example.com', name: 'Admin User' },
          projectRole: { projectRole: 'Assessment Lead' },
        },
      ],
    },
    findings: [
      {
        id: 1,
        title: 'HSTS',
        position: 1,
        severity: { severity: 'High', color: '#e74c3c', weight: 3 },
        findingType: { findingType: 'Cloud' },
        cvssScore: 6.1,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',
        affectedEntities: '<p>app.example.com</p>',
        description: '<p>Missing HSTS header.</p>',
        impact: '<p>MitM attacks possible.</p>',
        mitigation: '<p>Add HSTS header.</p>',
        replicationSteps: '<p>Check headers.</p>',
        references: 'https://owasp.org/hsts',
      },
      {
        id: 2,
        title: 'SQLI',
        position: 2,
        severity: { severity: 'Critical', color: '#9b59b6', weight: 4 },
        findingType: { findingType: 'Web' },
        cvssScore: 6.2,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
        affectedEntities: '<p>api.example.com/search</p>',
        description: '<p>SQL injection in search.</p>',
        impact: '<p>Full database access.</p>',
        mitigation: '<p>Use parameterised queries.</p>',
        replicationSteps: '<p>Enter payload.</p>',
        references: 'https://owasp.org/sqli',
      },
    ],
    ...overrides,
  };
}

describe('ghostwriterMapper', () => {
  describe('mapReportToTemplateContext', () => {
    it('transforms all top-level fields correctly', () => {
      const report = makeReport();
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.client.short_name).toBe('AI Template Engine');
      expect(ctx.project.start_date).toBe('2026-02-13');
      expect(ctx.project.end_date).toBe('2026-12-11');
      expect(ctx.report_date).toBe('2026-02-13');
    });

    it('uses shortName when available for client.short_name', () => {
      const report = makeReport();
      report.project.client.shortName = 'ATE';
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.client.short_name).toBe('ATE');
    });

    it('falls back to client.name when shortName is empty', () => {
      const report = makeReport();
      report.project.client.shortName = '';
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.client.short_name).toBe('AI Template Engine');
    });

    it('maps team from assignments with name and email', () => {
      const report = makeReport();
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.team).toHaveLength(1);
      expect(ctx.team[0].name).toBe('Admin User');
      expect(ctx.team[0].email).toBe('admin@example.com');
    });

    it('uses username when user name is empty', () => {
      const report = makeReport();
      report.project.assignments[0].user.name = '';
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.team[0].name).toBe('admin');
    });

    it('maps findings with severity, type, and CVSS fields', () => {
      const report = makeReport();
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.findings).toHaveLength(2);

      const f0 = ctx.findings[0];
      expect(f0.title).toBe('HSTS');
      expect(f0.severity).toBe('High');
      expect(f0.severity_color).toBe('#e74c3c');
      expect(f0.finding_type).toBe('Cloud');
      expect(f0.cvss_score).toBe(6.1);
      expect(f0.cvss_vector).toContain('CVSS:3.1');

      const f1 = ctx.findings[1];
      expect(f1.title).toBe('SQLI');
      expect(f1.severity).toBe('Critical');
      expect(f1.finding_type).toBe('Web');
    });

    it('maps finding recommendation from GW mitigation field', () => {
      const report = makeReport();
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.findings[0].recommendation).toBe('<p>Add HSTS header.</p>');
    });

    it('passes HTML rich text fields through unchanged', () => {
      const report = makeReport();
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.findings[0].description).toBe('<p>Missing HSTS header.</p>');
      expect(ctx.findings[0].affected_entities).toBe('<p>app.example.com</p>');
      expect(ctx.findings[0].impact).toBe('<p>MitM attacks possible.</p>');
      expect(ctx.findings[0].replication_steps).toBe('<p>Check headers.</p>');
    });

    it('maps scope correctly', () => {
      const report = makeReport();
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.scope).toHaveLength(2);
      expect(ctx.scope[0].scope).toBe('192.168.1.0/24');
      expect(ctx.scope[1].scope).toBe('app.example.com');
    });

    it('computes totals.findings as actual finding count', () => {
      const report = makeReport();
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.totals.findings).toBe(2);
    });

    it('handles empty findings gracefully', () => {
      const report = makeReport({ findings: [] });
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.findings).toHaveLength(0);
      expect(ctx.totals.findings).toBe(0);
    });

    it('handles empty scopes gracefully', () => {
      const report = makeReport();
      report.project.scopes = [];
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.scope).toHaveLength(0);
    });

    it('handles empty assignments gracefully', () => {
      const report = makeReport();
      report.project.assignments = [];
      const ctx = mapReportToTemplateContext(report);

      expect(ctx.team).toHaveLength(0);
    });
  });
});
