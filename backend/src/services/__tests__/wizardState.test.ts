import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis client
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
};

vi.mock('@/db/redis.js', () => ({
  redisClient: mockRedisClient,
}));

// Import after mocking
const {
  createWizardSession,
  getWizardSession,
  updateWizardSession,
  deleteWizardSession,
  getActiveWizardSession,
} = await import('@/services/wizardState.js');

describe('wizardState service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createWizardSession', () => {
    it('generates a unique sessionId and stores in Redis', async () => {
      const state = await createWizardSession('user-123');

      expect(state.sessionId).toBeDefined();
      expect(state.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(state.userId).toBe('user-123');
      expect(state.currentStep).toBe('upload');

      // Verify Redis set was called with correct key pattern and TTL
      expect(mockRedisClient.set).toHaveBeenCalledOnce();
      const [key, value, options] = mockRedisClient.set.mock.calls[0];
      expect(key).toMatch(/^layer8:wizard:user-123:/);
      expect(options).toEqual({ EX: 86400 }); // 24h TTL
      expect(JSON.parse(value).sessionId).toBe(state.sessionId);
    });

    it('initializes all state fields with defaults', async () => {
      const state = await createWizardSession('user-123');

      expect(state.templateFile.originalName).toBe('');
      expect(state.templateFile.base64).toBe('');
      expect(state.config.templateType).toBe('');
      expect(state.config.language).toBe('');
      expect(state.analysis.mappingPlan).toBeNull();
      expect(state.analysis.referenceTemplateHash).toBeNull();
      expect(state.adaptation.instructions).toBeNull();
      expect(state.adaptation.appliedDocxPath).toBeNull();
      expect(state.adaptation.appliedCount).toBe(0);
      expect(state.preview.pdfJobId).toBeNull();
      expect(state.chat.iterationCount).toBe(0);
      expect(state.chat.history).toEqual([]);
      expect(state.createdAt).toBeDefined();
      expect(state.updatedAt).toBeDefined();
    });

    it('sets TTL to 24 hours (86400 seconds)', async () => {
      await createWizardSession('user-123');

      const [, , options] = mockRedisClient.set.mock.calls[0];
      expect(options.EX).toBe(86400);
    });
  });

  describe('getWizardSession', () => {
    it('retrieves correct state from Redis', async () => {
      const mockState = {
        sessionId: 'sess-abc',
        userId: 'user-123',
        currentStep: 'analysis',
        templateFile: { originalName: 'test.docx', storagePath: '', base64: '', uploadedAt: '' },
        config: { templateType: 'web', language: 'en' },
        analysis: { mappingPlan: null, referenceTemplateHash: null, llmPrompt: null },
        adaptation: { instructions: null, appliedDocxPath: null, appliedCount: 0, skippedCount: 0 },
        preview: { pdfJobId: null, pdfUrl: null, docxUrl: null },
        chat: { iterationCount: 0, history: [] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockState));

      const result = await getWizardSession('user-123', 'sess-abc');

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('sess-abc');
      expect(result!.currentStep).toBe('analysis');
      expect(mockRedisClient.get).toHaveBeenCalledWith('layer8:wizard:user-123:sess-abc');
    });

    it('returns null for non-existent session', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await getWizardSession('user-123', 'nonexistent');

      expect(result).toBeNull();
    });

    it('returns null if userId does not match (session isolation)', async () => {
      const mockState = {
        sessionId: 'sess-abc',
        userId: 'other-user',
        currentStep: 'upload',
        templateFile: { originalName: '', storagePath: '', base64: '', uploadedAt: '' },
        config: { templateType: '', language: '' },
        analysis: { mappingPlan: null, referenceTemplateHash: null, llmPrompt: null },
        adaptation: { instructions: null, appliedDocxPath: null, appliedCount: 0, skippedCount: 0 },
        preview: { pdfJobId: null, pdfUrl: null, docxUrl: null },
        chat: { iterationCount: 0, history: [] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockState));

      const result = await getWizardSession('user-123', 'sess-abc');

      expect(result).toBeNull();
    });
  });

  describe('updateWizardSession', () => {
    const baseState = {
      sessionId: 'sess-abc',
      userId: 'user-123',
      currentStep: 'upload' as const,
      templateFile: { originalName: 'old.docx', storagePath: '', base64: 'abc', uploadedAt: '2026-01-01' },
      config: { templateType: 'web', language: 'en' },
      analysis: { mappingPlan: null, referenceTemplateHash: null, llmPrompt: null },
      adaptation: { instructions: null, appliedDocxPath: null, appliedCount: 0, skippedCount: 0 },
      preview: { pdfJobId: null, pdfUrl: null, docxUrl: null },
      chat: { iterationCount: 0, history: [] },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('merges updates and preserves unchanged fields', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(baseState));

      const updated = await updateWizardSession('user-123', 'sess-abc', {
        currentStep: 'analysis',
        analysis: { mappingPlan: { entries: [] } as any, referenceTemplateHash: 'abc123', llmPrompt: null },
      });

      expect(updated.currentStep).toBe('analysis');
      expect(updated.analysis.referenceTemplateHash).toBe('abc123');
      // Preserved fields
      expect(updated.templateFile.originalName).toBe('old.docx');
      expect(updated.config.templateType).toBe('web');
      expect(updated.sessionId).toBe('sess-abc');
      expect(updated.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('preserves immutable fields (sessionId, userId, createdAt)', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(baseState));

      const updated = await updateWizardSession('user-123', 'sess-abc', {
        // Attempting to override immutable fields
        sessionId: 'new-session',
        userId: 'new-user',
        createdAt: '2099-01-01',
      } as any);

      expect(updated.sessionId).toBe('sess-abc');
      expect(updated.userId).toBe('user-123');
      expect(updated.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('resets TTL on update', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(baseState));

      await updateWizardSession('user-123', 'sess-abc', { currentStep: 'analysis' });

      const [, , options] = mockRedisClient.set.mock.calls[0];
      expect(options.EX).toBe(86400);
    });

    it('throws if session does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await expect(
        updateWizardSession('user-123', 'nonexistent', { currentStep: 'analysis' }),
      ).rejects.toThrow('Wizard session not found');
    });

    it('updates updatedAt timestamp', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(baseState));

      const updated = await updateWizardSession('user-123', 'sess-abc', {
        currentStep: 'analysis',
      });

      expect(updated.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('deleteWizardSession', () => {
    it('removes session from Redis', async () => {
      await deleteWizardSession('user-123', 'sess-abc');

      expect(mockRedisClient.del).toHaveBeenCalledWith('layer8:wizard:user-123:sess-abc');
    });
  });

  describe('getActiveWizardSession', () => {
    it('returns the most recent session by updatedAt', async () => {
      const olderState = {
        sessionId: 'sess-old',
        userId: 'user-123',
        currentStep: 'upload',
        templateFile: { originalName: '', storagePath: '', base64: '', uploadedAt: '' },
        config: { templateType: '', language: '' },
        analysis: { mappingPlan: null, referenceTemplateHash: null, llmPrompt: null },
        adaptation: { instructions: null, appliedDocxPath: null, appliedCount: 0, skippedCount: 0 },
        preview: { pdfJobId: null, pdfUrl: null, docxUrl: null },
        chat: { iterationCount: 0, history: [] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const newerState = {
        ...olderState,
        sessionId: 'sess-new',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      // First scan returns two keys, second scan returns 0 cursor (done)
      mockRedisClient.scan.mockResolvedValueOnce({
        cursor: 0,
        keys: ['layer8:wizard:user-123:sess-old', 'layer8:wizard:user-123:sess-new'],
      });

      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(olderState))
        .mockResolvedValueOnce(JSON.stringify(newerState));

      const result = await getActiveWizardSession('user-123');

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('sess-new');
    });

    it('returns null when no sessions exist', async () => {
      mockRedisClient.scan.mockResolvedValueOnce({ cursor: 0, keys: [] });

      const result = await getActiveWizardSession('user-123');

      expect(result).toBeNull();
    });
  });
});
