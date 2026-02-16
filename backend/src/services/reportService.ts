/**
 * Executive Report Service -- orchestrates the report generation pipeline.
 *
 * Upload: DOCX -> mammoth HTML -> Presidio sanitize HTML text nodes -> extract supplementary
 * Pass 1 (Extract): Sanitized paragraphs -> LLM Opus 4.6 -> structured findings JSON
 * Compute: Risk score, severity distributions, compliance mapping
 * Chart Data: Compute Chart.js JSON configs (no server-side rendering)
 * Pass 2 (Generate): Computed data + findings -> LLM -> HTML narrative sections with CSS classes
 * Build: HTML skeleton + narrative HTML + Chart.js configs -> complete HTML document
 * PDF: Gotenberg Chromium HTML->PDF (with waitDelay for Chart.js rendering)
 * Chat: Targeted section regeneration updates HTML section and re-converts PDF
 *
 * De-sanitization is NOT done before HTML assembly. The generated HTML stays
 * sanitized; de-sanitization is a frontend-only toggle in the Review step.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { createLLMClient } from './llm/client.js';
import { convertDocxToHtml } from './docxToHtml.js';
import { sanitizeHtmlTextNodes } from './htmlSanitizer.js';
import { addPdfConversionJob } from './pdfQueue.js';
import type { LLMMessage } from '../types/llm.js';
import {
  createReportSession,
  getReportSession,
  updateReportSession,
  type ReportWizardState,
  type SanitizedParagraph,
  type SanitizationMappings,
  type EntityMapping,
} from './reportWizardState.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'documents');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result from the upload step (includes sanitization since pipeline auto-completes). */
export interface UploadResult {
  sessionId: string;
  detectedLanguage: string;
  sanitizedHtml: string;
  entityMappings: EntityMapping[];
}

