/**
 * Template Adapter Service -- orchestrates the full wizard pipeline.
 *
 * Pass 1 (Analysis): POST base64 DOCX to Python /adapter/analyze -> LLM -> /validate-mapping
 * Pass 2 (Insertion): /build-insertion-prompt -> LLM -> /apply
 * Preview: Render adapted DOCX with GW data -> PDF conversion
 * Chat: Iterative feedback to modify mapping plan via SSE streaming
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { createLLMClient } from './llm/client.js';
import { logLLMInteraction } from './llm/audit.js';
import { logAuditEvent } from './audit.js';
import { renderTemplatePreview } from './documents.js';
import type { LLMMessage, LLMStreamChunk } from '../types/llm.js';
import {
  createWizardSession,
  getWizardSession,
  updateWizardSession,
  type WizardState,
  type WizardAnnotatedPreview,
} from './wizardState.js';
import { addPdfConversionJob } from './pdfQueue.js';
import { queryFewShotExamples, bulkUpsertMappings, type TemplateMappingInput } from './templateMapping.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'documents');

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface MappingEntry {
  sectionIndex: number;
  sectionText: string;
  gwField: string;
  placeholderTemplate: string;
  confidence: number;
  markerType: string;
  rationale: string;
}

export interface MappingPlan {
  entries: MappingEntry[];
  templateType: string;
  language: string;
  warnings: string[];
}

export interface AnalysisResult {
  mappingPlan: MappingPlan;
  referenceTemplateHash: string;
}

/** Response from Python /adapter/analyze */
interface AnalyzeServiceResponse {
  prompt: string;
  system_prompt: string;
  doc_structure_summary: Record<string, unknown>;
  reference_template_hash: string;
  paragraph_count: number;
}

/** Response from Python /adapter/validate-mapping */
interface ValidateServiceResponse {
  valid: boolean;
  mapping_plan: {
    entries: Array<{
      section_index: number;
      section_text: string;
      gw_field: string;
      placeholder_template: string;
      confidence: number;
      marker_type: string;
      rationale: string;
    }>;
    template_type: string;
    language: string;
    warnings: string[];
  } | null;
  errors: string[];
}

/** Response from Python /adapter/build-insertion-prompt */
interface InsertionPromptResponse {
  prompt: string;
  system_prompt: string;
}

