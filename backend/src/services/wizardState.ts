/**
 * Wizard Session State Manager -- Redis-backed state for the template adapter wizard.
 *
 * Persists wizard progress (upload -> analysis -> adaptation -> preview -> download)
 * across page navigation with a 24h TTL. Each user can have one active session.
 *
 * Redis key pattern: layer8:wizard:{userId}:{sessionId}
 */
import { randomUUID } from 'crypto';
import { redisClient } from '../db/redis.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WizardStep = 'upload' | 'analysis' | 'adaptation' | 'preview' | 'download';

export interface WizardTemplateFile {
  originalName: string;
  storagePath: string;
  base64: string;
  uploadedAt: string;
}

export interface WizardConfig {
  templateType: string;
  language: string;
}

export interface WizardAnalysis {
  mappingPlan: Record<string, unknown> | null;
  referenceTemplateHash: string | null;
  llmPrompt: string | null;
}

export interface WizardAdaptation {
  instructions: Record<string, unknown> | null;
  appliedDocxPath: string | null;
  appliedCount: number;
  skippedCount: number;
}

export interface WizardPreview {
  pdfJobId: string | null;
  pdfUrl: string | null;
  docxUrl: string | null;
}

export interface WizardAnnotatedPreview {
  pdfJobId: string | null;
  pdfUrl: string | null;
  tooltipData: Array<{
    paragraphIndex: number;
    gwField: string;
    markerType: string;
    sectionText: string;
    status: 'mapped' | 'gap';
  }>;
  unmappedParagraphs: Array<{
    paragraphIndex: number;
    text: string;
    headingLevel: number | null;
  }>;
  gapSummary: {
    mappedFieldCount: number;
    expectedFieldCount: number;
    coveragePercent: number;
  } | null;
}

export interface WizardChatMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface WizardChat {
  iterationCount: number;
  history: WizardChatMessage[];
}

export interface InteractiveSelection {
  selectionNumber: number;
  text: string;
  paragraphIndex: number;
  status: 'pending' | 'confirmed' | 'rejected';
  gwField?: string;
  markerType?: string;
  confidence?: number;
}

export interface WizardState {
  sessionId: string;
  userId: string;
  currentStep: WizardStep;
  templateFile: WizardTemplateFile;
  config: WizardConfig;
  analysis: WizardAnalysis;
  adaptation: WizardAdaptation;
  preview: WizardPreview;
  annotatedPreview: WizardAnnotatedPreview;
  chat: WizardChat;
  interactiveSelections: InteractiveSelection[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'layer8:wizard';
const TTL_SECONDS = 24 * 60 * 60; // 24 hours

/** Build the Redis key for a wizard session. */
function buildKey(userId: string, sessionId: string): string {
  return `${KEY_PREFIX}:${userId}:${sessionId}`;
}

/** Build the scan pattern for all sessions of a user. */
function buildUserPattern(userId: string): string {
  return `${KEY_PREFIX}:${userId}:*`;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new wizard session with default empty state.
 * Stores in Redis with 24h TTL and returns the initial state.
 */
export async function createWizardSession(userId: string): Promise<WizardState> {
  const sessionId = randomUUID();
  const now = new Date().toISOString();

  const state: WizardState = {
    sessionId,
    userId,
    currentStep: 'upload',
    templateFile: {
      originalName: '',
      storagePath: '',
      base64: '',
      uploadedAt: '',
    },
    config: {
      templateType: '',
      language: '',
    },
    analysis: {
      mappingPlan: null,
      referenceTemplateHash: null,
      llmPrompt: null,
    },
    adaptation: {
      instructions: null,
      appliedDocxPath: null,
      appliedCount: 0,
      skippedCount: 0,
    },
    preview: {
      pdfJobId: null,
      pdfUrl: null,
      docxUrl: null,
    },
    annotatedPreview: {
      pdfJobId: null,
      pdfUrl: null,
      tooltipData: [],
      unmappedParagraphs: [],
      gapSummary: null,
    },
    chat: {
      iterationCount: 0,
      history: [],
    },
    interactiveSelections: [],
    createdAt: now,
    updatedAt: now,
  };

  const key = buildKey(userId, sessionId);
  await redisClient.set(key, JSON.stringify(state), { EX: TTL_SECONDS });

  return state;
}

/**
 * Retrieve a wizard session from Redis.
 * Returns null if the session does not exist or has expired.
 */
export async function getWizardSession(
  userId: string,
  sessionId: string,
): Promise<WizardState | null> {
  const key = buildKey(userId, sessionId);
  const raw = await redisClient.get(key);

  if (!raw) {
    return null;
  }

  const state = JSON.parse(raw) as WizardState;

  // Session isolation: verify the userId matches
  if (state.userId !== userId) {
    return null;
  }

  return state;
}

/**
 * Merge partial updates into an existing wizard session.
 * Performs a deep merge for nested objects (analysis, adaptation, preview, chat, config, templateFile).
 * Resets the 24h TTL on every update.
 *
 * @throws Error if the session does not exist.
 */
export async function updateWizardSession(
  userId: string,
  sessionId: string,
  updates: Partial<WizardState>,
): Promise<WizardState> {
  const existing = await getWizardSession(userId, sessionId);

  if (!existing) {
    throw new Error(`Wizard session not found: ${sessionId}`);
  }

  // Deep merge nested objects
  const merged: WizardState = {
    ...existing,
    ...updates,
    templateFile: {
      ...existing.templateFile,
      ...(updates.templateFile ?? {}),
    },
    config: {
      ...existing.config,
      ...(updates.config ?? {}),
    },
    analysis: {
      ...existing.analysis,
      ...(updates.analysis ?? {}),
    },
    adaptation: {
      ...existing.adaptation,
      ...(updates.adaptation ?? {}),
    },
    preview: {
      ...existing.preview,
      ...(updates.preview ?? {}),
    },
    annotatedPreview: {
      ...existing.annotatedPreview,
      ...(updates.annotatedPreview ?? {}),
    },
    chat: {
      ...existing.chat,
      ...(updates.chat ?? {}),
    },
    interactiveSelections: updates.interactiveSelections ?? existing.interactiveSelections,
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
 * Delete a wizard session from Redis.
 * Also removes any other sessions for the same user to prevent
 * stale duplicates from being picked up by getActiveWizardSession.
 */
export async function deleteWizardSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  // Delete the target session
  const key = buildKey(userId, sessionId);
  await redisClient.del(key);

  // Clean up any other sessions for this user (duplicates from StrictMode, etc.)
  const pattern = buildUserPattern(userId);
  let cursor = '0';
  do {
    const result = await redisClient.scan(cursor as unknown as number, {
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
 * Find the user's most recent active wizard session.
 * Scans Redis keys matching the user pattern and returns the newest session
 * by updatedAt timestamp, or null if no sessions exist.
 */
export async function getActiveWizardSession(
  userId: string,
): Promise<WizardState | null> {
  const pattern = buildUserPattern(userId);
  let cursor = '0';
  let latestState: WizardState | null = null;
  let latestTimestamp = '';

  // Use SCAN to iterate through matching keys without blocking
  do {
    const result = await redisClient.scan(cursor as unknown as number, {
      MATCH: pattern,
      COUNT: 100,
    });

    cursor = String(result.cursor);

    for (const key of result.keys) {
      const raw = await redisClient.get(key);
      if (!raw) continue;

      const state = JSON.parse(raw) as WizardState;

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
