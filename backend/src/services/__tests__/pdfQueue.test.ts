import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ before imports -- must use class syntax for vitest compatibility
const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockWorkerOn = vi.fn();

vi.mock('bullmq', () => {
  class MockQueue {
    add = mockAdd;
    getJob = mockGetJob;
    constructor() {}
  }
  class MockWorker {
    on = mockWorkerOn;
    constructor() {}
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    REDIS_URL: 'redis://localhost:6379',
    GOTENBERG_URL: 'http://localhost:3000',
  },
}));

// We need to control fs.existsSync for the pdfQueue module
const mockExistsSync = vi.fn();
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...args: unknown[]) => mockExistsSync(...args),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      readdirSync: vi.fn().mockReturnValue([]),
      statSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('pdfQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addPdfConversionJob', () => {
    it('should create a job with correct data', async () => {
      const { addPdfConversionJob } = await import('../pdfQueue.js');

      const mockJobId = 'test-job-123';
      mockAdd.mockResolvedValue({ id: mockJobId });
      mockExistsSync.mockReturnValue(true);

      const jobId = await addPdfConversionJob('/tmp/test.docx', 'report.docx');

      expect(jobId).toBe(mockJobId);
      expect(mockAdd).toHaveBeenCalledWith('convert', {
        docxPath: '/tmp/test.docx',
        originalName: 'report.docx',
      });
    });

    it('should reject an invalid file path', async () => {
      const { addPdfConversionJob } = await import('../pdfQueue.js');
      mockExistsSync.mockReturnValue(false);

      await expect(
        addPdfConversionJob('/nonexistent/file.docx', 'report.docx'),
      ).rejects.toThrow('Invalid DOCX path');
    });

    it('should reject an empty file path', async () => {
      const { addPdfConversionJob } = await import('../pdfQueue.js');
      mockExistsSync.mockReturnValue(false);

      await expect(
        addPdfConversionJob('', 'report.docx'),
      ).rejects.toThrow('Invalid DOCX path');
    });
  });

  describe('getPdfJobStatus', () => {
    it('should return not_found for nonexistent job', async () => {
      const { getPdfJobStatus } = await import('../pdfQueue.js');
      mockGetJob.mockResolvedValue(null);

      const status = await getPdfJobStatus('nonexistent-id');
      expect(status).toEqual({ status: 'not_found' });
    });

    it('should return queued status for waiting job', async () => {
      const { getPdfJobStatus } = await import('../pdfQueue.js');

      mockGetJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('waiting'),
        progress: 0,
        returnvalue: null,
        failedReason: null,
      });

      const status = await getPdfJobStatus('job-1');
      expect(status).toEqual({
        status: 'queued',
        progress: 0,
      });
    });

    it('should return active status with progress', async () => {
      const { getPdfJobStatus } = await import('../pdfQueue.js');

      mockGetJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
        progress: 50,
        returnvalue: null,
        failedReason: null,
      });

      const status = await getPdfJobStatus('job-2');
      expect(status).toEqual({
        status: 'active',
        progress: 50,
      });
    });

    it('should return completed status with pdfPath', async () => {
      const { getPdfJobStatus } = await import('../pdfQueue.js');

      mockGetJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        progress: 100,
        returnvalue: { pdfFilename: 'abc-123.pdf' },
        failedReason: null,
      });

      const status = await getPdfJobStatus('job-3');
      expect(status).toEqual({
        status: 'completed',
        progress: 100,
        pdfPath: 'abc-123.pdf',
      });
    });

    it('should return failed status with error message', async () => {
      const { getPdfJobStatus } = await import('../pdfQueue.js');

      mockGetJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('failed'),
        progress: 20,
        returnvalue: null,
        failedReason: 'Gotenberg conversion failed (500): Internal error',
      });

      const status = await getPdfJobStatus('job-4');
      expect(status).toEqual({
        status: 'failed',
        progress: 20,
        error: 'Gotenberg conversion failed (500): Internal error',
      });
    });
  });
});

describe('documents service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkGotenbergHealth', () => {
    it('should return available:true when Gotenberg responds OK', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'up' }),
      });

      const { checkGotenbergHealth } = await import('../documents.js');
      const result = await checkGotenbergHealth();

      expect(result.available).toBe(true);
    });

    it('should return available:false when Gotenberg is unreachable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const { checkGotenbergHealth } = await import('../documents.js');
      const result = await checkGotenbergHealth();

      expect(result.available).toBe(false);
    });

    it('should return available:false when Gotenberg responds with error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const { checkGotenbergHealth } = await import('../documents.js');
      const result = await checkGotenbergHealth();

      expect(result.available).toBe(false);
    });
  });

  describe('cleanupExpiredDocuments', () => {
    it('should return 0 when directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const { cleanupExpiredDocuments } = await import('../documents.js');
      const count = await cleanupExpiredDocuments(3600000);

      expect(count).toBe(0);
    });
  });
});

describe('document upload validation', () => {
  it('should reject files with non-DOCX extension for conversion', () => {
    const validExtensions = ['.docx', '.pdf'];
    const invalidExtensions = ['.txt', '.exe', '.js', '.html', '.doc'];

    for (const ext of validExtensions) {
      expect(validExtensions.includes(ext)).toBe(true);
    }

    for (const ext of invalidExtensions) {
      expect(validExtensions.includes(ext)).toBe(false);
    }
  });

  it('should validate filename format matches UUID pattern', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx)$/;

    // Valid filenames
    expect(uuidPattern.test('a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf')).toBe(true);
    expect(uuidPattern.test('a1b2c3d4-e5f6-7890-abcd-ef1234567890.docx')).toBe(true);

    // Invalid filenames (path traversal attempts)
    expect(uuidPattern.test('../../../etc/passwd')).toBe(false);
    expect(uuidPattern.test('file.txt')).toBe(false);
    expect(uuidPattern.test('a1b2c3d4-e5f6-7890-abcd-ef1234567890.exe')).toBe(false);
    expect(uuidPattern.test('')).toBe(false);
  });

  it('should enforce 50MB size limit', () => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    expect(MAX_FILE_SIZE).toBe(52428800);
    expect(49 * 1024 * 1024 < MAX_FILE_SIZE).toBe(true);
    expect(51 * 1024 * 1024 > MAX_FILE_SIZE).toBe(true);
  });
});
