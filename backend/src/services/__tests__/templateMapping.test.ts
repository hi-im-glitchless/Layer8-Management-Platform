import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockFindMany = vi.fn();

const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
  await fn({
    templateMapping: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
  });
});

vi.mock('@/db/prisma.js', () => ({
  prisma: {
    templateMapping: {
      upsert: mockUpsert,
      findMany: mockFindMany,
      findUnique: mockFindUnique,
    },
    $transaction: mockTransaction,
  },
}));

// Import after mocking
const {
  normalizeSectionText,
  upsertMapping,
  bulkUpsertMappings,
  queryFewShotExamples,
  formatFewShotExamples,
} = await import('@/services/templateMapping.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMappingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cuid-1',
    templateType: 'web',
    language: 'en',
    normalizedSectionText: 'client name:',
    gwField: 'client.short_name',
    markerType: 'text',
    confidence: 0.95,
    usageCount: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('templateMapping service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // normalizeSectionText
  // =========================================================================
  describe('normalizeSectionText', () => {
    it('normalizes "  Client Name:  _____ " to "client name:"', () => {
      expect(normalizeSectionText('  Client Name:  _____ ')).toBe('client name:');
    });

    it('normalizes "FINDING\\n\\tTitle" to "finding title"', () => {
      expect(normalizeSectionText('FINDING\n\tTitle')).toBe('finding title');
    });

    it('returns already normalized text unchanged', () => {
      expect(normalizeSectionText('client name')).toBe('client name');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeSectionText('')).toBe('');
    });

    it('strips ellipsis patterns', () => {
      expect(normalizeSectionText('Company Name...')).toBe('company name');
    });

    it('strips unicode ellipsis', () => {
      expect(normalizeSectionText('Company Name\u2026')).toBe('company name');
    });

    it('strips em-dash patterns', () => {
      expect(normalizeSectionText('Title -- Subtitle')).toBe('title subtitle');
    });

    it('strips unicode em-dash', () => {
      expect(normalizeSectionText('Title \u2014 Subtitle')).toBe('title subtitle');
    });

    it('strips unicode en-dash', () => {
      expect(normalizeSectionText('Title \u2013 Subtitle')).toBe('title subtitle');
    });

    it('collapses multiple whitespace types', () => {
      expect(normalizeSectionText('  word1  \t  word2  \n  word3  ')).toBe('word1 word2 word3');
    });

    it('handles combined filler patterns', () => {
      expect(normalizeSectionText('  Client:  _____...  ')).toBe('client:');
    });
  });

  // =========================================================================
  // upsertMapping
  // =========================================================================
  describe('upsertMapping', () => {
    it('creates record with usageCount=1 on first call', async () => {
      const record = makeMappingRecord();
      mockUpsert.mockResolvedValue(record);

      const result = await upsertMapping({
        templateType: 'web',
        language: 'en',
        sectionText: '  Client Name:  _____ ',
        gwField: 'client.short_name',
        markerType: 'text',
        confidence: 0.95,
      });

      expect(result.usageCount).toBe(1);
      expect(result.gwField).toBe('client.short_name');

      // Verify upsert was called with correct composite key and normalized text
      expect(mockUpsert).toHaveBeenCalledOnce();
      const call = mockUpsert.mock.calls[0][0];
      expect(call.where.templateType_language_normalizedSectionText_gwField_zone).toEqual({
        templateType: 'web',
        language: 'en',
        normalizedSectionText: 'client name:',
        gwField: 'client.short_name',
        zone: 'body',
      });
      expect(call.create.usageCount).toBe(1);
      expect(call.update.usageCount).toEqual({ increment: 1 });
    });

    it('increments usageCount on second call with same key', async () => {
      const updatedRecord = makeMappingRecord({ usageCount: 2 });
      mockUpsert.mockResolvedValue(updatedRecord);

      const result = await upsertMapping({
        templateType: 'web',
        language: 'en',
        sectionText: 'Client Name:',
        gwField: 'client.short_name',
        markerType: 'text',
        confidence: 0.95,
      });

      expect(result.usageCount).toBe(2);
    });

    it('creates separate record for different gwField with same text', async () => {
      const record = makeMappingRecord({ gwField: 'client.full_name' });
      mockUpsert.mockResolvedValue(record);

      const result = await upsertMapping({
        templateType: 'web',
        language: 'en',
        sectionText: 'Client Name:',
        gwField: 'client.full_name',
        markerType: 'text',
        confidence: 0.9,
      });

      expect(result.gwField).toBe('client.full_name');
      const call = mockUpsert.mock.calls[0][0];
      expect(call.where.templateType_language_normalizedSectionText_gwField_zone.gwField).toBe(
        'client.full_name',
      );
    });

    it('validates input and rejects empty templateType', async () => {
      await expect(
        upsertMapping({
          templateType: '',
          language: 'en',
          sectionText: 'Client Name:',
          gwField: 'client.short_name',
          markerType: 'text',
          confidence: 0.95,
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // bulkUpsertMappings
  // =========================================================================
  describe('bulkUpsertMappings', () => {
    it('bulk inserts 5 mappings and returns correct counts', async () => {
      // All 5 are new (findUnique returns null)
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeMappingRecord());

      const mappings = Array.from({ length: 5 }, (_, i) => ({
        templateType: 'web',
        language: 'en',
        sectionText: `Section ${i}`,
        gwField: `field.${i}`,
        markerType: 'text',
        confidence: 0.9,
      }));

      const result = await bulkUpsertMappings(mappings);

      expect(result).toEqual({ created: 5, updated: 0 });
      expect(mockUpsert).toHaveBeenCalledTimes(5);
    });

    it('tracks created vs updated correctly on repeated bulk insert', async () => {
      // All records already exist
      mockFindUnique.mockResolvedValue(makeMappingRecord());
      mockUpsert.mockResolvedValue(makeMappingRecord({ usageCount: 2 }));

      const mappings = Array.from({ length: 3 }, (_, i) => ({
        templateType: 'web',
        language: 'en',
        sectionText: `Section ${i}`,
        gwField: `field.${i}`,
        markerType: 'text',
        confidence: 0.9,
      }));

      const result = await bulkUpsertMappings(mappings);

      expect(result).toEqual({ created: 0, updated: 3 });
    });

    it('returns {created: 0, updated: 0} for empty array', async () => {
      const result = await bulkUpsertMappings([]);

      expect(result).toEqual({ created: 0, updated: 0 });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('logs error and returns zeros on transaction failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTransaction.mockRejectedValueOnce(new Error('DB connection lost'));

      const mappings = [
        {
          templateType: 'web',
          language: 'en',
          sectionText: 'Section 1',
          gwField: 'field.1',
          markerType: 'text',
          confidence: 0.9,
        },
      ];

      const result = await bulkUpsertMappings(mappings);

      expect(result).toEqual({ created: 0, updated: 0 });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[templateMapping] bulkUpsertMappings failed:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // queryFewShotExamples
  // =========================================================================
  describe('queryFewShotExamples', () => {
    it('returns entries sorted by usageCount DESC', async () => {
      const records = [
        makeMappingRecord({ usageCount: 10, gwField: 'field.a' }),
        makeMappingRecord({ usageCount: 5, gwField: 'field.b' }),
        makeMappingRecord({ usageCount: 1, gwField: 'field.c' }),
      ];
      mockFindMany.mockResolvedValue(records);

      const result = await queryFewShotExamples('web', 'en');

      expect(result).toHaveLength(3);
      expect(result[0].usageCount).toBe(10);
      expect(result[1].usageCount).toBe(5);
      expect(result[2].usageCount).toBe(1);

      // Verify correct query parameters
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { templateType: 'web', language: 'en' },
        orderBy: { usageCount: 'desc' },
        take: 5,
      });
    });

    it('filters by templateType and language correctly', async () => {
      mockFindMany.mockResolvedValue([]);

      await queryFewShotExamples('internal', 'pt-pt');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { templateType: 'internal', language: 'pt-pt' },
        orderBy: { usageCount: 'desc' },
        take: 5,
      });
    });

    it('respects limit parameter', async () => {
      mockFindMany.mockResolvedValue([makeMappingRecord()]);

      await queryFewShotExamples('web', 'en', 3);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { templateType: 'web', language: 'en' },
        orderBy: { usageCount: 'desc' },
        take: 3,
      });
    });

    it('returns empty array when no matches', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await queryFewShotExamples('mobile', 'en');

      expect(result).toEqual([]);
    });

    it('uses default limit of 5', async () => {
      mockFindMany.mockResolvedValue([]);

      await queryFewShotExamples('web', 'en');

      const call = mockFindMany.mock.calls[0][0];
      expect(call.take).toBe(5);
    });
  });

  // =========================================================================
  // formatFewShotExamples
  // =========================================================================
  describe('formatFewShotExamples', () => {
    it('produces formatted "## Previous Successful Mappings" section', () => {
      const examples = [
        makeMappingRecord({
          normalizedSectionText: 'client name:',
          gwField: 'client.short_name',
          usageCount: 5,
        }),
        makeMappingRecord({
          normalizedSectionText: 'finding title',
          gwField: 'finding.title',
          usageCount: 3,
        }),
      ];

      const result = formatFewShotExamples(examples as any);

      expect(result).toContain('## Previous Successful Mappings');
      expect(result).toContain(
        'These mappings were confirmed by users in previous template adaptations:',
      );
      expect(result).toContain(
        '1. Section: "client name:" -> GW Field: client.short_name (confirmed 5 times)',
      );
      expect(result).toContain(
        '2. Section: "finding title" -> GW Field: finding.title (confirmed 3 times)',
      );
    });

    it('returns empty string for empty array', () => {
      const result = formatFewShotExamples([]);

      expect(result).toBe('');
    });

    it('handles single example correctly', () => {
      const examples = [
        makeMappingRecord({
          normalizedSectionText: 'executive summary',
          gwField: 'report.executive_summary',
          usageCount: 1,
        }),
      ];

      const result = formatFewShotExamples(examples as any);

      expect(result).toContain('## Previous Successful Mappings');
      expect(result).toContain(
        '1. Section: "executive summary" -> GW Field: report.executive_summary (confirmed 1 times)',
      );
      // Should not contain a second numbered item
      expect(result).not.toContain('2.');
    });
  });
});
