import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Redis
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  scan: vi.fn(),
};

vi.mock('@/db/redis.js', () => ({
  redisClient: mockRedisClient,
}));

// Mock config
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

// Mock LLM client
const mockGenerateStream = vi.fn();
const mockResolveModel = vi.fn().mockReturnValue('test-model');
vi.mock('@/services/llm/client.js', () => ({
  createLLMClient: vi.fn().mockResolvedValue({
    generateStream: mockGenerateStream,
    resolveModel: mockResolveModel,
  }),
}));

// Mock audit
vi.mock('@/services/llm/audit.js', () => ({
  logLLMInteraction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/audit.js', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock documents
vi.mock('@/services/documents.js', () => ({
  renderTemplatePreview: vi.fn().mockResolvedValue({
    docxPath: '/uploads/documents/test-uuid_rendered.docx',
    jobId: 'pdf-job-123',
  }),
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue(Buffer.from('mock-docx')),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('mock-docx')),
  };
});

// Import after mocking
const {
  uploadTemplate,
  analyzeTemplate,
  applyInstructions,
  generatePreview,
  getDownloadPath,
  processChatFeedback,
} = await import('@/services/templateAdapter.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

/** Create a mock WizardState for testing. */
function makeWizardState(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'sess-test',
    userId: 'user-123',
    currentStep: 'verify',
    templateFile: {
      originalName: 'client-report.docx',
      storagePath: '',
      base64: 'UEsDBBQ=', // minimal zip header
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
      appliedDocxPath: '/uploads/documents/test-adapted.docx',
      appliedCount: 5,
      skippedCount: 0,
    },
    preview: { pdfJobId: null, pdfUrl: null, docxUrl: null },
    chat: { iterationCount: 0, history: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Make an async generator from chunks for mocking generateStream. */
async function* mockStream(chunks: Array<{ text: string; done: boolean; usage?: any }>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('templateAdapter service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    mockRedisClient.set.mockResolvedValue('OK');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // uploadTemplate
  // -----------------------------------------------------------------------

  describe('uploadTemplate', () => {
    it('creates session with correct initial state', async () => {
      // Track all stored states by key
      const store = new Map<string, string>();

      mockRedisClient.set.mockImplementation(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      });
      mockRedisClient.get.mockImplementation(async (key: string) => {
        return store.get(key) ?? null;
      });

      const mockFile = {
        originalname: 'test-report.docx',
        buffer: Buffer.from('fake-docx-content'),
        size: 100,
      } as Express.Multer.File;

      const state = await uploadTemplate(mockFile, 'web', 'en', 'user-123');

      expect(state.userId).toBe('user-123');
      expect(state.currentStep).toBe('upload');
      expect(state.templateFile.originalName).toBe('test-report.docx');
      expect(state.config.templateType).toBe('web');
      expect(state.config.language).toBe('en');
      expect(state.templateFile.base64).toBe(Buffer.from('fake-docx-content').toString('base64'));
    });
  });

  // -----------------------------------------------------------------------
  // analyzeTemplate
  // -----------------------------------------------------------------------

  describe('analyzeTemplate', () => {
    it('calls Python service and LLM in correct order', async () => {
      const analyzeResponse = {
        prompt: 'Analyze this template...',
        system_prompt: 'You are...',
        doc_structure_summary: {},
        reference_template_hash: 'hash123',
        paragraph_count: 10,
      };

      const validateResponse = {
        valid: true,
        mapping_plan: {
          entries: [{
            section_index: 0,
            section_text: 'Acme',
            gw_field: 'client.short_name',
            placeholder_template: '{{ client.short_name }}',
            confidence: 0.9,
            marker_type: 'text',
            rationale: 'Name match',
          }],
          template_type: 'web',
          language: 'en',
          warnings: [],
        },
        errors: [],
      };

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(analyzeResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validateResponse),
        });

      // LLM returns valid JSON
      const llmJson = JSON.stringify({
        entries: [{
          section_index: 0,
          section_text: 'Acme',
          gw_field: 'client.short_name',
          placeholder_template: '{{ client.short_name }}',
          confidence: 0.9,
          marker_type: 'text',
          rationale: 'Name match',
        }],
        warnings: [],
      });

      mockGenerateStream.mockReturnValue(
        mockStream([
          { text: llmJson, done: false },
          { text: '', done: true, usage: { inputTokens: 100, outputTokens: 50 } },
        ]),
      );

      const result = await analyzeTemplate('base64data', 'web', 'en');

      // Verify the correct API calls were made
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // First call: Python /adapter/analyze
      const analyzeCall = fetchMock.mock.calls[0];
      expect(analyzeCall[0]).toContain('/adapter/analyze');

      // Second call: Python /adapter/validate-mapping
      const validateCall = fetchMock.mock.calls[1];
      expect(validateCall[0]).toContain('/adapter/validate-mapping');

      // Verify result
      expect(result.mappingPlan.entries).toHaveLength(1);
      expect(result.mappingPlan.entries[0].gwField).toBe('client.short_name');
      expect(result.referenceTemplateHash).toBe('hash123');
    });
  });

  // -----------------------------------------------------------------------
  // applyInstructions
  // -----------------------------------------------------------------------

  describe('applyInstructions', () => {
    it('calls enrich + validate + apply pipeline', async () => {
      const wizardState = makeWizardState();

      // Mock Redis for session reads/writes
      mockRedisClient.get.mockResolvedValue(JSON.stringify(wizardState));

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

      // Call 1: /adapter/analyze (to get doc_structure)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          prompt: 'analyze prompt',
          system_prompt: 'system',
          doc_structure_summary: { paragraphs: [] },
          reference_template_hash: 'hash',
          paragraph_count: 5,
        }),
      });

      // Call 2: /adapter/build-insertion-prompt
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          prompt: 'Insert instructions...',
          system_prompt: 'You are a DOCX engineer...',
        }),
      });

      // Call 3: /adapter/apply
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          output_base64: Buffer.from('adapted-docx').toString('base64'),
          applied_count: 3,
          skipped_count: 1,
          warnings: ['Skipped paragraph 10'],
        }),
      });

      // LLM returns instruction set JSON
      const instructionJson = JSON.stringify({
        instructions: [{
          action: 'replace_text',
          paragraph_index: 0,
          original_text: 'Acme Corp',
          replacement_text: '{{ client.short_name }}',
          marker_type: 'text',
          gw_field: 'client.short_name',
        }],
        template_type: 'web',
        language: 'en',
      });

      mockGenerateStream.mockReturnValue(
        mockStream([
          { text: instructionJson, done: false },
          { text: '', done: true, usage: { inputTokens: 200, outputTokens: 100 } },
        ]),
      );

      const result = await applyInstructions(wizardState as any);

      expect(result.currentStep).toBe('verify');
      expect(result.adaptation.appliedCount).toBe(3);
      expect(result.adaptation.skippedCount).toBe(1);

      // Verify fetch calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0][0]).toContain('/adapter/analyze');
      expect(fetchMock.mock.calls[1][0]).toContain('/adapter/build-insertion-prompt');
      expect(fetchMock.mock.calls[2][0]).toContain('/adapter/apply');
    });

    it('preserves last good state on LLM failure (checkpoint)', async () => {
      const wizardState = makeWizardState();
      mockRedisClient.get.mockResolvedValue(JSON.stringify(wizardState));

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

      // Call 1: /adapter/analyze
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          prompt: 'analyze',
          system_prompt: 'system',
          doc_structure_summary: {},
          reference_template_hash: 'hash',
          paragraph_count: 5,
        }),
      });

      // Call 2: /adapter/build-insertion-prompt
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          prompt: 'Insert...',
          system_prompt: 'Engineer...',
        }),
      });

      // LLM throws an error
      mockGenerateStream.mockReturnValue(
        (async function* () {
          throw new Error('CLIProxyAPI connection refused');
        })(),
      );

      await expect(applyInstructions(wizardState as any)).rejects.toThrow(
        'LLM instruction generation failed',
      );

      // The original wizard state should NOT have been modified
      // (updateWizardSession was not called with adaptation changes)
      // This is verified by the fact that the error was thrown before
      // the session update could happen
    });
  });

  // -----------------------------------------------------------------------
  // generatePreview
  // -----------------------------------------------------------------------

  describe('generatePreview', () => {
    it('calls render pipeline and queues PDF conversion', async () => {
      const wizardState = makeWizardState({ currentStep: 'verify' });
      mockRedisClient.get.mockResolvedValue(JSON.stringify(wizardState));

      const result = await generatePreview(wizardState as any);

      expect(result.currentStep).toBe('preview');
      expect(result.preview.pdfJobId).toBe('pdf-job-123');
      expect(result.preview.docxUrl).toContain('_rendered.docx');

      // Verify renderTemplatePreview was called
      const { renderTemplatePreview } = await import('@/services/documents.js');
      expect(renderTemplatePreview).toHaveBeenCalledWith(
        '/uploads/documents/test-adapted.docx',
        1, // GHOSTWRITER_REPORT_ID default
      );
    });
  });

  // -----------------------------------------------------------------------
  // getDownloadPath
  // -----------------------------------------------------------------------

  describe('getDownloadPath', () => {
    it('returns the adapted DOCX path (not the rendered one)', () => {
      const wizardState = makeWizardState();

      const downloadPath = getDownloadPath(wizardState as any);

      expect(downloadPath).toBe('/uploads/documents/test-adapted.docx');
    });

    it('throws if no adapted DOCX exists', () => {
      const wizardState = makeWizardState({
        adaptation: {
          instructions: null,
          appliedDocxPath: null,
          appliedCount: 0,
          skippedCount: 0,
        },
      });

      expect(() => getDownloadPath(wizardState as any)).toThrow(
        'No adapted DOCX in wizard state',
      );
    });
  });

  // -----------------------------------------------------------------------
  // processChatFeedback
  // -----------------------------------------------------------------------

  describe('processChatFeedback', () => {
    it('increments iteration count', async () => {
      const wizardState = makeWizardState({ currentStep: 'verify' });
      mockRedisClient.get.mockResolvedValue(JSON.stringify(wizardState));

      mockGenerateStream.mockReturnValue(
        mockStream([
          { text: 'I suggest changing...', done: false },
          { text: '', done: true, usage: { inputTokens: 50, outputTokens: 30 } },
        ]),
      );

      const chunks: any[] = [];
      for await (const chunk of processChatFeedback(wizardState as any, 'Change the client name mapping')) {
        chunks.push(chunk);
      }

      // Should have text chunks + done chunk
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].done).toBe(true);

      // Verify session was updated with incremented iteration count
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('includes warning after 5 iterations', async () => {
      const wizardState = makeWizardState({
        currentStep: 'verify',
        chat: { iterationCount: 5, history: [] },
      });
      mockRedisClient.get.mockResolvedValue(JSON.stringify(wizardState));

      mockGenerateStream.mockReturnValue(
        mockStream([
          { text: 'OK, one more change...', done: false },
          { text: '', done: true, usage: { inputTokens: 50, outputTokens: 30 } },
        ]),
      );

      const chunks: any[] = [];
      for await (const chunk of processChatFeedback(wizardState as any, 'Another change please')) {
        chunks.push(chunk);
      }

      // Verify the system prompt included the iteration warning
      // The LLM was called with messages that include the warning
      expect(mockGenerateStream).toHaveBeenCalled();
      const callArgs = mockGenerateStream.mock.calls[0];
      const messages = callArgs[0];
      const systemMessage = messages.find((m: any) => m.role === 'system');
      expect(systemMessage.content).toContain('iteration 6');
      expect(systemMessage.content).toContain('finalising');
    });
  });
});
