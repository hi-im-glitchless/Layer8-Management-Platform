/**
 * Executive Report Service -- orchestrates the report generation pipeline.
 *
 * Pass 1 (Extract): Sanitized paragraphs -> LLM Opus 4.6 -> structured findings JSON
 * Python Compute: Risk score, severity distributions, compliance mapping, chart data
 * Pass 2 (Generate): Computed data + findings -> LLM -> narrative sections text
 * Build: python-docx fills skeleton DOCX with content + charts -> Gotenberg PDF
 * Chat: Targeted section regeneration for corrections
 *
 * This file contains stubbed orchestration functions. Actual LLM/Python integration
 * will be implemented in Plan 06-C.
 */
import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { config } from '../config.js';
import {
  createReportSession,
  getReportSession,
  updateReportSession,
  type ReportWizardState,
  type SanitizedParagraph,
  type SanitizationMappings,
} from './reportWizardState.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'documents');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result from the upload step. */
export interface UploadResult {
  sessionId: string;
  detectedLanguage: string;
}

/** Result from the sanitization step. */
export interface SanitizeResult {
  sanitizedParagraphs: SanitizedParagraph[];
  sanitizationMappings: SanitizationMappings;
}

/** Result from deny list update. */
export interface DenyListUpdateResult {
  updatedParagraphs: SanitizedParagraph[];
}

/** Result from findings extraction (Pass 1). */
export interface ExtractionResult {
  findings: Record<string, unknown>;
  metadata: {
    clientName: string;
    projectCode: string;
    startDate: string;
    endDate: string;
    scopeSummary: string;
  };
  warnings: string[];
}

/** Result from full report generation. */
export interface GenerationResult {
  reportDocxPath: string;
  pdfJobId: string;
}

// ---------------------------------------------------------------------------
// Service functions (stubs -- implementation in Plan 06-C)
// ---------------------------------------------------------------------------

/**
 * Upload a technical report DOCX and create a new report wizard session.
 * Creates session, stores file as base64 in Redis, saves to disk,
 * and detects the report language.
 *
 * @param file - Multer file buffer
 * @param originalName - Original filename
 * @param userId - Authenticated user ID
 * @returns Session ID and detected language
 */
