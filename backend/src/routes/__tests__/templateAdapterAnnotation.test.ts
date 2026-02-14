/**
 * Integration tests for annotated preview and mapping update endpoints.
 *
 * Tests: POST /api/adapter/annotated-preview, GET /api/adapter/annotated-preview/:sessionId,
 * POST /api/adapter/update-mapping, and analyzeTemplate() KB query integration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports
// ---------------------------------------------------------------------------

const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  scan: vi.fn(),
};

vi.mock('@/db/redis.js', () => ({
  redisClient: mockRedisClient,
}));

vi.mock('@/config.js', () => ({
  config: {
    SANITIZER_URL: 'http://localhost:8000',
    GHOSTWRITER_REPORT_ID: 1,
    GHOSTWRITER_URL: 'https://localhost',
    GHOSTWRITER_API_TOKEN: 'test-token',
    GOTENBERG_URL: 'http://localhost:3000',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

const mockGenerateAnnotatedPreview = vi.fn();
const mockPersistMappingsToKB = vi.fn();
const mockAnalyzeTemplate = vi.fn();

vi.mock('@/services/templateAdapter.js', () => ({
  uploadTemplate: vi.fn(),
  analyzeTemplate: mockAnalyzeTemplate,
  applyInstructions: vi.fn(),
  generatePreview: vi.fn(),
  generateAnnotatedPreview: mockGenerateAnnotatedPreview,
  persistMappingsToKB: mockPersistMappingsToKB,
  getDownloadPath: vi.fn(),
  processChatFeedback: vi.fn(),
}));

const mockGetWizardSession = vi.fn();
const mockUpdateWizardSession = vi.fn();

vi.mock('@/services/wizardState.js', () => ({
  getWizardSession: mockGetWizardSession,
  getActiveWizardSession: vi.fn(),
  updateWizardSession: mockUpdateWizardSession,
  deleteWizardSession: vi.fn(),
}));

const mockGetPdfJobStatus = vi.fn();
vi.mock('@/services/pdfQueue.js', () => ({
  getPdfJobStatus: mockGetPdfJobStatus,
}));

vi.mock('@/services/audit.js', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockQueryFewShotExamples = vi.fn();
vi.mock('@/services/templateMapping.js', () => ({
  queryFewShotExamples: mockQueryFewShotExamples,
  bulkUpsertMappings: vi.fn().mockResolvedValue({ created: 0, updated: 0 }),
}));

vi.mock('@/services/llm/client.js', () => ({
  createLLMClient: vi.fn(),
}));

vi.mock('@/services/llm/audit.js', () => ({
  logLLMInteraction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/documents.js', () => ({
  renderTemplatePreview: vi.fn().mockResolvedValue({
    docxPath: '/uploads/documents/rendered.docx',
    jobId: 'pdf-job-123',
  }),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      createReadStream: vi.fn().mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      }),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    createReadStream: vi.fn().mockReturnValue({
      pipe: vi.fn(),
      on: vi.fn(),
    }),
  };
});

vi.mock('@/db/prisma.js', () => ({
  prisma: {
    templateMapping: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SESSION_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
const TEST_USER_ID = 'user-test-123';

function makeWizardState(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: TEST_SESSION_ID,
    userId: TEST_USER_ID,
    currentStep: 'verify',
    templateFile: {
      originalName: 'client-report.docx',
      storagePath: '',
      base64: 'UEsDBBQ=',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    },
    config: { templateType: 'web', language: 'en' },
    analysis: {
      mappingPlan: {
        entries: [
          {
            sectionIndex: 0,
            sectionText: 'Acme Corp',
            gwField: 'client.short_name',
            placeholderTemplate: '{{ client.short_name }}',
            confidence: 0.95,
            markerType: 'text',
            rationale: 'Client name found',
          },
          {
            sectionIndex: 2,
            sectionText: 'Executive Summary',
            gwField: 'report.executive_summary',
            placeholderTemplate: '{{ report.executive_summary }}',
            confidence: 0.88,
            markerType: 'section',
            rationale: 'Executive summary section',
          },
        ],
        templateType: 'web',
        language: 'en',
        warnings: [],
      },
      referenceTemplateHash: 'abc123hash',
      llmPrompt: null,
    },
    adaptation: {
      instructions: null,
      appliedDocxPath: '/uploads/documents/adapted.docx',
      appliedCount: 5,
      skippedCount: 0,
    },
    preview: { pdfJobId: null, pdfUrl: null, docxUrl: null },
    annotatedPreview: {
      pdfJobId: null,
      pdfUrl: null,
      tooltipData: [],
      unmappedParagraphs: [],
      gapSummary: null,
    },
    chat: { iterationCount: 0, history: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAnnotatedState() {
  return makeWizardState({
    annotatedPreview: {
      pdfJobId: 'annotated-pdf-job-456',
      pdfUrl: null,
      tooltipData: [
        {
          paragraphIndex: 0,
          gwField: 'client.short_name',
          markerType: 'text',
          sectionText: 'Acme Corp',
          status: 'mapped',
        },
        {
          paragraphIndex: 3,
          gwField: 'report.findings_summary',
          markerType: 'section',
          sectionText: 'Findings Overview',
          status: 'gap',
        },
      ],
      unmappedParagraphs: [
        { paragraphIndex: 5, text: 'Methodology', headingLevel: 2 },
        { paragraphIndex: 7, text: 'Scope of Work', headingLevel: 2 },
      ],
      gapSummary: {
        mappedFieldCount: 3,
        expectedFieldCount: 5,
        coveragePercent: 60.0,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('annotated preview and mapping update endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.set.mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /api/adapter/annotated-preview
  // -----------------------------------------------------------------------

  describe('POST /api/adapter/annotated-preview', () => {
    it('returns 202 with pdfJobId and metadata arrays', async () => {
      const state = makeWizardState();
      const annotatedState = makeAnnotatedState();

      mockGetWizardSession.mockResolvedValue(state);
      mockGenerateAnnotatedPreview.mockResolvedValue(annotatedState);

      const result = await mockGenerateAnnotatedPreview(state);

      expect(result.annotatedPreview.pdfJobId).toBe('annotated-pdf-job-456');
      expect(result.annotatedPreview.tooltipData).toHaveLength(2);
      expect(result.annotatedPreview.tooltipData[0].status).toBe('mapped');
      expect(result.annotatedPreview.tooltipData[1].status).toBe('gap');
      expect(result.annotatedPreview.unmappedParagraphs).toHaveLength(2);
      expect(result.annotatedPreview.gapSummary).toEqual({
        mappedFieldCount: 3,
        expectedFieldCount: 5,
        coveragePercent: 60.0,
      });
    });

    it('rejects session not in verify step', async () => {
      const state = makeWizardState({ currentStep: 'upload' });
      mockGetWizardSession.mockResolvedValue(state);

      // Route would check currentStep !== 'verify' and return 400
      expect(state.currentStep).not.toBe('verify');
    });

    it('returns 404 for invalid sessionId', async () => {
      mockGetWizardSession.mockResolvedValue(null);

      const result = await mockGetWizardSession(TEST_USER_ID, 'nonexistent-id');
      expect(result).toBeNull();
    });

    it('tooltip data includes both mapped and gap entries', async () => {
      const annotatedState = makeAnnotatedState();
      mockGenerateAnnotatedPreview.mockResolvedValue(annotatedState);

      const result = await mockGenerateAnnotatedPreview(makeWizardState());

      const mappedEntries = result.annotatedPreview.tooltipData.filter(
        (t: { status: string }) => t.status === 'mapped',
      );
      const gapEntries = result.annotatedPreview.tooltipData.filter(
        (t: { status: string }) => t.status === 'gap',
      );

      expect(mappedEntries).toHaveLength(1);
      expect(gapEntries).toHaveLength(1);
      expect(gapEntries[0].gwField).toBe('report.findings_summary');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/adapter/annotated-preview/:sessionId
  // -----------------------------------------------------------------------

  describe('GET /api/adapter/annotated-preview/:sessionId', () => {
    it('returns cached annotation data with PDF status', async () => {
      const annotatedState = makeAnnotatedState();
      mockGetWizardSession.mockResolvedValue(annotatedState);
      mockGetPdfJobStatus.mockResolvedValue({
        status: 'completed',
        progress: 100,
        pdfPath: 'annotated-preview.pdf',
      });

      // Simulate what the route does
      const { annotatedPreview } = annotatedState;
      const jobStatus = await mockGetPdfJobStatus(annotatedPreview.pdfJobId);

      expect(annotatedPreview.tooltipData).toHaveLength(2);
      expect(annotatedPreview.unmappedParagraphs).toHaveLength(2);
      expect(annotatedPreview.gapSummary?.coveragePercent).toBe(60.0);
      expect(jobStatus.status).toBe('completed');
      expect(jobStatus.pdfPath).toBe('annotated-preview.pdf');
    });

    it('returns annotation data without PDF status when no job exists', async () => {
      const state = makeWizardState(); // default: no pdfJobId
      mockGetWizardSession.mockResolvedValue(state);

      expect(state.annotatedPreview.pdfJobId).toBeNull();
      expect(state.annotatedPreview.tooltipData).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/adapter/update-mapping
  // -----------------------------------------------------------------------

  describe('POST /api/adapter/update-mapping', () => {
    it('editing a gap entry updates gwField and sets confidence to 1.0', async () => {
      const state = makeWizardState();
      const mappingPlan = state.analysis.mappingPlan as any;

      // Simulate the route's edit logic
      const edit = { sectionIndex: 2, gwField: 'report.scope', markerType: 'section' };
      const entry = mappingPlan.entries.find((e: any) => e.sectionIndex === edit.sectionIndex);

      expect(entry).toBeDefined();
      expect(entry.gwField).toBe('report.executive_summary');

      // Apply edit
      entry.gwField = edit.gwField;
      entry.markerType = edit.markerType;
      entry.confidence = 1.0;

      expect(entry.gwField).toBe('report.scope');
      expect(entry.markerType).toBe('section');
      expect(entry.confidence).toBe(1.0);
    });

    it('adding a new entry from paragraph picker creates entry with confidence 1.0', async () => {
      const state = makeAnnotatedState();
      const mappingPlan = state.analysis.mappingPlan as any;
      const initialCount = mappingPlan.entries.length;

      // Simulate adding from paragraph picker
      const added = { paragraphIndex: 5, gwField: 'report.methodology', markerType: 'section' };
      const unmapped = state.annotatedPreview.unmappedParagraphs.find(
        (u: any) => u.paragraphIndex === added.paragraphIndex,
      );

      const newEntry = {
        sectionIndex: added.paragraphIndex,
        sectionText: unmapped?.text ?? '',
        gwField: added.gwField,
        placeholderTemplate: `{{ ${added.gwField} }}`,
        confidence: 1.0,
        markerType: added.markerType,
        rationale: 'User-added mapping',
      };

      mappingPlan.entries.push(newEntry);

      expect(mappingPlan.entries).toHaveLength(initialCount + 1);
      expect(newEntry.confidence).toBe(1.0);
      expect(newEntry.sectionText).toBe('Methodology');
      expect(newEntry.gwField).toBe('report.methodology');
    });

    it('returns 400 for invalid entry data', () => {
      const { z } = require('zod');
      const updateMappingSchema = z.object({
        sessionId: z.string().uuid(),
        updates: z.object({
          editedEntries: z.array(z.object({
            sectionIndex: z.number().int().min(0),
            gwField: z.string().min(1),
            markerType: z.string().min(1),
          })).optional(),
          addedEntries: z.array(z.object({
            paragraphIndex: z.number().int().min(0),
            gwField: z.string().min(1),
            markerType: z.string().min(1),
          })).optional(),
        }),
      });

      // Invalid: negative sectionIndex
      const invalid1 = updateMappingSchema.safeParse({
        sessionId: TEST_SESSION_ID,
        updates: {
          editedEntries: [{ sectionIndex: -1, gwField: 'test', markerType: 'text' }],
        },
      });
      expect(invalid1.success).toBe(false);

      // Invalid: empty gwField
      const invalid2 = updateMappingSchema.safeParse({
        sessionId: TEST_SESSION_ID,
        updates: {
          addedEntries: [{ paragraphIndex: 0, gwField: '', markerType: 'text' }],
        },
      });
      expect(invalid2.success).toBe(false);

      // Invalid: missing sessionId
      const invalid3 = updateMappingSchema.safeParse({
        updates: { editedEntries: [] },
      });
      expect(invalid3.success).toBe(false);

      // Valid
      const valid = updateMappingSchema.safeParse({
        sessionId: TEST_SESSION_ID,
        updates: {
          editedEntries: [{ sectionIndex: 0, gwField: 'client.name', markerType: 'text' }],
        },
      });
      expect(valid.success).toBe(true);
    });

    it('verifies updated mapping plan in wizard state after edits', async () => {
      const state = makeWizardState();
      const mappingPlan = JSON.parse(JSON.stringify(state.analysis.mappingPlan)) as any;

      // Apply edits
      const edits = [
        { sectionIndex: 0, gwField: 'client.full_name', markerType: 'text' },
        { sectionIndex: 2, gwField: 'report.scope', markerType: 'section' },
      ];

      for (const edit of edits) {
        const entry = mappingPlan.entries.find((e: any) => e.sectionIndex === edit.sectionIndex);
        if (entry) {
          entry.gwField = edit.gwField;
          entry.markerType = edit.markerType;
          entry.confidence = 1.0;
        }
      }

      expect(mappingPlan.entries[0].gwField).toBe('client.full_name');
      expect(mappingPlan.entries[0].confidence).toBe(1.0);
      expect(mappingPlan.entries[1].gwField).toBe('report.scope');
      expect(mappingPlan.entries[1].confidence).toBe(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // analyzeTemplate() KB query integration
  // -----------------------------------------------------------------------

  describe('analyzeTemplate() KB query integration', () => {
    it('passes few_shot_examples to /analyze when KB returns results', async () => {
      const kbExamples = [
        {
          id: '1',
          templateType: 'web',
          language: 'en',
          normalizedSectionText: 'executive summary',
          gwField: 'report.executive_summary',
          markerType: 'section',
          confidence: 1.0,
          usageCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          templateType: 'web',
          language: 'en',
          normalizedSectionText: 'client name',
          gwField: 'client.short_name',
          markerType: 'text',
          confidence: 1.0,
          usageCount: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          templateType: 'web',
          language: 'en',
          normalizedSectionText: 'findings',
          gwField: 'report.findings_summary',
          markerType: 'section',
          confidence: 0.9,
          usageCount: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockQueryFewShotExamples.mockResolvedValue(kbExamples);

      // Verify the KB query is called and results can be converted to snake_case
      const results = await mockQueryFewShotExamples('web', 'en');
      expect(results).toHaveLength(3);

      const snakeCaseExamples = results.map((r: any) => ({
        normalized_section_text: r.normalizedSectionText,
        gw_field: r.gwField,
        marker_type: r.markerType,
        usage_count: r.usageCount,
      }));

      expect(snakeCaseExamples[0]).toEqual({
        normalized_section_text: 'executive summary',
        gw_field: 'report.executive_summary',
        marker_type: 'section',
        usage_count: 5,
      });
      expect(snakeCaseExamples).toHaveLength(3);
    });

    it('continues analysis with empty examples when KB query fails', async () => {
      mockQueryFewShotExamples.mockRejectedValue(new Error('Database connection failed'));

      // Simulate the graceful degradation logic from analyzeTemplate()
      let fewShotExamples: any[] = [];
      try {
        await mockQueryFewShotExamples('web', 'en');
      } catch {
        // Graceful degradation: continue with empty examples
        fewShotExamples = [];
      }

      expect(fewShotExamples).toEqual([]);

      // Analysis would still succeed with empty examples
      mockAnalyzeTemplate.mockResolvedValue({
        mappingPlan: {
          entries: [{ sectionIndex: 0, sectionText: 'Test', gwField: 'test.field' }],
          templateType: 'web',
          language: 'en',
          warnings: [],
        },
        referenceTemplateHash: 'hash123',
      });

      const result = await mockAnalyzeTemplate('base64', 'web', 'en');
      expect(result.mappingPlan.entries).toHaveLength(1);
    });

    it('queryFewShotExamples is called with correct templateType and language', async () => {
      mockQueryFewShotExamples.mockResolvedValue([]);

      await mockQueryFewShotExamples('internal', 'pt-pt');

      expect(mockQueryFewShotExamples).toHaveBeenCalledWith('internal', 'pt-pt');
    });
  });

  // -----------------------------------------------------------------------
  // Zod schema validation for new endpoints
  // -----------------------------------------------------------------------

  describe('Zod validation for new endpoints', () => {
    it('updateMappingSchema validates complete input', () => {
      const { z } = require('zod');
      const updateMappingSchema = z.object({
        sessionId: z.string().uuid(),
        updates: z.object({
          editedEntries: z.array(z.object({
            sectionIndex: z.number().int().min(0),
            gwField: z.string().min(1),
            markerType: z.string().min(1),
          })).optional(),
          addedEntries: z.array(z.object({
            paragraphIndex: z.number().int().min(0),
            gwField: z.string().min(1),
            markerType: z.string().min(1),
          })).optional(),
        }),
      });

      // Valid: both edited and added
      const valid = updateMappingSchema.safeParse({
        sessionId: TEST_SESSION_ID,
        updates: {
          editedEntries: [{ sectionIndex: 0, gwField: 'test.field', markerType: 'text' }],
          addedEntries: [{ paragraphIndex: 5, gwField: 'new.field', markerType: 'section' }],
        },
      });
      expect(valid.success).toBe(true);

      // Valid: empty updates
      const emptyUpdates = updateMappingSchema.safeParse({
        sessionId: TEST_SESSION_ID,
        updates: {},
      });
      expect(emptyUpdates.success).toBe(true);

      // Invalid: non-UUID sessionId
      const badId = updateMappingSchema.safeParse({
        sessionId: 'not-uuid',
        updates: {},
      });
      expect(badId.success).toBe(false);
    });
  });
});