/** Result from re-sanitization (when entity mappings change). */
export interface SanitizeResult {
  sanitizedHtml: string;
  entityMappings: EntityMapping[];
  sanitizedParagraphs: SanitizedParagraph[];
  sanitizationMappings: SanitizationMappings;
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

/** Python /adapter/extract-supplementary response. */
interface ExtractSupplementaryResponse {
  headers: string[];
  footers: string[];
  text_boxes: string[];
}

// ---------------------------------------------------------------------------
// Upload (DOCX -> HTML -> sanitize -> extract supplementary)
// ---------------------------------------------------------------------------

/**
 * Upload a technical report DOCX and run the full pipeline:
 * 1. Save DOCX to disk (for supplementary extraction)
 * 2. Convert DOCX to HTML via mammoth
 * 3. Detect language from HTML text
 * 4. Sanitize HTML text nodes via Presidio
 * 5. Extract supplementary text (headers/footers/text boxes)
 * 6. Store all results in session
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
  const sanitizerUrl = config.SANITIZER_URL;

  // Step 1: Save DOCX to disk (needed for supplementary extraction)
  const filename = `report_${state.sessionId}_${Date.now()}.docx`;
  const filePath = path.join(DOCUMENTS_DIR, filename);
  fs.writeFileSync(filePath, file);

  const base64Content = file.toString('base64');

  // Step 2: Convert DOCX to HTML via mammoth
  const { html: uploadedHtml } = await convertDocxToHtml(file);

  console.log(
    `[reportService] Converted DOCX to HTML: ${uploadedHtml.length} chars`,
  );

  // Step 3: Detect language from HTML text content (~500 chars)
  let detectedLanguage = 'en';
  try {
    // Strip tags to get plain text for language detection
    const plainText = uploadedHtml.replace(/<[^>]+>/g, ' ').trim();
    const sampleText = plainText.substring(0, 1000);

    if (sampleText.trim()) {
      const langRes = await fetch(`${sanitizerUrl}/sanitize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          deny_list_terms: [],
          session_id: state.sessionId,
        }),
      });

      if (langRes.ok) {
        const langData = await langRes.json() as { language: string };
        if (langData.language) {
          detectedLanguage = langData.language === 'pt' ? 'pt-pt' : langData.language;
        }
      }
    }
  } catch (err) {
    console.warn('[reportService] Language detection failed, defaulting to "en":', err);
  }

  // Step 4: Sanitize HTML text nodes via Presidio
  const counterMap: Record<string, Record<string, number>> = {};
  const sanitizeResult = await sanitizeHtmlTextNodes(
    uploadedHtml,
    state.sessionId,
    counterMap,
    detectedLanguage,
  );

  console.log(
    `[reportService] Sanitized HTML: ${sanitizeResult.entityMappings.length} entities, ` +
    `${sanitizeResult.sanitizedParagraphs.length} paragraphs`,
  );

  // Step 5: Extract supplementary text (headers/footers/text boxes)
  let supplementaryText = { headers: [] as string[], footers: [] as string[], textBoxes: [] as string[] };
  try {
    const suppRes = await fetch(`${sanitizerUrl}/adapter/extract-supplementary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_base64: base64Content }),
    });

    if (suppRes.ok) {
      const suppData = await suppRes.json() as ExtractSupplementaryResponse;
      supplementaryText = {
        headers: suppData.headers || [],
        footers: suppData.footers || [],
        textBoxes: suppData.text_boxes || [],
      };
    }
  } catch (err) {
    console.warn('[reportService] Supplementary text extraction failed:', err);
  }

  // Step 6: Check for edge cases
  const warnings: string[] = [];
  if (sanitizeResult.sanitizedParagraphs.length < 5) {
    warnings.push(
      `short_report: Only ${sanitizeResult.sanitizedParagraphs.length} paragraph(s) extracted from the report. ` +
      `The report may be very short or poorly formatted. Results may be limited.`,
    );
  }

  // Step 7: Update session with all pipeline results
  await updateReportSession(userId, state.sessionId, {
    currentStep: 'sanitize-review',
    uploadedFile: {
      originalName,
      storagePath: filePath,
      base64: base64Content,
      uploadedAt: new Date().toISOString(),
    },
    detectedLanguage,
    uploadedHtml,
    sanitizedHtml: sanitizeResult.sanitizedHtml,
    entityMappings: sanitizeResult.entityMappings,
    entityCounterMap: sanitizeResult.updatedCounterMap,
    supplementaryText,
    sanitizedParagraphs: sanitizeResult.sanitizedParagraphs,
    sanitizationMappings: {
      forward: sanitizeResult.forwardMappings,
      reverse: sanitizeResult.reverseMappings,
    },
    warnings,
  });

  return {
    sessionId: state.sessionId,
    detectedLanguage,
    sanitizedHtml: sanitizeResult.sanitizedHtml,
    entityMappings: sanitizeResult.entityMappings,
  };
}

// ---------------------------------------------------------------------------
// Re-sanitization (when entity mappings change)
// ---------------------------------------------------------------------------

/**
 * Re-sanitize the uploaded HTML with the current counter map.
 * Called when user modifies entity mappings from the frontend.
 */
export async function sanitizeReport(
  userId: string,
  sessionId: string,
): Promise<SanitizeResult> {
  const state = await getReportSession(userId, sessionId);
  if (!state) {
    throw new Error(`Report session not found: ${sessionId}`);
  }

  if (!state.uploadedHtml) {
    throw new Error('No uploaded HTML in session. Upload a DOCX first.');
  }

  // Re-run sanitization on the original uploaded HTML
  const counterMap = { ...state.entityCounterMap };
  const sanitizeResult = await sanitizeHtmlTextNodes(
    state.uploadedHtml,
    sessionId,
    counterMap,
    state.detectedLanguage,
  );

  // Update session state
  await updateReportSession(userId, sessionId, {
    sanitizedHtml: sanitizeResult.sanitizedHtml,
    entityMappings: sanitizeResult.entityMappings,
    entityCounterMap: sanitizeResult.updatedCounterMap,
    sanitizedParagraphs: sanitizeResult.sanitizedParagraphs,
    sanitizationMappings: {
      forward: sanitizeResult.forwardMappings,
      reverse: sanitizeResult.reverseMappings,
    },
  });

  console.log(
    `[reportService] Re-sanitized HTML: ${sanitizeResult.entityMappings.length} entities`,
  );

  return {
    sanitizedHtml: sanitizeResult.sanitizedHtml,
    entityMappings: sanitizeResult.entityMappings,
    sanitizedParagraphs: sanitizeResult.sanitizedParagraphs,
    sanitizationMappings: {
      forward: sanitizeResult.forwardMappings,
      reverse: sanitizeResult.reverseMappings,
    },
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

  // Merge extraction warnings with any existing warnings from sanitization
  const existingWarnings = state.warnings || [];
  const extractionWarnings = validateData.warnings || [];
  const allWarnings = [
    ...existingWarnings,
    ...extractionWarnings.filter((w: string) => !existingWarnings.includes(w)),
  ];

  await updateReportSession(userId, sessionId, {
    currentStep: 'generate',
    findingsJson: validateData.findings as unknown as Record<string, unknown>,
    metadata,
    warnings: allWarnings,
  });

  console.log(
    `[reportService] Extracted ${validateData.findings.length} findings, ` +
    `${allWarnings.length} warnings (${extractionWarnings.length} from extraction)`,
  );

  return {
    findings: validateData.findings,
    metadata,
    warnings: allWarnings,
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

/** Python /report/compute-chart-data response. */
interface ComputeChartDataResponse {
  chart_configs: Record<string, object>; // chart ID -> Chart.js config
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

/** Python /report/build-report response (HTML). */
interface BuildReportResponse {
  html_content: string;
}

// ---------------------------------------------------------------------------
// Pass 2: Generation pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full report generation pipeline:
 * compute-metrics -> compute-chart-data (JSON) -> LLM Pass 2 (HTML) -> build-html-report -> Gotenberg (HTML->PDF).
 *
 * De-sanitization is NOT done before HTML assembly -- the LLM works with
 * sanitized text and de-sanitization is a frontend-only toggle in Review.
 *
 * @param userId - Authenticated user ID
 * @param sessionId - Report wizard session ID
 * @param sendStageEvent - Optional SSE callback for progress reporting
 * @param sendDelta - Optional SSE callback for LLM token streaming
 * @returns PDF job ID
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
  // Stage 2: Compute chart data (Chart.js JSON configs)
  // -----------------------------------------------------------------------
  sendStageEvent?.('chart_data', 0);

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

  const chartsRes = await fetch(`${sanitizerUrl}/report/compute-chart-data`, {
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
    throw new Error(`Compute chart data failed: ${detail}`);
  }

  const chartsData = await chartsRes.json() as ComputeChartDataResponse;
  sendStageEvent?.('chart_data', 100);

  console.log(`[reportService] Computed ${Object.keys(chartsData.chart_configs).length} chart configs`);

  // -----------------------------------------------------------------------
  // Stage 3: Build narrative prompt + LLM Pass 2 (HTML output)
  // -----------------------------------------------------------------------
  sendStageEvent?.('narrative', 0);

  // Build chart descriptions for the narrative prompt (data summaries, not chart HTML)
  const chartDescriptions: Record<string, string> = {
    severity_pie: `Severity breakdown: ${JSON.stringify(metrics.severity_counts)}`,
    category_bar: `Categories: ${JSON.stringify(metrics.category_counts)}`,
    compliance_radar: `Compliance scores: ${JSON.stringify(metrics.compliance_scores)}`,
    risk_score: `Risk score: ${metrics.risk_score}/100 (${metrics.risk_level})`,
    stacked_severity: `Severity by category: ${Object.keys(stackedData).length} categories`,
    top_vulnerabilities: `Top vulnerabilities by severity count`,
  };

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

  // LLM Pass 2: Generate HTML narrative sections
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
  // Stage 4: Assemble HTML report (no de-sanitization -- frontend-only)
  // -----------------------------------------------------------------------
  sendStageEvent?.('assembling_html', 0);

  const buildRes = await fetch(`${sanitizerUrl}/report/build-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: state.detectedLanguage || 'en',
      narrative_sections: narrativeData.sections,
      metadata: {
        client_name: state.metadata.clientName || '',
        project_code: state.metadata.projectCode || '',
        report_date: new Date().toISOString().split('T')[0],
        start_date: state.metadata.startDate || '',
        end_date: state.metadata.endDate || '',
      },
      chart_configs: chartsData.chart_configs,
      metrics: {
        severity_counts: metrics.severity_counts,
        category_counts: metrics.category_counts,
        total: findings.length,
      },
      risk_score: metrics.risk_score,
      risk_level: metrics.risk_level,
    }),
  });

  if (!buildRes.ok) {
    const detail = await buildRes.text();
    throw new Error(`Report build failed: ${detail}`);
  }

  const buildData = await buildRes.json() as BuildReportResponse;

  sendStageEvent?.('assembling_html', 100);

  console.log(`[reportService] Assembled HTML report: ${buildData.html_content.length} chars`);

  // -----------------------------------------------------------------------
  // Stage 5: Convert HTML to PDF via Gotenberg Chromium
  // -----------------------------------------------------------------------
  sendStageEvent?.('converting_pdf', 0);

  // Save HTML to a temp file for Gotenberg
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const htmlFilename = `executive_report_${sessionId}.html`;
  const htmlPath = path.join(DOCUMENTS_DIR, htmlFilename);
  fs.writeFileSync(htmlPath, buildData.html_content, 'utf-8');

  const pdfJobId = await addPdfConversionJob(htmlPath, htmlFilename);

  sendStageEvent?.('converting_pdf', 100);

  console.log(`[reportService] Queued PDF conversion job: ${pdfJobId}`);

  // -----------------------------------------------------------------------
  // Update session state with all generation results
  // -----------------------------------------------------------------------
  await updateReportSession(userId, sessionId, {
    currentStep: 'review',
    riskScore: metrics.risk_score,
    complianceScores: metrics.compliance_scores,
    chartConfigs: chartsData.chart_configs as Record<string, object>,
    narrativeSections: narrativeData.sections,
    generatedHtml: buildData.html_content,
    reportPdfJobId: pdfJobId,
  });

  return {
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

  // Step 7: Use revised HTML as-is (de-sanitization is frontend-only)
  const revisedText = validateData.revised_text;

  // Step 8: Update session with new section text
  const updatedNarrativeSections = {
    ...state.narrativeSections,
    [sectionKey]: revisedText,
  };

  // Step 9: Rebuild HTML report with updated sections
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
      chart_configs: (state.chartConfigs || {}) as Record<string, object>,
      metrics: {},
      risk_score: state.riskScore || 0,
      risk_level: '',
    }),
  });

  if (!buildRes.ok) {
    const detail = await buildRes.text();
    throw new Error(`Report rebuild failed: ${detail}`);
  }

  const buildData = await buildRes.json() as BuildReportResponse;

  // Save updated HTML and queue PDF conversion
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const htmlFilename = `executive_report_${sessionId}.html`;
  const htmlPath = path.join(DOCUMENTS_DIR, htmlFilename);
  fs.writeFileSync(htmlPath, buildData.html_content, 'utf-8');

  // Step 10: Queue new PDF conversion via Gotenberg Chromium
  const pdfJobId = await addPdfConversionJob(htmlPath, htmlFilename);

  console.log(
    `[reportService] Corrected section "${sectionKey}", rebuilt HTML, ` +
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
    generatedHtml: buildData.html_content,
    reportPdfJobId: pdfJobId,
    reportPdfUrl: null, // Reset so preview re-polls
    chatHistory: [...state.chatHistory, chatMsg, assistantMsg],
    chatIterationCount: state.chatIterationCount + 1,
  });

  // Step 12: Emit section_update event
  sendSectionUpdate(sectionKey, revisedText);

  return { sectionKey, pdfJobId };
}