export async function uploadReport(
  file: Buffer,
  originalName: string,
  userId: string,
): Promise<UploadResult> {
  // Create a new report session
  const state = await createReportSession(userId);

  // Store file to disk
  const filename = `report_${state.sessionId}_${Date.now()}.docx`;
  const filePath = path.join(DOCUMENTS_DIR, filename);
  fs.writeFileSync(filePath, file);

  // Encode as base64 for Redis state storage
  const base64 = file.toString('base64');

  // Detect language via Python service
  let detectedLanguage = 'en';
  try {
    const sanitizerUrl = config.SANITIZER_URL;
    const langRes = await fetch(`${sanitizerUrl}/detect-language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }), // TODO: Parse DOCX and send first 500 chars in 06-C
    });
    if (langRes.ok) {
      const langData = await langRes.json() as { language: string };
      if (langData.language) {
        detectedLanguage = langData.language;
      }
    }
  } catch (err) {
    console.warn('[reportService] Language detection failed, defaulting to "en":', err);
  }

  // Update session with upload data
  await updateReportSession(userId, state.sessionId, {
    uploadedFile: {
      originalName,
      storagePath: filePath,
      base64,
      uploadedAt: new Date().toISOString(),
    },
    detectedLanguage,
  });

  return {
    sessionId: state.sessionId,
    detectedLanguage,
  };
}

/**
 * Sanitize the uploaded report paragraph-by-paragraph.
 * Calls the Python sanitization service for each extracted paragraph
 * and accumulates forward/reverse mappings.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @returns Sanitized paragraphs and accumulated mappings
 */
export async function sanitizeReport(
  userId: string,
  sessionId: string,
): Promise<SanitizeResult> {
  // TODO: Implement in Plan 06-C
  // 1. Parse DOCX via Python /report/parse to get paragraphs
  // 2. For each paragraph, call /sanitize with session deny list
  // 3. Accumulate forward/reverse mappings
  // 4. Update session state with results
  console.log('[reportService] sanitizeReport: TODO: implement in Plan 06-C');

  return {
    sanitizedParagraphs: [],
    sanitizationMappings: { forward: {}, reverse: {} },
  };
}

/**
 * Update the session deny list and re-sanitize affected paragraphs.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @param terms - Terms to add or remove
 * @param action - Whether to 'add' or 'remove' the terms
 * @returns Updated paragraphs with new sanitization
 */
export async function updateDenyList(
  userId: string,
  sessionId: string,
  terms: string[],
  action: 'add' | 'remove',
): Promise<DenyListUpdateResult> {
  // TODO: Implement in Plan 06-C
  // 1. Get current session state
  // 2. Add/remove terms from denyListTerms
  // 3. Re-sanitize affected paragraphs
  // 4. Update session state
  console.log('[reportService] updateDenyList: TODO: implement in Plan 06-C');

  return {
    updatedParagraphs: [],
  };
}

/**
 * Extract structured findings from the sanitized report using LLM Pass 1.
 * Sends sanitized paragraphs to the LLM with the extraction prompt,
 * parses the structured JSON response, and extracts metadata.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @returns Extracted findings, metadata, and any warnings
 */
export async function extractFindings(
  userId: string,
  sessionId: string,
): Promise<ExtractionResult> {
  // TODO: Implement in Plan 06-C
  // 1. Build extraction prompt via Python /report/build-extraction-prompt
  // 2. Call Opus 4.6 via generateStream() with feature: 'executive-report'
  // 3. Validate JSON response via Python /report/validate-extraction
  // 4. Update session state with findings + metadata
  console.log('[reportService] extractFindings: TODO: implement in Plan 06-C');

  return {
    findings: {},
    metadata: {
      clientName: '',
      projectCode: '',
      startDate: '',
      endDate: '',
      scopeSummary: '',
    },
    warnings: ['Extraction not yet implemented'],
  };
}

/**
 * Run the full report generation pipeline:
 * Python compute (metrics/charts) -> LLM Pass 2 (narrative) -> DOCX build -> PDF conversion.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @returns Path to generated DOCX and PDF job ID
 */
export async function generateReport(
  userId: string,
  sessionId: string,
): Promise<GenerationResult> {
  // TODO: Implement in Plan 06-C
  // 1. Python compute: risk score, severity distributions, compliance mapping, chart data
  // 2. Python render charts (matplotlib -> PNG)
  // 3. Build narrative prompt via Python /report/build-narrative-prompt
  // 4. Call Opus 4.6 via generateStream() for narrative sections
  // 5. Python builds DOCX with python-docx from skeleton + data + charts
  // 6. Queue PDF conversion via addPdfConversionJob()
  // 7. Update session state
  console.log('[reportService] generateReport: TODO: implement in Plan 06-C');

  return {
    reportDocxPath: '',
    pdfJobId: '',
  };
}

/**
 * Process a chat correction message for targeted section regeneration.
 * Streams LLM response via SSE, updating only the affected sections.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @param message - User's correction/instruction message
 * @param res - Express Response for SSE streaming
 */
export async function processReportChat(
  userId: string,
  sessionId: string,
  message: string,
  res: Response,
): Promise<void> {
  // TODO: Implement in Plan 06-C
  // 1. Build chat prompt with current narrative sections + user message
  // 2. Call Opus 4.6 via generateStream() for targeted section regeneration
  // 3. Stream delta + section_update events via SSE
  // 4. If data changed, regenerate charts
  // 5. Rebuild DOCX and re-convert PDF
  // 6. Update session state
  console.log('[reportService] processReportChat: TODO: implement in Plan 06-C');
}

/**
 * Resolve the DOCX download path for a completed report.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @returns Absolute path to the DOCX file
 * @throws Error if no report has been generated
 */
export async function getReportDownloadPath(
  userId: string,
  sessionId: string,
): Promise<string> {
  const state = await getReportSession(userId, sessionId);
  if (!state) {
    throw new Error(`Report session not found: ${sessionId}`);
  }

  if (!state.reportDocxPath) {
    throw new Error('No report DOCX available. Run generation first.');
  }

  if (!fs.existsSync(state.reportDocxPath)) {
    throw new Error('Report DOCX file not found on disk.');
  }

  return state.reportDocxPath;
}
