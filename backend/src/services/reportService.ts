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

/** Python /report/build-section-correction-prompt response. */
interface SectionCorrectionPromptResponse {
  system_prompt: string;
  user_prompt: string;
}

/** Python /report/validate-section-correction response. */
interface ValidateSectionCorrectionResponse {
  section_key: string;
  revised_text: string;
  valid: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Section identification heuristic
// ---------------------------------------------------------------------------

/** Map common keywords in user messages to section keys. */
const SECTION_KEYWORD_MAP: Record<string, string> = {
  summary: 'executive_summary',
  executive: 'executive_summary',
  'risk score': 'risk_score_explanation',
  'risk level': 'risk_score_explanation',
  scoring: 'risk_score_explanation',
  metrics: 'key_metrics_text',
  severity: 'severity_analysis',
  category: 'category_analysis',
  categories: 'category_analysis',
  threats: 'key_threats',
  threat: 'key_threats',
  compliance: 'compliance_risk_text',
  'non-compliance': 'compliance_risk_text',
  conformidade: 'compliance_risk_text',
  vulnerabilities: 'top_vulnerabilities_text',
  'top 10': 'top_vulnerabilities_text',
  recommendations: 'strategic_recommendations',
  recommendation: 'strategic_recommendations',
  positive: 'positive_aspects',
  strengths: 'positive_aspects',
  conclusion: 'conclusion',
};

/**
 * Identify the target section from a user correction message.
 * Uses keyword matching against section names and common aliases.
 * Returns the section key and whether the match was confident.
 */
function identifyTargetSection(
  message: string,
  availableSections: string[],
): { sectionKey: string; confident: boolean } {
  const lowerMessage = message.toLowerCase();

  // Try exact section key references first
  for (const key of availableSections) {
    if (lowerMessage.includes(key.replace(/_/g, ' '))) {
      return { sectionKey: key, confident: true };
    }
  }

  // Try keyword heuristic
  for (const [keyword, sectionKey] of Object.entries(SECTION_KEYWORD_MAP)) {
    if (lowerMessage.includes(keyword) && availableSections.includes(sectionKey)) {
      return { sectionKey, confident: true };
    }
  }

  // For strategic_recommendations sub-keys
  if (
    (lowerMessage.includes('immediate') || lowerMessage.includes('short term') ||
     lowerMessage.includes('long term') || lowerMessage.includes('board')) &&
    availableSections.some((k) => k.startsWith('strategic_recommendations'))
  ) {
    // Find the right sub-key
    for (const key of availableSections) {
      if (key.startsWith('strategic_recommendations')) {
        if (lowerMessage.includes('immediate') && key.includes('immediate')) return { sectionKey: key, confident: true };
        if (lowerMessage.includes('short') && key.includes('short')) return { sectionKey: key, confident: true };
        if (lowerMessage.includes('long') && key.includes('long')) return { sectionKey: key, confident: true };
        if (lowerMessage.includes('board') && key.includes('board')) return { sectionKey: key, confident: true };
      }
    }
  }

  // Default to executive_summary if no match
  const defaultKey = availableSections.includes('executive_summary')
    ? 'executive_summary'
    : availableSections[0] || 'executive_summary';

  return { sectionKey: defaultKey, confident: false };
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
// Python response types for generation pipeline
// ---------------------------------------------------------------------------

/** Python /report/compute-metrics response. */
interface ComputeMetricsResponse {
  risk_score: number;
  risk_level: string;
  severity_counts: Record<string, number>;
  compliance_scores: Record<string, number>;
  category_counts: Record<string, number>;
}

/** Python /report/render-charts response. */
interface RenderChartsResponse {
  charts: Record<string, string>; // chart name -> base64 PNG
}

/** Python /report/build-narrative-prompt response. */
interface NarrativePromptResponse {
  system_prompt: string;
  user_prompt: string;
}

/** Python /report/validate-narrative response. */
interface ValidateNarrativeResponse {
  sections: Record<string, string>;
  valid: boolean;
  error: string | null;
}

/** Python /report/build-report response. */
interface BuildReportResponse {
  docx_base64: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// Pass 2: Generation pipeline
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
  const state = await getReportSession(userId, sessionId);
  if (!state) {
    throw new Error(`Report session not found: ${sessionId}`);
  }

  if (!state.findingsJson) {
    throw new Error('No findings available. Run extraction (Pass 1) first.');
  }

  const sanitizerUrl = config.SANITIZER_URL;
  const findings = Array.isArray(state.findingsJson)
    ? state.findingsJson
    : [state.findingsJson];

  // -----------------------------------------------------------------------
  // Stage 1: Compute metrics
  // -----------------------------------------------------------------------
  sendStageEvent?.('computing', 0);

  const metricsRes = await fetch(`${sanitizerUrl}/report/compute-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ findings }),
  });

  if (!metricsRes.ok) {
    const detail = await metricsRes.text();
    throw new Error(`Compute metrics failed: ${detail}`);
  }

  const metrics = await metricsRes.json() as ComputeMetricsResponse;
  sendStageEvent?.('computing', 100);

  console.log(
    `[reportService] Computed metrics: risk_score=${metrics.risk_score}, ` +
    `risk_level=${metrics.risk_level}, categories=${Object.keys(metrics.category_counts).length}`,
  );

  // -----------------------------------------------------------------------
  // Stage 2: Render charts
  // -----------------------------------------------------------------------
  sendStageEvent?.('generating_charts', 0);

  // Build stacked data: category -> { severity: count }
  const stackedData: Record<string, Record<string, number>> = {};
  for (const finding of findings) {
    const category = (finding as Record<string, unknown>).category as string || 'Other';
    const severity = ((finding as Record<string, unknown>).severity as string || 'medium').toLowerCase();
    if (!stackedData[category]) {
      stackedData[category] = {};
    }
    stackedData[category][severity] = (stackedData[category][severity] || 0) + 1;
  }

  const chartsRes = await fetch(`${sanitizerUrl}/report/render-charts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      severity_counts: metrics.severity_counts,
      category_counts: metrics.category_counts,
      stacked_data: stackedData,
      compliance_scores: metrics.compliance_scores,
      risk_score: metrics.risk_score,
    }),
  });

  if (!chartsRes.ok) {
    const detail = await chartsRes.text();
    throw new Error(`Render charts failed: ${detail}`);
  }

  const chartsData = await chartsRes.json() as RenderChartsResponse;
  sendStageEvent?.('generating_charts', 100);

  console.log(`[reportService] Rendered ${Object.keys(chartsData.charts).length} charts`);

  // -----------------------------------------------------------------------
  // Stage 3: Build narrative prompt + LLM Pass 2
  // -----------------------------------------------------------------------
  sendStageEvent?.('narrative', 0);

  // Build chart descriptions for the narrative prompt
  const chartDescriptions: Record<string, string> = {};
  for (const [chartName] of Object.entries(chartsData.charts)) {
    // Provide textual descriptions of chart data for the LLM
    if (chartName === 'Severity Distribution') {
      chartDescriptions[chartName] = `Severity breakdown: ${JSON.stringify(metrics.severity_counts)}`;
    } else if (chartName === 'Category Bar') {
      chartDescriptions[chartName] = `Categories: ${JSON.stringify(metrics.category_counts)}`;
    } else if (chartName === 'Compliance Radar') {
      chartDescriptions[chartName] = `Compliance scores: ${JSON.stringify(metrics.compliance_scores)}`;
    } else if (chartName === 'Risk Score Card') {
      chartDescriptions[chartName] = `Risk score: ${metrics.risk_score}/100 (${metrics.risk_level})`;
    } else {
      chartDescriptions[chartName] = `Chart data available`;
    }
  }

  const narrativePromptRes = await fetch(`${sanitizerUrl}/report/build-narrative-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      findings,
      metrics: {
        severity_counts: metrics.severity_counts,
        category_counts: metrics.category_counts,
        total: findings.length,
      },
      compliance_scores: metrics.compliance_scores,
      risk_score: metrics.risk_score,
      chart_descriptions: chartDescriptions,
      language: state.detectedLanguage || 'en',
    }),
  });

  if (!narrativePromptRes.ok) {
    const detail = await narrativePromptRes.text();
    throw new Error(`Build narrative prompt failed: ${detail}`);
  }

  const narrativePromptData = await narrativePromptRes.json() as NarrativePromptResponse;

  sendStageEvent?.('narrative', 20);

  // LLM Pass 2: Generate narrative text
  const client = await createLLMClient();
  const narrativeMessages: LLMMessage[] = [
    { role: 'system', content: narrativePromptData.system_prompt },
    { role: 'user', content: narrativePromptData.user_prompt },
  ];

  let narrativeResponse = '';
  const narrativeStream = client.generateStream(narrativeMessages, {
    maxTokens: 16384,
    feature: 'executive-report',
  });

  for await (const chunk of narrativeStream) {
    if (chunk.text) {
      narrativeResponse += chunk.text;
      sendDelta?.(chunk.text);
    }
  }

  if (!narrativeResponse.trim()) {
    throw new Error('LLM returned empty response for narrative generation');
  }

  sendStageEvent?.('narrative', 80);

  // Validate narrative response
  const validateNarrativeRes = await fetch(`${sanitizerUrl}/report/validate-narrative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_json: narrativeResponse }),
  });

  if (!validateNarrativeRes.ok) {
    const detail = await validateNarrativeRes.text();
    throw new Error(`Narrative validation failed: ${detail}`);
  }

  const narrativeData = await validateNarrativeRes.json() as ValidateNarrativeResponse;

  if (!narrativeData.valid) {
    throw new Error(`Narrative validation failed: ${narrativeData.error || 'Unknown error'}`);
  }

  sendStageEvent?.('narrative', 100);

  console.log(
    `[reportService] Validated narrative: ${Object.keys(narrativeData.sections).length} sections`,
  );

  // -----------------------------------------------------------------------
  // Stage 4: De-sanitize narratives + metadata
  // -----------------------------------------------------------------------
  sendStageEvent?.('building_report', 0);

  const desanitizedSections: Record<string, string> = {};

  for (const [sectionKey, sectionText] of Object.entries(narrativeData.sections)) {
    try {
      const result = await desanitizeText(sectionText, sessionId);
      desanitizedSections[sectionKey] = result.text;

      if (result.unresolvedPlaceholders.length > 0) {
        console.warn(
          `[reportService] Unresolved placeholders in section ${sectionKey}:`,
          result.unresolvedPlaceholders,
        );
      }
    } catch (err) {
      console.warn(
        `[reportService] De-sanitization failed for section ${sectionKey}, using sanitized text:`,
        err,
      );
      desanitizedSections[sectionKey] = sectionText;
    }
  }

  // De-sanitize metadata fields
  const desanitizedMetadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.metadata)) {
    if (value) {
      try {
        const result = await desanitizeText(value, sessionId);
        desanitizedMetadata[key] = result.text;
      } catch {
        desanitizedMetadata[key] = value;
      }
    } else {
      desanitizedMetadata[key] = value || '';
    }
  }

  sendStageEvent?.('building_report', 30);

  // -----------------------------------------------------------------------
  // Stage 5: Build DOCX report via Python
  // -----------------------------------------------------------------------
  const buildRes = await fetch(`${sanitizerUrl}/report/build-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: state.detectedLanguage || 'en',
      narrative_sections: desanitizedSections,
      metadata: {
        client_name: desanitizedMetadata.clientName || '',
        project_code: desanitizedMetadata.projectCode || '',
        report_date: new Date().toISOString().split('T')[0],
        start_date: desanitizedMetadata.startDate || '',
        end_date: desanitizedMetadata.endDate || '',
      },
      chart_images: chartsData.charts,
      risk_score: metrics.risk_score,
      risk_level: metrics.risk_level,
    }),
  });

  if (!buildRes.ok) {
    const detail = await buildRes.text();
    throw new Error(`Report build failed: ${detail}`);
  }

  const buildData = await buildRes.json() as BuildReportResponse;

  sendStageEvent?.('building_report', 80);

  // Save DOCX to disk
  const docxBuffer = Buffer.from(buildData.docx_base64, 'base64');
  const docxFilename = buildData.filename || `executive_report_${sessionId}.docx`;
  const docxPath = path.join(DOCUMENTS_DIR, docxFilename);
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  fs.writeFileSync(docxPath, docxBuffer);

  sendStageEvent?.('building_report', 100);

  console.log(`[reportService] Saved report DOCX: ${docxPath} (${docxBuffer.length} bytes)`);

  // -----------------------------------------------------------------------
  // Stage 6: Queue PDF conversion via Gotenberg
  // -----------------------------------------------------------------------
  sendStageEvent?.('converting_pdf', 0);

  const pdfJobId = await addPdfConversionJob(docxPath, docxFilename);

  sendStageEvent?.('converting_pdf', 100);

  console.log(`[reportService] Queued PDF conversion job: ${pdfJobId}`);

  // -----------------------------------------------------------------------
  // Update session state with all generation results
  // -----------------------------------------------------------------------
  await updateReportSession(userId, sessionId, {
    currentStep: 'review',
    riskScore: metrics.risk_score,
    complianceScores: metrics.compliance_scores,
    chartData: chartsData.charts as unknown as Record<string, unknown>,
    narrativeSections: desanitizedSections,
    reportDocxPath: docxPath,
    reportPdfJobId: pdfJobId,
  });

  return {
    reportDocxPath: docxPath,
    pdfJobId,
  };
}

/**
 * Process a chat correction message for targeted section regeneration.
 *
 * Flow:
 * 1. Load session state (must be in 'review' step with narrative sections)
 * 2. Identify target section from user message via keyword heuristic
 * 3. Re-sanitize user feedback using session forward mappings
 * 4. Build correction prompt via Python service
 * 5. Stream LLM correction call, emit delta events
 * 6. Validate correction response via Python service
 * 7. De-sanitize revised text
 * 8. Update session with new narrative section text
 * 9. Rebuild DOCX via Python service
 * 10. Queue new PDF via Gotenberg
 * 11. Emit section_update SSE event
 * 12. Increment chat iteration count
 *
 * @param sendDelta - SSE callback for LLM token streaming
 * @param sendSectionUpdate - SSE callback for section updates
 */
export async function processReportChat(
  userId: string,
  sessionId: string,
  message: string,
  sendDelta: (text: string) => void,
  sendSectionUpdate: (sectionKey: string, text: string) => void,
): Promise<{ sectionKey: string; pdfJobId: string }> {
  // Step 1: Load and validate session
  const state = await getReportSession(userId, sessionId);
  if (!state) {
    throw new Error(`Report session not found: ${sessionId}`);
  }

  if (!state.narrativeSections || Object.keys(state.narrativeSections).length === 0) {
    throw new Error('No narrative sections available. Generate the report first.');
  }

  const sanitizerUrl = config.SANITIZER_URL;
  const availableSections = Object.keys(state.narrativeSections);

  // Step 2: Identify target section from user message
  const { sectionKey, confident } = identifyTargetSection(message, availableSections);

  if (!confident) {
    sendDelta(
      `I'll update the "${sectionKey.replace(/_/g, ' ')}" section based on your feedback. ` +
      `(Tip: mention a specific section name for more precise targeting.)\n\n`,
    );
  } else {
    sendDelta(
      `Updating the "${sectionKey.replace(/_/g, ' ')}" section...\n\n`,
    );
  }

  const currentText = state.narrativeSections[sectionKey] || '';

  // Step 3: Re-sanitize user feedback using session forward mappings
  let sanitizedFeedback = message;
  if (state.sanitizationMappings?.forward) {
    // Replace real names with placeholders so the LLM doesn't see PII
    for (const [realText, placeholder] of Object.entries(state.sanitizationMappings.forward)) {
      if (sanitizedFeedback.includes(realText)) {
        sanitizedFeedback = sanitizedFeedback.split(realText).join(placeholder);
      }
    }
  }

  // Also re-sanitize the current section text (it was de-sanitized for storage)
  let sanitizedCurrentText = currentText;
  if (state.sanitizationMappings?.forward) {
    for (const [realText, placeholder] of Object.entries(state.sanitizationMappings.forward)) {
      if (sanitizedCurrentText.includes(realText)) {
        sanitizedCurrentText = sanitizedCurrentText.split(realText).join(placeholder);
      }
    }
  }

  // Step 4: Build correction prompt via Python
  const reportContext: Record<string, unknown> = {
    risk_score: state.riskScore,
    findings_summary: Array.isArray(state.findingsJson)
      ? `${state.findingsJson.length} findings extracted`
      : 'Findings extracted',
    other_sections: {} as Record<string, string>,
  };

  // Add other sections as context (first 200 chars each, sanitized)
  for (const [key, text] of Object.entries(state.narrativeSections)) {
    if (key !== sectionKey && text) {
      let sanitizedPreview = text;
      if (state.sanitizationMappings?.forward) {
        for (const [realText, placeholder] of Object.entries(state.sanitizationMappings.forward)) {
          if (sanitizedPreview.includes(realText)) {
            sanitizedPreview = sanitizedPreview.split(realText).join(placeholder);
          }
        }
      }
      (reportContext.other_sections as Record<string, string>)[key] = sanitizedPreview;
    }
  }

  const promptRes = await fetch(`${sanitizerUrl}/report/build-section-correction-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section_key: sectionKey,
      current_text: sanitizedCurrentText,
      user_feedback: sanitizedFeedback,
      report_context: reportContext,
      language: state.detectedLanguage || 'en',
    }),
  });

  if (!promptRes.ok) {
    const detail = await promptRes.text();
    throw new Error(`Failed to build correction prompt: ${detail}`);
  }

  const promptData = await promptRes.json() as SectionCorrectionPromptResponse;

  // Step 5: LLM correction call with streaming
  const client = await createLLMClient();
  const messages: LLMMessage[] = [
    { role: 'system', content: promptData.system_prompt },
    { role: 'user', content: promptData.user_prompt },
  ];

  let llmResponse = '';
  const stream = client.generateStream(messages, {
    maxTokens: 4096,
    feature: 'executive-report',
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      llmResponse += chunk.text;
      sendDelta(chunk.text);
    }
  }

  if (!llmResponse.trim()) {
    throw new Error('LLM returned empty response for section correction');
  }

  // Step 6: Validate correction response via Python
  const validateRes = await fetch(`${sanitizerUrl}/report/validate-section-correction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw_json: llmResponse,
      expected_section_key: sectionKey,
    }),
  });

  if (!validateRes.ok) {
    const detail = await validateRes.text();
    throw new Error(`Section correction validation failed: ${detail}`);
  }

  const validateData = await validateRes.json() as ValidateSectionCorrectionResponse;

  if (!validateData.valid) {
    throw new Error(`Section correction validation failed: ${validateData.error || 'Unknown error'}`);
  }

  // Step 7: De-sanitize revised text
  let revisedText = validateData.revised_text;
  try {
    const desanResult = await desanitizeText(revisedText, sessionId);
    revisedText = desanResult.text;

    if (desanResult.unresolvedPlaceholders.length > 0) {
      console.warn(
        `[reportService] Unresolved placeholders in corrected section ${sectionKey}:`,
        desanResult.unresolvedPlaceholders,
      );
    }
  } catch (err) {
    console.warn(
      `[reportService] De-sanitization failed for corrected section ${sectionKey}, ` +
      `falling back to local reverse mapping:`,
      err,
    );
    // Fallback: apply reverse mappings locally
    if (state.sanitizationMappings?.reverse) {
      for (const [placeholder, realText] of Object.entries(state.sanitizationMappings.reverse)) {
        if (revisedText.includes(placeholder)) {
          revisedText = revisedText.split(placeholder).join(realText);
        }
      }
    }
  }

  // Step 8: Update session with new section text
  const updatedNarrativeSections = {
    ...state.narrativeSections,
    [sectionKey]: revisedText,
  };

  // Step 9: Rebuild DOCX with updated sections
  const buildRes = await fetch(`${sanitizerUrl}/report/build-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: state.detectedLanguage || 'en',
      narrative_sections: updatedNarrativeSections,
      metadata: {
        client_name: state.metadata.clientName || '',
        project_code: state.metadata.projectCode || '',
        report_date: new Date().toISOString().split('T')[0],
        start_date: state.metadata.startDate || '',
        end_date: state.metadata.endDate || '',
      },
      chart_images: (state.chartData || {}) as Record<string, string>,
      risk_score: state.riskScore || 0,
      risk_level: '',
    }),
  });

  if (!buildRes.ok) {
    const detail = await buildRes.text();
    throw new Error(`Report rebuild failed: ${detail}`);
  }

  const buildData = await buildRes.json() as BuildReportResponse;

  // Save updated DOCX to disk
  const docxBuffer = Buffer.from(buildData.docx_base64, 'base64');
  const docxFilename = buildData.filename || `executive_report_${sessionId}.docx`;
  const docxPath = path.join(DOCUMENTS_DIR, docxFilename);
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  fs.writeFileSync(docxPath, docxBuffer);

  // Step 10: Queue new PDF conversion
  const pdfJobId = await addPdfConversionJob(docxPath, docxFilename);

  console.log(
    `[reportService] Corrected section "${sectionKey}", rebuilt DOCX, ` +
    `queued PDF job ${pdfJobId}`,
  );

  // Step 11: Update session state
  const chatMsg: import('./reportWizardState.js').ReportChatMessage = {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  };

  const assistantMsg: import('./reportWizardState.js').ReportChatMessage = {
    role: 'assistant',
    content: `Updated section: ${sectionKey.replace(/_/g, ' ')}`,
    timestamp: new Date().toISOString(),
  };

  await updateReportSession(userId, sessionId, {
    narrativeSections: updatedNarrativeSections,
    reportDocxPath: docxPath,
    reportPdfJobId: pdfJobId,
    reportPdfUrl: null, // Reset so preview re-polls
    chatHistory: [...state.chatHistory, chatMsg, assistantMsg],
    chatIterationCount: state.chatIterationCount + 1,
  });

  // Step 12: Emit section_update event
  sendSectionUpdate(sectionKey, revisedText);

  return { sectionKey, pdfJobId };
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
