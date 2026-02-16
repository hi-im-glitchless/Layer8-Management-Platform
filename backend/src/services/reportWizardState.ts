/**
 * Report Wizard Session State Manager -- Redis-backed state for the executive report wizard.
 *
 * Persists wizard progress (upload -> sanitize-review -> generate -> review -> download)
 * across page navigation with a 24h TTL. Each user can have one active session.
 *
 * Redis key pattern: layer8:report-wizard:{userId}:{sessionId}
 */
import { randomUUID } from 'crypto';
import { redisClient } from '../db/redis.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportWizardStep = 'upload' | 'sanitize-review' | 'generate' | 'review' | 'download';

export interface ReportMetadata {
  clientName: string;
  projectCode: string;
  startDate: string;
  endDate: string;
  scopeSummary: string;
}

export interface ReportUploadedFile {
  originalName: string;
  storagePath: string;
  base64: string;
  uploadedAt: string;
}

export interface SanitizedEntity {
  type: string;
  start: number;
  end: number;
  text: string;
  placeholder: string;
}

export interface SanitizedParagraph {
  index: number;
  original: string;
  sanitized: string;
  entities: SanitizedEntity[];
}

export interface SanitizationMappings {
  forward: Record<string, string>;
  reverse: Record<string, string>;
}

export interface ReportChatMessage {
  role: string;
  content: string;
  timestamp: string;
}

/** Entity mapping for the HTML-centric sanitization pipeline. */
export interface EntityMapping {
  originalValue: string;
  placeholder: string;
  entityType: string;
  isManual: boolean; // true if added by user via text selection
}

/** Supplementary text extracted from DOCX headers, footers, and text boxes. */
export interface SupplementaryText {
  headers: string[];
  footers: string[];
  textBoxes: string[];
  headerTextBoxes: string[];
  footerTextBoxes: string[];
}