/** Response from Python /adapter/apply */
interface ApplyServiceResponse {
  output_base64: string;
  applied_count: number;
  skipped_count: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a template and create a new wizard session.
 *
 * Stores the file as base64 in session state (for later Python service calls)
 * and records config (templateType, language).
 */
export async function uploadTemplate(
  file: Express.Multer.File,
  templateType: string,
  language: string,
  userId: string,
): Promise<WizardState> {
  const state = await createWizardSession(userId);

  const templateBase64 = file.buffer.toString('base64');

  return updateWizardSession(userId, state.sessionId, {
    currentStep: 'analysis',
    templateFile: {
      originalName: file.originalname,
      storagePath: '',
      base64: templateBase64,
      uploadedAt: new Date().toISOString(),
    },
    config: {
      templateType,
      language,
    },
  });
}

// ---------------------------------------------------------------------------
// Analysis (Pass 1)
// ---------------------------------------------------------------------------

/**
 * Analyze a client template using LLM Pass 1.
 *
 * @param templateBase64 - Base64-encoded DOCX file content
 * @param templateType - "web" | "internal" | "mobile"
 * @param language - "en" | "pt-pt"
 * @returns Validated mapping plan and reference template hash
 */
export async function analyzeTemplate(
  templateBase64: string,
  templateType: string,
  language: string,
): Promise<AnalysisResult> {
  const sanitizerUrl = config.SANITIZER_URL;

  // Step 0: Query KB for few-shot examples (graceful degradation on failure)
  let fewShotExamples: Array<{
    normalized_section_text: string;
    gw_field: string;
    marker_type: string;
    usage_count: number;
  }> = [];

  try {
    const kbResults = await queryFewShotExamples(templateType, language);
    fewShotExamples = kbResults.map((r) => ({
      normalized_section_text: r.normalizedSectionText,
      gw_field: r.gwField,
      marker_type: r.markerType,
      usage_count: r.usageCount,
    }));
  } catch (err) {
    console.warn('[templateAdapter] KB query failed, continuing with empty examples:', err);
  }

  // Step 1: Get analysis prompt from Python service
  const analyzeRes = await fetch(`${sanitizerUrl}/adapter/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: templateBase64,
      template_type: templateType,
      language: language,
      few_shot_examples: fewShotExamples,
    }),
  });

  if (!analyzeRes.ok) {
    const detail = await analyzeRes.text();
    throw new Error(`Sanitizer /adapter/analyze failed (${analyzeRes.status}): ${detail}`);
  }

  const analyzeData: AnalyzeServiceResponse = await analyzeRes.json() as AnalyzeServiceResponse;

  // Step 2: Call LLM with the analysis prompt (non-streaming for JSON output)
  const client = await createLLMClient();
  const messages: LLMMessage[] = [
    { role: 'system', content: analyzeData.system_prompt },
    { role: 'user', content: analyzeData.prompt },
  ];

  let llmResponse = '';
  const stream = client.generateStream(messages, {
    maxTokens: 4096,
    feature: 'template-adapter',
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      llmResponse += chunk.text;
    }
  }

  if (!llmResponse.trim()) {
    throw new Error('LLM returned empty response for template analysis');
  }

  // Step 3: Validate LLM response via Python service
  const validateRes = await fetch(`${sanitizerUrl}/adapter/validate-mapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llm_response: llmResponse,
      template_type: templateType,
      language: language,
      paragraph_count: analyzeData.paragraph_count,
    }),
  });

  if (!validateRes.ok) {
    const detail = await validateRes.text();
    throw new Error(`Sanitizer /adapter/validate-mapping failed (${validateRes.status}): ${detail}`);
  }

  const validateData: ValidateServiceResponse = await validateRes.json() as ValidateServiceResponse;

  if (!validateData.valid || !validateData.mapping_plan) {
    throw new Error(
      `Mapping validation failed: ${validateData.errors.join('; ')}`,
    );
  }

  // Convert snake_case response to camelCase TypeScript interfaces
  const plan = validateData.mapping_plan;
  const mappingPlan: MappingPlan = {
    entries: plan.entries.map((e) => ({
      sectionIndex: e.section_index,
      sectionText: e.section_text,
      gwField: e.gw_field,
      placeholderTemplate: e.placeholder_template,
      confidence: e.confidence,
      markerType: e.marker_type,
      rationale: e.rationale,
    })),
    templateType: plan.template_type,
    language: plan.language,
    warnings: plan.warnings,
  };

  return {
    mappingPlan,
    referenceTemplateHash: analyzeData.reference_template_hash,
  };
}

// ---------------------------------------------------------------------------
// Apply Instructions (Pass 2)
// ---------------------------------------------------------------------------

/**
 * Convert a camelCase MappingPlan to snake_case for the Python service.
 */
function mappingPlanToSnakeCase(plan: MappingPlan): Record<string, unknown> {
  return {
    entries: plan.entries.map((e) => ({
      section_index: e.sectionIndex,
      section_text: e.sectionText,
      gw_field: e.gwField,
      placeholder_template: e.placeholderTemplate,
      confidence: e.confidence,
      marker_type: e.markerType,
      rationale: e.rationale,
    })),
    template_type: plan.templateType,
    language: plan.language,
    warnings: plan.warnings,
  };
}

/**
 * Apply instructions to the template (LLM Pass 2 + Python apply).
 *
 * Flow:
 * 1. Get insertion prompt from Python (/build-insertion-prompt)
 * 2. Call LLM with insertion prompt (non-streaming, JSON output)
 * 3. POST to Python /adapter/apply with template + instructions
 * 4. Save adapted DOCX to disk
 * 5. Update wizard state
 *
 * On LLM failure, the last good state (analysis) is preserved for retry.
 */
