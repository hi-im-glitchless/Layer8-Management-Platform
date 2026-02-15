/**
 * Executive Report Service -- orchestrates the report generation pipeline.
 *
 * Pass 1 (Extract): Sanitized paragraphs -> LLM Opus 4.6 -> structured findings JSON
 * Python Compute: Risk score, severity distributions, compliance mapping, chart data
 * Pass 2 (Generate): Computed data + findings -> LLM -> narrative sections text
 * Build: python-docx fills skeleton DOCX with content + charts -> Gotenberg PDF
 * Chat: Targeted section regeneration for corrections
 */
import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { config } from '../config.js';
import { createLLMClient } from './llm/client.js';
import { sanitizeText, desanitizeText } from './sanitization.js';
import { addPdfConversionJob } from './pdfQueue.js';
import type { LLMMessage } from '../types/llm.js';
import {
  createReportSession,
  getReportSession,
  updateReportSession,
  type ReportWizardState,
  type SanitizedParagraph,
  type SanitizationMappings,
  type SanitizedEntity,
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
  findings: Record<string, unknown>[];
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

/** Python /adapter/document-structure response shape. */
interface DocStructureParagraph {
  paragraph_index: number;
  text: string;
  heading_level: number | null;
  is_empty: boolean;
  style_name: string | null;
}

/** Python /report/build-extraction-prompt response. */
interface ExtractionPromptResponse {
  system_prompt: string;
  user_prompt: string;
}

/** Python /report/validate-extraction response. */
interface ValidateExtractionResponse {
  findings: Record<string, unknown>[];
  metadata: Record<string, string | null>;
  warnings: string[];
  valid: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a technical report DOCX and create a new report wizard session.
 * Creates session, stores file as base64 in Redis, saves to disk,
 * and detects the report language.
 */
export async function uploadReport(
  file: Buffer,
  originalName: string,
  userId: string,
): Promise<UploadResult> {
  // Ensure documents directory exists
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

  // Create a new report session
  const state = await createReportSession(userId);

  // Store file to disk
  const filename = `report_${state.sessionId}_${Date.now()}.docx`;
  const filePath = path.join(DOCUMENTS_DIR, filename);
  fs.writeFileSync(filePath, file);

  // Encode as base64 for Redis state storage
  const base64Content = file.toString('base64');

  // Parse DOCX to get first paragraphs for language detection
  let detectedLanguage = 'en';
  try {
    const sanitizerUrl = config.SANITIZER_URL;

    // Get document structure to extract first ~500 chars
    const structRes = await fetch(`${sanitizerUrl}/adapter/document-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_base64: base64Content }),
    });

    if (structRes.ok) {
      const structData = await structRes.json() as {
        paragraphs: DocStructureParagraph[];
      };

      // Concatenate first paragraphs to get ~500 chars for language detection
      let sampleText = '';
      for (const p of structData.paragraphs) {
        if (p.text.trim()) {
          sampleText += p.text + ' ';
          if (sampleText.length >= 500) break;
        }
      }

      // Use /sanitize with empty deny list to trigger language detection
      if (sampleText.trim()) {
        const sanitizeRes = await fetch(`${sanitizerUrl}/sanitize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: sampleText.substring(0, 1000),
            deny_list_terms: [],
            session_id: state.sessionId,
          }),
        });

        if (sanitizeRes.ok) {
          const sanitizeData = await sanitizeRes.json() as { language: string };
          if (sanitizeData.language) {
            // Map 'pt' to 'pt-pt' for skeleton selection
            detectedLanguage = sanitizeData.language === 'pt' ? 'pt-pt' : sanitizeData.language;
          }
        }
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
      base64: base64Content,
      uploadedAt: new Date().toISOString(),
    },
    detectedLanguage,
  });

  return {
    sessionId: state.sessionId,
    detectedLanguage,
  };
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize the uploaded report paragraph-by-paragraph.
 * Calls the Python sanitization service for each extracted paragraph
 * and accumulates forward/reverse mappings.
 */