export interface ReportWizardState {
  sessionId: string;
  userId: string;
  currentStep: ReportWizardStep;
  // Upload
  uploadedFile: ReportUploadedFile;
  detectedLanguage: string; // 'en' | 'pt'
  // HTML pipeline
  uploadedHtml: string;
  sanitizedHtml: string;
  entityMappings: EntityMapping[];
  entityCounterMap: Record<string, Record<string, number>>;
  supplementaryText: SupplementaryText;
  // Sanitization (backward compat for extraction)
  sanitizedParagraphs: SanitizedParagraph[];
  sanitizationMappings: SanitizationMappings;
  // Extraction (Pass 1)
  findingsJson: Record<string, unknown> | null;
  metadata: ReportMetadata;
  warnings: string[];
  // Generation (Pass 2)
  riskScore: number | null;
  complianceScores: Record<string, number> | null;
  chartConfigs: Record<string, object> | null;
  narrativeSections: Record<string, string> | null;
  // Report
  generatedHtml: string | null;
  reportPdfJobId: string | null;
  reportPdfUrl: string | null;
  // Chat
  chatHistory: ReportChatMessage[];
  chatIterationCount: number;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'layer8:report-wizard';
const TTL_SECONDS = 24 * 60 * 60; // 24 hours

/** Build the Redis key for a report wizard session. */
function buildKey(userId: string, sessionId: string): string {
  return `${KEY_PREFIX}:${userId}:${sessionId}`;
}

/** Build the scan pattern for all report sessions of a user. */
function buildUserPattern(userId: string): string {
  return `${KEY_PREFIX}:${userId}:*`;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new report wizard session with default empty state.
 * Stores in Redis with 24h TTL and returns the initial state.
 */
export async function createReportSession(userId: string): Promise<ReportWizardState> {
  const sessionId = randomUUID();
  const now = new Date().toISOString();

  const state: ReportWizardState = {
    sessionId,
    userId,
    currentStep: 'upload',
    // Upload
    uploadedFile: {
      originalName: '',
      storagePath: '',
      base64: '',
      uploadedAt: '',
    },
    detectedLanguage: '',
    // HTML pipeline
    uploadedHtml: '',
    sanitizedHtml: '',
    entityMappings: [],
    entityCounterMap: {},
    supplementaryText: { headers: [], footers: [], textBoxes: [], headerTextBoxes: [], footerTextBoxes: [] },
    // Sanitization (backward compat)
    sanitizedParagraphs: [],
    sanitizationMappings: {
      forward: {},
      reverse: {},
    },
    // Extraction (Pass 1)
    findingsJson: null,
    metadata: {
      clientName: '',
      projectCode: '',
      startDate: '',
      endDate: '',
      scopeSummary: '',
    },
    warnings: [],
    // Generation (Pass 2)
    riskScore: null,
    complianceScores: null,
    chartConfigs: null,
    narrativeSections: null,
    // Report
    generatedHtml: null,
    reportPdfJobId: null,
    reportPdfUrl: null,
    // Chat
    chatHistory: [],
    chatIterationCount: 0,
    // Timestamps
    createdAt: now,
    updatedAt: now,
  };

  const key = buildKey(userId, sessionId);
  await redisClient.set(key, JSON.stringify(state), { EX: TTL_SECONDS });

  return state;
}

/**
 * Retrieve a report wizard session from Redis.
 * Returns null if the session does not exist or has expired.
 */
export async function getReportSession(
  userId: string,
  sessionId: string,
): Promise<ReportWizardState | null> {
  const key = buildKey(userId, sessionId);
  const raw = await redisClient.get(key);

  if (!raw) {
    return null;
  }

  const state = JSON.parse(raw) as ReportWizardState;

  // Session isolation: verify the userId matches
  if (state.userId !== userId) {
    return null;
  }

  return state;
}

/**
 * Merge partial updates into an existing report wizard session.
 * Performs a deep merge for nested objects (uploadedFile, metadata, sanitizationMappings).
 * Resets the 24h TTL on every update.
 *
 * @throws Error if the session does not exist.
 */
export async function updateReportSession(
  userId: string,
  sessionId: string,
  updates: Partial<ReportWizardState>,
): Promise<ReportWizardState> {
  const existing = await getReportSession(userId, sessionId);

  if (!existing) {
    throw new Error(`Report wizard session not found: ${sessionId}`);
  }

  // Deep merge nested objects
  const merged: ReportWizardState = {
    ...existing,
    ...updates,
    uploadedFile: {
      ...existing.uploadedFile,
      ...(updates.uploadedFile ?? {}),
    },
    metadata: {
      ...existing.metadata,
      ...(updates.metadata ?? {}),
    },
    sanitizationMappings: {
      ...existing.sanitizationMappings,
      ...(updates.sanitizationMappings ?? {}),
    },
    supplementaryText: {
      ...existing.supplementaryText,
      ...(updates.supplementaryText ?? {}),
    },
    // Deep merge counter map: merge per-entity-type sub-maps
    entityCounterMap: updates.entityCounterMap
      ? Object.entries(updates.entityCounterMap).reduce(
          (acc, [entityType, valueMap]) => {
            acc[entityType] = { ...(acc[entityType] ?? {}), ...valueMap };
            return acc;
          },
          { ...existing.entityCounterMap },
        )
      : existing.entityCounterMap,
    // Array fields: replace entirely when provided
    sanitizedParagraphs: updates.sanitizedParagraphs ?? existing.sanitizedParagraphs,
    entityMappings: updates.entityMappings ?? existing.entityMappings,
    warnings: updates.warnings ?? existing.warnings,
    chatHistory: updates.chatHistory ?? existing.chatHistory,
    // Preserve immutable fields
    sessionId: existing.sessionId,
    userId: existing.userId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const key = buildKey(userId, sessionId);
  await redisClient.set(key, JSON.stringify(merged), { EX: TTL_SECONDS });

  return merged;
}

/**
 * Delete a report wizard session from Redis.
 * Also removes any other report sessions for the same user to prevent
 * stale duplicates from being picked up by getActiveReportSession.
 */
export async function deleteReportSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  // Delete the target session
  const key = buildKey(userId, sessionId);
  await redisClient.del(key);

  // Clean up any other report sessions for this user
  const pattern = buildUserPattern(userId);
  let cursor = '0';
  do {
    const result = await redisClient.scan(cursor, {
      MATCH: pattern,
      COUNT: 100,
    });
    cursor = String(result.cursor);
    for (const otherKey of result.keys) {
      await redisClient.del(otherKey);
    }
  } while (cursor !== '0');
}

/**
 * Find the user's most recent active report wizard session.
 * Scans Redis keys matching the user pattern and returns the newest session
 * by updatedAt timestamp, or null if no sessions exist.
 */
export async function getActiveReportSession(
  userId: string,
): Promise<ReportWizardState | null> {
  const pattern = buildUserPattern(userId);
  let cursor = '0';
  let latestState: ReportWizardState | null = null;
  let latestTimestamp = '';

  // Use SCAN to iterate through matching keys without blocking
  do {
    const result = await redisClient.scan(cursor, {
      MATCH: pattern,
      COUNT: 100,
    });

    cursor = String(result.cursor);

    for (const key of result.keys) {
      const raw = await redisClient.get(key);
      if (!raw) continue;

      const state = JSON.parse(raw) as ReportWizardState;

      // Verify ownership
      if (state.userId !== userId) continue;

      if (!latestState || state.updatedAt > latestTimestamp) {
        latestState = state;
        latestTimestamp = state.updatedAt;
      }
    }
  } while (cursor !== '0');

  return latestState;
}