export async function applyInstructions(
  wizardState: WizardState,
): Promise<WizardState> {
  const sanitizerUrl = config.SANITIZER_URL;
  const { userId, sessionId } = wizardState;
  const mappingPlan = wizardState.analysis.mappingPlan as unknown as MappingPlan;

  if (!mappingPlan) {
    throw new Error('No mapping plan in wizard state -- run analysis first');
  }

  // Step 1: Build insertion prompt via Python service
  // Passes template_base64 directly so Python can parse DOCX internally
  const promptRes = await fetch(`${sanitizerUrl}/adapter/build-insertion-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: wizardState.templateFile.base64,
      mapping_plan: mappingPlanToSnakeCase(mappingPlan),
    }),
  });

  if (!promptRes.ok) {
    const detail = await promptRes.text();
    throw new Error(`Sanitizer /adapter/build-insertion-prompt failed (${promptRes.status}): ${detail}`);
  }

  const promptData = await promptRes.json() as InsertionPromptResponse;

  // Step 2: Call LLM with insertion prompt (non-streaming for structured JSON)
  let llmResponse = '';
  try {
    const client = await createLLMClient();
    const messages: LLMMessage[] = [
      { role: 'system', content: promptData.system_prompt },
      { role: 'user', content: promptData.prompt },
    ];

    const stream = client.generateStream(messages, {
      maxTokens: 8192,
      feature: 'template-adapter',
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        llmResponse += chunk.text;
      }
    }
  } catch (error) {
    // LLM failure: preserve last good state (analysis checkpoint)
    console.error('[templateAdapter] LLM Pass 2 failed, preserving checkpoint:', error);
    throw new Error(
      `LLM instruction generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      'Your analysis results are preserved. You can retry this step.',
    );
  }

  if (!llmResponse.trim()) {
    throw new Error('LLM returned empty response for instruction generation');
  }

  // Parse LLM response as instruction set JSON
  let instructionSet: Record<string, unknown>;
  try {
    // Strip markdown code fences if present
    let cleaned = llmResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    instructionSet = JSON.parse(cleaned);
  } catch {
    throw new Error('LLM returned invalid JSON for instruction set');
  }

  // Ensure template_type and language are set
  if (!instructionSet.template_type) {
    instructionSet.template_type = wizardState.config.templateType;
  }
  if (!instructionSet.language) {
    instructionSet.language = wizardState.config.language;
  }

  // Step 3: POST to Python /adapter/apply
  const applyRes = await fetch(`${sanitizerUrl}/adapter/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: wizardState.templateFile.base64,
      instruction_set: instructionSet,
    }),
  });

  if (!applyRes.ok) {
    const detail = await applyRes.text();
    throw new Error(`Sanitizer /adapter/apply failed (${applyRes.status}): ${detail}`);
  }

  const applyData = await applyRes.json() as ApplyServiceResponse;

  // Step 4: Save adapted DOCX to disk
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const adaptedFilename = `${randomUUID()}_adapted.docx`;
  const adaptedPath = path.join(DOCUMENTS_DIR, adaptedFilename);
  const adaptedBuffer = Buffer.from(applyData.output_base64, 'base64');
  fs.writeFileSync(adaptedPath, adaptedBuffer);

  // Step 5: Update wizard state
  const updated = await updateWizardSession(userId, sessionId, {
    currentStep: 'adaptation',
    adaptation: {
      instructions: instructionSet as Record<string, unknown>,
      appliedDocxPath: adaptedPath,
      appliedCount: applyData.applied_count,
      skippedCount: applyData.skipped_count,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/** Default GW report ID for preview rendering. */
const PREVIEW_REPORT_ID = config.GHOSTWRITER_REPORT_ID ?? 1;

/**
 * Generate a preview of the adapted template rendered with GW dummy data.
 *
 * 1. Read the applied DOCX from disk
 * 2. Render with GW report data via renderTemplatePreview()
 * 3. Queue PDF conversion
 * 4. Update wizard state with preview URLs and job ID
 */
export async function generatePreview(
  wizardState: WizardState,
): Promise<WizardState> {
  const { userId, sessionId } = wizardState;
  const appliedDocxPath = wizardState.adaptation.appliedDocxPath;

  if (!appliedDocxPath) {
    throw new Error('No adapted DOCX in wizard state -- run apply first');
  }

  if (!fs.existsSync(appliedDocxPath)) {
    throw new Error(`Adapted DOCX file not found: ${appliedDocxPath}`);
  }

  // Render with GW data and queue PDF conversion
  const { docxPath: renderedDocxPath, jobId } = await renderTemplatePreview(
    appliedDocxPath,
    PREVIEW_REPORT_ID,
  );

  const docxFilename = path.basename(renderedDocxPath);

  const updated = await updateWizardSession(userId, sessionId, {
    currentStep: 'preview',
    preview: {
      pdfJobId: jobId,
      pdfUrl: null, // Will be populated when PDF conversion completes
      docxUrl: `/uploads/documents/${docxFilename}`,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Annotated Preview
// ---------------------------------------------------------------------------

/** Response from Python /adapter/annotate */
interface AnnotateServiceResponse {
  annotated_base64: string;
  tooltip_data: Array<{
    paragraph_index: number;
    gw_field: string;
    marker_type: string;
    section_text: string;
    status: 'mapped' | 'gap';
  }>;
  unmapped_paragraphs: Array<{
    paragraph_index: number;
    text: string;
    heading_level: number | null;
  }>;
  gap_summary: {
    mapped_field_count: number;
    expected_field_count: number;
    coverage_percent: number;
  } | null;
}

/**
 * Generate an annotated preview of the template with shading for mapped/gap paragraphs.
 *
 * 1. POST template + mapping plan to Python /adapter/annotate
 * 2. Save annotated DOCX to disk
 * 3. Queue PDF conversion via Gotenberg
 * 4. Update wizard state with annotation metadata
 */
export async function generateAnnotatedPreview(
  wizardState: WizardState,
): Promise<WizardState> {
  const sanitizerUrl = config.SANITIZER_URL;
  const { userId, sessionId } = wizardState;
  const mappingPlan = wizardState.analysis.mappingPlan as unknown as MappingPlan;

  if (!mappingPlan) {
    throw new Error('No mapping plan in wizard state -- run analysis first');
  }

  const templateBase64 = wizardState.templateFile.base64;
  if (!templateBase64) {
    throw new Error('No template file in wizard state -- upload first');
  }

  // POST to Python /adapter/annotate
  const annotateRes = await fetch(`${sanitizerUrl}/adapter/annotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: templateBase64,
      mapping_plan: mappingPlanToSnakeCase(mappingPlan),
    }),
  });

  if (!annotateRes.ok) {
    const detail = await annotateRes.text();
    throw new Error(`Sanitizer /adapter/annotate failed (${annotateRes.status}): ${detail}`);
  }

  const annotateData: AnnotateServiceResponse = await annotateRes.json() as AnnotateServiceResponse;

  // Save annotated DOCX to disk
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const annotatedFilename = `${randomUUID()}_annotated.docx`;
  const annotatedPath = path.join(DOCUMENTS_DIR, annotatedFilename);
  const annotatedBuffer = Buffer.from(annotateData.annotated_base64, 'base64');
  fs.writeFileSync(annotatedPath, annotatedBuffer);

  // Queue PDF conversion via Gotenberg
  const jobId = await addPdfConversionJob(annotatedPath, annotatedFilename);

  // Convert snake_case response to camelCase for wizard state
  const tooltipData = annotateData.tooltip_data.map((t) => ({
    paragraphIndex: t.paragraph_index,
    gwField: t.gw_field,
    markerType: t.marker_type,
    sectionText: t.section_text,
    status: t.status,
  }));

  const unmappedParagraphs = annotateData.unmapped_paragraphs.map((u) => ({
    paragraphIndex: u.paragraph_index,
    text: u.text,
    headingLevel: u.heading_level,
  }));

  const gapSummary = annotateData.gap_summary
    ? {
        mappedFieldCount: annotateData.gap_summary.mapped_field_count,
        expectedFieldCount: annotateData.gap_summary.expected_field_count,
        coveragePercent: annotateData.gap_summary.coverage_percent,
      }
    : null;

  // Update wizard state with annotated preview data
  const updated = await updateWizardSession(userId, sessionId, {
    annotatedPreview: {
      pdfJobId: jobId,
      pdfUrl: null,
      tooltipData,
      unmappedParagraphs,
      gapSummary,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// KB Persistence
// ---------------------------------------------------------------------------

/**
 * Persist confirmed mappings from the wizard state to the knowledge base.
 *
 * Called fire-and-forget after download. Reads the final mapping plan,
 * converts entries to KB format, and bulk upserts them. Errors are logged
 * but never propagated to the caller.
 */
export async function persistMappingsToKB(wizardState: WizardState): Promise<void> {
  const mappingPlan = wizardState.analysis.mappingPlan as unknown as MappingPlan;

  if (!mappingPlan || !mappingPlan.entries || mappingPlan.entries.length === 0) {
    console.log('[templateAdapter] No mappings to persist to KB');
    return;
  }

  const kbEntries: TemplateMappingInput[] = mappingPlan.entries.map((entry) => ({
    templateType: mappingPlan.templateType,
    language: mappingPlan.language,
    sectionText: entry.sectionText,
    gwField: entry.gwField,
    markerType: entry.markerType,
    confidence: entry.confidence,
  }));

  const result = await bulkUpsertMappings(kbEntries);
  console.log(
    `[templateAdapter] KB persistence: ${result.created} created, ${result.updated} updated ` +
    `(${kbEntries.length} total entries)`,
  );
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Get the download path for the adapted DOCX.
 * Returns the path to the DOCX WITH Jinja2 placeholders (not the rendered preview).
 */
export function getDownloadPath(wizardState: WizardState): string {
  const appliedDocxPath = wizardState.adaptation.appliedDocxPath;

  if (!appliedDocxPath) {
    throw new Error('No adapted DOCX in wizard state -- run apply first');
  }

  if (!fs.existsSync(appliedDocxPath)) {
    throw new Error(`Adapted DOCX file not found: ${appliedDocxPath}`);
  }

  return appliedDocxPath;
}

// ---------------------------------------------------------------------------
// Chat Feedback
// ---------------------------------------------------------------------------

const CHAT_WARNING_THRESHOLD = 5;

/**
 * Process iterative chat feedback via SSE streaming.
 *
 * Builds chat context from the current mapping plan + history + user message,
 * streams the LLM response, and yields chunks for SSE delivery.
 * If the LLM response contains JSON mapping plan modifications,
 * the mapping plan in session state is updated.
 *
 * Includes a soft warning in the system prompt after 5 iterations.
 */
export async function* processChatFeedback(
  wizardState: WizardState,
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<LLMStreamChunk & { mappingUpdate?: MappingPlan }> {
  const { userId, sessionId } = wizardState;
  const currentPlan = wizardState.analysis.mappingPlan as unknown as MappingPlan;
  const iterationCount = wizardState.chat.iterationCount;

  // Record user message in history
  const now = new Date().toISOString();
  const updatedHistory = [
    ...wizardState.chat.history,
    { role: 'user', content: userMessage, timestamp: now },
  ];

  // Increment iteration count
  await updateWizardSession(userId, sessionId, {
    chat: {
      iterationCount: iterationCount + 1,
      history: updatedHistory,
    },
  });

  // Build system prompt with current mapping plan context
  let systemPrompt = (
    'You are a template adaptation assistant helping refine a mapping plan ' +
    'that maps sections of a client DOCX document to Ghostwriter template fields.\n\n' +
    'Current mapping plan:\n' +
    JSON.stringify(currentPlan, null, 2) + '\n\n' +
    'The user wants to modify this mapping plan. Help them by:\n' +
    '1. Understanding their request\n' +
    '2. Suggesting specific changes to the mapping plan\n' +
    '3. If you determine changes are needed, include a JSON block with the updated mapping plan\n\n' +
    'To propose changes, include a fenced JSON block like:\n' +
    '```json\n{"entries": [...], "templateType": "...", "language": "...", "warnings": [...]}\n```\n'
  );

  // Soft warning after threshold
  if (iterationCount + 1 >= CHAT_WARNING_THRESHOLD) {
    systemPrompt += (
      '\nNOTE: This is iteration ' + (iterationCount + 1) + ' of chat feedback. ' +
      'Consider finalising the mapping plan soon to avoid excessive iterations. ' +
      'Gently suggest the user move forward if the plan looks good.\n'
    );
  }

  // Build messages with chat history
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Include recent chat history (last 10 messages)
  const recentHistory = wizardState.chat.history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  messages.push({ role: 'user', content: userMessage });

  // Stream LLM response
  const client = await createLLMClient();
  let fullResponse = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  const model = client.resolveModel('template-adapter');

  const stream = client.generateStream(messages, {
    maxTokens: 4096,
    feature: 'template-adapter',
    signal,
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      fullResponse += chunk.text;
      yield { text: chunk.text, done: false };
    }
    if (chunk.done) {
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
  }

  // Check for mapping plan modifications in the response
  const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)```/);
  let mappingUpdate: MappingPlan | undefined;

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.entries && Array.isArray(parsed.entries)) {
        mappingUpdate = parsed as MappingPlan;

        // Update mapping plan in session state
        await updateWizardSession(userId, sessionId, {
          analysis: {
            ...wizardState.analysis,
            mappingPlan: parsed as Record<string, unknown>,
          },
        });
      }
    } catch {
      // JSON parse failed -- not a valid mapping plan update, ignore
    }
  }

  // Record assistant message in history
  const assistantHistory = [
    ...updatedHistory,
    { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() },
  ];

  await updateWizardSession(userId, sessionId, {
    chat: {
      iterationCount: iterationCount + 1,
      history: assistantHistory,
    },
  });

  // Log the interaction
  try {
    await logLLMInteraction(userId, 'system', {
      promptSanitized: userMessage,
      responseFull: fullResponse,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      model,
    });
  } catch (err) {
    console.error('[templateAdapter] Failed to log chat interaction:', err);
  }

  // Final done chunk with optional mapping update
  yield {
    text: '',
    done: true,
    usage,
    ...(mappingUpdate ? { mappingUpdate } : {}),
  };
}