export async function sanitizeReport(
  userId: string,
  sessionId: string,
): Promise<SanitizeResult> {
  const state = await getReportSession(userId, sessionId);
  if (!state) {
    throw new Error(`Report session not found: ${sessionId}`);
  }

  if (!state.uploadedFile.base64) {
    throw new Error('No uploaded file in session. Upload a DOCX first.');
  }

  const sanitizerUrl = config.SANITIZER_URL;

  // Step 1: Parse DOCX to get paragraphs
  const structRes = await fetch(`${sanitizerUrl}/adapter/document-structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_base64: state.uploadedFile.base64 }),
  });

  if (!structRes.ok) {
    const detail = await structRes.text();
    throw new Error(`Failed to parse DOCX: ${detail}`);
  }

  const structData = await structRes.json() as {
    paragraphs: DocStructureParagraph[];
  };

  // Step 2: Sanitize each non-empty paragraph
  const sanitizedParagraphs: SanitizedParagraph[] = [];
  const forwardMappings: Record<string, string> = {};
  const reverseMappings: Record<string, string> = {};
  const denyListTerms = state.denyListTerms || [];

  for (const para of structData.paragraphs) {
    if (para.is_empty || !para.text.trim()) {
      continue;
    }

    try {
      const result = await sanitizeText(
        para.text,
        sessionId,
        denyListTerms,
        { language: state.detectedLanguage === 'pt-pt' ? 'pt' : state.detectedLanguage },
      );

      // Accumulate mappings
      // The sanitizeText function stores mappings in Redis; we also
      // keep a local copy in the session for the de-sanitization step
      if (result.entities.length > 0) {
        for (const entity of result.entities) {
          if (entity.text && entity.placeholder) {
            forwardMappings[entity.text] = entity.placeholder;
            reverseMappings[entity.placeholder] = entity.text;
          }
        }
      }

      const entities: SanitizedEntity[] = result.entities.map((e) => ({
        type: e.entityType,
        start: e.start,
        end: e.end,
        text: e.text,
        placeholder: e.placeholder,
      }));

      sanitizedParagraphs.push({
        index: para.paragraph_index,
        original: para.text,
        sanitized: result.sanitizedText,
        entities,
      });
    } catch (err) {
      console.warn(
        `[reportService] Sanitization failed for paragraph ${para.paragraph_index}:`,
        err,
      );
      // Include unsanitized paragraph as fallback
      sanitizedParagraphs.push({
        index: para.paragraph_index,
        original: para.text,
        sanitized: para.text,
        entities: [],
      });
    }
  }

  const sanitizationMappings: SanitizationMappings = {
    forward: forwardMappings,
    reverse: reverseMappings,
  };

  // Step 3: Update session state
  await updateReportSession(userId, sessionId, {
    currentStep: 'sanitize-review',
    sanitizedParagraphs,
    sanitizationMappings,
  });

  console.log(
    `[reportService] Sanitized ${sanitizedParagraphs.length} paragraphs, ` +
    `${Object.keys(forwardMappings).length} entity mappings`,
  );

  return {
    sanitizedParagraphs,
    sanitizationMappings,
  };
}

/**
 * Update the session deny list and re-sanitize affected paragraphs.
 */
export async function updateDenyList(
  userId: string,
  sessionId: string,
  terms: string[],
  action: 'add' | 'remove',
): Promise<DenyListUpdateResult> {
  const state = await getReportSession(userId, sessionId);
  if (!state) {
    throw new Error(`Report session not found: ${sessionId}`);
  }

  // Update deny list terms
  let updatedTerms = [...(state.denyListTerms || [])];
  if (action === 'add') {
    for (const term of terms) {
      if (!updatedTerms.includes(term)) {
        updatedTerms.push(term);
      }
    }
  } else {
    updatedTerms = updatedTerms.filter((t) => !terms.includes(t));
  }

  // Update session with new deny list
  await updateReportSession(userId, sessionId, {
    denyListTerms: updatedTerms,
  });

  // Re-sanitize all paragraphs with updated deny list
  const result = await sanitizeReport(userId, sessionId);

  return {
    updatedParagraphs: result.sanitizedParagraphs,
  };
}

// ---------------------------------------------------------------------------
// Pass 1: Extraction
// ---------------------------------------------------------------------------

/**
 * Extract structured findings from the sanitized report using LLM Pass 1.
 * Sends sanitized paragraphs to the LLM with the extraction prompt,
 * parses the structured JSON response, and extracts metadata.
 */
export async function extractFindings(
  userId: string,
  sessionId: string,
): Promise<ExtractionResult> {
  const state = await getReportSession(userId, sessionId);
  if (!state) {
    throw new Error(`Report session not found: ${sessionId}`);
  }

  if (!state.sanitizedParagraphs || state.sanitizedParagraphs.length === 0) {
    throw new Error('No sanitized paragraphs. Run sanitization first.');
  }

  const sanitizerUrl = config.SANITIZER_URL;

  // Step 1: Build extraction prompt via Python
  const sanitizedTexts = state.sanitizedParagraphs.map((p) => p.sanitized);

  const promptRes = await fetch(`${sanitizerUrl}/report/build-extraction-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sanitized_paragraphs: sanitizedTexts,
      language: state.detectedLanguage || 'en',
      skeleton_schema: null,
    }),
  });

  if (!promptRes.ok) {
    const detail = await promptRes.text();
    throw new Error(`Failed to build extraction prompt: ${detail}`);
  }

  const promptData = await promptRes.json() as ExtractionPromptResponse;

  // Step 2: Call LLM with extraction prompt (Opus 4.6)
  const client = await createLLMClient();
  const messages: LLMMessage[] = [
    { role: 'system', content: promptData.system_prompt },
    { role: 'user', content: promptData.user_prompt },
  ];

  let llmResponse = '';
  const stream = client.generateStream(messages, {
    maxTokens: 8192,
    feature: 'executive-report',
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      llmResponse += chunk.text;
    }
  }

  if (!llmResponse.trim()) {
    throw new Error('LLM returned empty response for extraction');
  }

  // Step 3: Validate via Python
  const validateRes = await fetch(`${sanitizerUrl}/report/validate-extraction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_json: llmResponse }),
  });

  if (!validateRes.ok) {
    const detail = await validateRes.text();
    throw new Error(`Extraction validation failed: ${detail}`);
  }

  const validateData = await validateRes.json() as ValidateExtractionResponse;

  if (!validateData.valid) {
    throw new Error(`Extraction validation failed: ${validateData.error || 'Unknown error'}`);
  }

  // Step 4: Map to result format and update session
  const metadata = {
    clientName: validateData.metadata.client_name || '',
    projectCode: validateData.metadata.project_code || '',
    startDate: validateData.metadata.start_date || '',
    endDate: validateData.metadata.end_date || '',
    scopeSummary: validateData.metadata.scope_summary || '',
  };

  await updateReportSession(userId, sessionId, {
    currentStep: 'generate',
    findingsJson: validateData.findings as unknown as Record<string, unknown>,
    metadata,
    warnings: validateData.warnings,
  });

  console.log(
    `[reportService] Extracted ${validateData.findings.length} findings, ` +
    `${validateData.warnings.length} warnings`,
  );

  return {
    findings: validateData.findings,
    metadata,
    warnings: validateData.warnings,
  };
}

// ---------------------------------------------------------------------------
// Pass 2: Generation pipeline (stubs for Task 4)
// ---------------------------------------------------------------------------

/**
 * Run the full report generation pipeline:
 * Python compute (metrics/charts) -> LLM Pass 2 (narrative) -> DOCX build -> PDF conversion.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @param sendStageEvent - Optional SSE callback for progress reporting
 * @param sendDelta - Optional SSE callback for LLM token streaming
 * @returns Path to generated DOCX and PDF job ID
 */
export async function generateReport(
  userId: string,
  sessionId: string,
  sendStageEvent?: (stage: string, progress?: number) => void,
  sendDelta?: (text: string) => void,
): Promise<GenerationResult> {
  // Stub -- implementation in Task 4
  console.log('[reportService] generateReport: stub, will be implemented in Task 4');

  return {
    reportDocxPath: '',
    pdfJobId: '',
  };
}

/**
 * Process a chat correction message for targeted section regeneration.
 * Streams LLM response via SSE, updating only the affected sections.
 */
export async function processReportChat(
  userId: string,
  sessionId: string,
  message: string,
  res: Response,
): Promise<void> {
  // Stub -- implementation deferred to Phase 6 frontend plan
  console.log('[reportService] processReportChat: stub');
}

/**
 * Resolve the DOCX download path for a completed report.
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
