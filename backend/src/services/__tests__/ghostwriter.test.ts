import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fixture from './fixtures/gw-report-1.json';

// Mock config before importing the module under test
vi.mock('@/config.js', () => ({
  config: {
    GHOSTWRITER_URL: 'https://localhost',
    GHOSTWRITER_API_TOKEN: 'test-jwt-token',
  },
}));

// Import after mocking
const { fetchReportData, checkGhostwriterHealth } = await import(
  '@/services/ghostwriter.js'
);

describe('ghostwriter service', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('fetchReportData', () => {
    it('parses GW response into typed GWReport', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fixture),
      });

      const report = await fetchReportData(1);

      expect(report.id).toBe(1);
      expect(report.title).toContain('AI Template Engine');
      expect(report.creation).toContain('2026-02-13');
      expect(report.project.codename).toBe('AMBER YAK');
      expect(report.project.client.name).toBe('AI Template Engine');
      expect(report.project.client.shortName).toBe('');
      expect(report.project.scopes).toHaveLength(2);
      expect(report.project.assignments).toHaveLength(1);
      expect(report.project.assignments[0].user.username).toBe('admin');
      expect(report.findings).toHaveLength(4);
    });

    it('maps findings with correct fields and order', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fixture),
      });

      const report = await fetchReportData(1);

      // Findings should be in position order (1, 2, 3, 4)
      expect(report.findings[0].title).toBe('HSTS');
      expect(report.findings[0].severity.severity).toBe('High');
      expect(report.findings[0].cvssScore).toBe(6.1);

      expect(report.findings[2].title).toBe('SQLI');
      expect(report.findings[2].severity.severity).toBe('Critical');
      expect(report.findings[2].findingType.findingType).toBe('Web');

      // replication_steps -> replicationSteps
      expect(report.findings[0].replicationSteps).toContain('Navigate');
    });

    it('throws when report is not found', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { report_by_pk: null } }),
      });

      await expect(fetchReportData(999)).rejects.toThrow('Report 999 not found');
    });

    it('throws on auth failure (401)', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(fetchReportData(1)).rejects.toThrow('authentication failed');
    });

    it('throws on auth failure (403)', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });

      await expect(fetchReportData(1)).rejects.toThrow('authentication failed');
    });

    it('throws on GraphQL errors', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            errors: [{ message: 'field "unknown" not found' }],
          }),
      });

      await expect(fetchReportData(1)).rejects.toThrow('GraphQL error');
    });

    it('throws on connection refused', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('fetch failed: ECONNREFUSED'),
      );

      await expect(fetchReportData(1)).rejects.toThrow('unavailable');
    });
  });

  describe('checkGhostwriterHealth', () => {
    it('returns available with username on success', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ data: { user: [{ username: 'admin' }] } }),
      });

      const health = await checkGhostwriterHealth();
      expect(health.available).toBe(true);
      expect(health.username).toBe('admin');
    });

    it('returns unavailable on connection error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('fetch failed'),
      );

      const health = await checkGhostwriterHealth();
      expect(health.available).toBe(false);
    });
  });
});
