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
  type InteractiveSelection,
} from './wizardState.js';
import { addPdfConversionJob } from './pdfQueue.js';
import {
  queryFewShotExamples,
  bulkUpsertMappings,
  queryByZone,
  queryBlueprints,
  getBoilerplateStyles,
  queryZoneRepetitionSummary,
  upsertBlueprint,
  bulkUpsertStyleHints,
  type TemplateMappingInput,
  type BlueprintPatternInput,
} from './templateMapping.js';

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
    currentStep: 'upload',
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

  // Step 0: Query KB for enriched context (graceful degradation per query)
  let fewShotExamples: Array<{
    normalized_section_text: string;
    gw_field: string;
    marker_type: string;
    usage_count: number;
  }> = [];

  // Enriched KB context payload (null until populated)
  let kbContext: {
    zone_mappings: Record<string, Array<{
      normalized_section_text: string;
      gw_field: string;
      marker_type: string;
      confidence: number;
      zone: string;
      zone_repetition_count: number;
    }>>;
    blueprints: Array<{
      zone: string;
      pattern_type: string;
      markers: Array<{ gwField: string; markerType: string }>;
      anchor_style: string | null;
    }>;
    boilerplate_styles: string[];
    repetition_summary: Array<{ gw_field: string; zone: string; total_count: number }>;
    is_cross_type_fallback: boolean;
  } | null = null;

  try {
    // Primary zone-grouped query
    const zoneMap = await queryByZone(templateType, language);

    if (zoneMap.size > 0) {
      // Build zone_mappings from primary results
      const zoneMappings: Record<string, Array<{
        normalized_section_text: string;
        gw_field: string;
        marker_type: string;
        confidence: number;
        zone: string;
        zone_repetition_count: number;
      }>> = {};

      for (const [zone, mappings] of zoneMap) {
        zoneMappings[zone] = mappings.map((m) => ({
          normalized_section_text: m.normalizedSectionText,
          gw_field: m.gwField,
          marker_type: m.markerType,
          confidence: m.confidence,
          zone: m.zone,
          zone_repetition_count: m.zoneRepetitionCount,
        }));
      }

      // Fetch blueprints, boilerplate styles, and repetition summary in parallel
      const [blueprintResults, boilerplateResults, repetitionResults] = await Promise.all([
        queryBlueprints(templateType).catch((err) => {
          console.warn('[templateAdapter] Blueprint query failed:', err);
          return [];
        }),
        getBoilerplateStyles(templateType).catch((err) => {
          console.warn('[templateAdapter] Boilerplate styles query failed:', err);
          return [] as string[];
        }),
        queryZoneRepetitionSummary(templateType, language).catch((err) => {
          console.warn('[templateAdapter] Repetition summary query failed:', err);
          return [];
        }),
      ]);

      kbContext = {
        zone_mappings: zoneMappings,
        blueprints: blueprintResults.map((bp) => ({
          zone: bp.zone,
          pattern_type: bp.patternType,
          markers: bp.parsedMarkers,
          anchor_style: bp.anchorStyle,
        })),
        boilerplate_styles: boilerplateResults,
        repetition_summary: repetitionResults.map((r) => ({
          gw_field: r.gwField,
          zone: r.zone,
          total_count: r.totalCount,
        })),
        is_cross_type_fallback: false,
      };
    } else {
      // Cross-type fallback: query other template types with 0.7x confidence penalty
      const otherTypes = ['web', 'internal', 'mobile'].filter((t) => t !== templateType);
      const fallbackZoneMappings: Record<string, Array<{
        normalized_section_text: string;
        gw_field: string;
        marker_type: string;
        confidence: number;
        zone: string;
        zone_repetition_count: number;
      }>> = {};
      const seenTexts = new Set<string>();

      for (const otherType of otherTypes) {
        try {
          const otherZoneMap = await queryByZone(otherType, language);
          for (const [zone, mappings] of otherZoneMap) {
            if (!fallbackZoneMappings[zone]) {
              fallbackZoneMappings[zone] = [];
            }
            for (const m of mappings) {
              // Deduplicate by normalizedSectionText
              if (!seenTexts.has(m.normalizedSectionText)) {
                seenTexts.add(m.normalizedSectionText);
                fallbackZoneMappings[zone].push({
                  normalized_section_text: m.normalizedSectionText,
                  gw_field: m.gwField,
                  marker_type: m.markerType,
                  confidence: m.confidence * 0.7, // 0.7x penalty
                  zone: m.zone,
                  zone_repetition_count: m.zoneRepetitionCount,
                });
              }
            }
          }
        } catch (err) {
          console.warn(`[templateAdapter] Cross-type fallback query for ${otherType} failed:`, err);
        }
      }

      if (Object.keys(fallbackZoneMappings).length > 0) {
        kbContext = {
          zone_mappings: fallbackZoneMappings,
          blueprints: [],
          boilerplate_styles: [],
          repetition_summary: [],
          is_cross_type_fallback: true,
        };
      }
    }

    // Also populate flat few-shot examples for backward compatibility
    const flatResults = await queryFewShotExamples(templateType, language);
    fewShotExamples = flatResults.map((r) => ({
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
      ...(kbContext ? { kb_context: kbContext } : {}),
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
    currentStep: 'verify',
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
// Deterministic Re-apply (bypasses LLM Pass 2)
// ---------------------------------------------------------------------------

/**
 * Deterministically re-apply a mapping plan to the original DOCX template
 * without calling the LLM. Converts mapping entries directly to instructions
 * on the Python side and applies them.
 *
 * Used after correction-chat updates the mapping plan -- since the LLM
 * already produced the corrected plan, we don't need another LLM call
 * to generate instructions.
 */
export async function reapplyFromMappingPlan(
  wizardState: WizardState,
): Promise<WizardState> {
  const sanitizerUrl = config.SANITIZER_URL;
  const { userId, sessionId } = wizardState;
  const mappingPlan = wizardState.analysis.mappingPlan as unknown as MappingPlan;

  if (!mappingPlan) {
    throw new Error('No mapping plan in wizard state');
  }

  const res = await fetch(`${sanitizerUrl}/adapter/apply-from-mapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: wizardState.templateFile.base64,
      mapping_plan: mappingPlanToSnakeCase(mappingPlan),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Sanitizer /adapter/apply-from-mapping failed (${res.status}): ${detail}`);
  }

  const data = await res.json() as ApplyServiceResponse;

  // Save adapted DOCX to disk
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const adaptedFilename = `${randomUUID()}_adapted.docx`;
  const adaptedPath = path.join(DOCUMENTS_DIR, adaptedFilename);
  const adaptedBuffer = Buffer.from(data.output_base64, 'base64');
  fs.writeFileSync(adaptedPath, adaptedBuffer);

  // Update wizard state
  const updated = await updateWizardSession(userId, sessionId, {
    currentStep: 'verify',
    adaptation: {
      instructions: {} as Record<string, unknown>,
      appliedDocxPath: adaptedPath,
      appliedCount: data.applied_count,
      skippedCount: data.skipped_count,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Auto-Map (Combined Pass 1 + Pass 2)
// ---------------------------------------------------------------------------

/**
 * Auto-map a template by chaining Pass 1 (analysis) + Pass 2 (insertion).
 *
 * Called after upload to automatically analyze the template structure,
 * generate a mapping plan, and apply Jinja2 placeholders in one request.
 * On success, the wizard advances to the 'verify' step.
 *
 * If Pass 1 fails, the error is thrown with context.
 * If Pass 2 fails, the analysis results are preserved in wizard state
 * so the mapping plan is still available for manual retry.
 *
 * @param wizardState - Wizard state with uploaded template and config
 * @returns Updated wizard state at 'verify' step with adapted DOCX
 */
export async function autoMapTemplate(
  wizardState: WizardState,
): Promise<WizardState> {
  const { userId, sessionId } = wizardState;
  const { templateType, language } = wizardState.config;
  const templateBase64 = wizardState.templateFile.base64;

  if (!templateBase64) {
    throw new Error('No template file in wizard state -- upload first');
  }

  // Pass 1: Analyze template to produce mapping plan
  let analysisResult: AnalysisResult;
  try {
    analysisResult = await analyzeTemplate(templateBase64, templateType, language);
  } catch (error) {
    throw new Error(
      `Auto-map Pass 1 (analysis) failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  // Update wizard state with analysis results (preserved even if Pass 2 fails)
  const stateAfterAnalysis = await updateWizardSession(userId, sessionId, {
    analysis: {
      mappingPlan: analysisResult.mappingPlan as unknown as Record<string, unknown>,
      referenceTemplateHash: analysisResult.referenceTemplateHash,
      llmPrompt: null,
    },
  });

  // Pass 2: Apply instructions (builds insertion prompt, LLM generates instructions, applies to DOCX)
  // applyInstructions() saves the adapted DOCX and sets currentStep to 'verify'
  const finalState = await applyInstructions(stateAfterAnalysis);

  return finalState;
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
  options?: { greenOnly?: boolean },
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
      green_only: options?.greenOnly ?? false,
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
// Placeholder Preview
// ---------------------------------------------------------------------------

/** Response from Python /adapter/placeholder-preview */
interface PlaceholderPreviewServiceResponse {
  annotated_base64: string;
  placeholders: Array<{
    paragraph_index: number;
    placeholder_text: string;
    gw_field: string;
  }>;
  placeholder_count: number;
}

/** Placeholder info returned to the frontend (camelCase). */
export interface PlaceholderInfo {
  paragraphIndex: number;
  placeholderText: string;
  gwField: string;
}

/** Result of generatePlaceholderPreview(). */
export interface PlaceholderPreviewResult {
  pdfJobId: string;
  placeholders: PlaceholderInfo[];
  placeholderCount: number;
}

/**
 * Generate a placeholder-styled preview of the adapted DOCX.
 *
 * 1. Read the adapted DOCX (with Jinja2 placeholders) from disk
 * 2. POST to Python /adapter/placeholder-preview with base64
 * 3. Save annotated DOCX to disk
 * 4. Queue PDF conversion
 * 5. Update wizard state with placeholder preview data
 * 6. Return pdfJobId + placeholder list + count
 */
export async function generatePlaceholderPreview(
  wizardState: WizardState,
): Promise<PlaceholderPreviewResult> {
  const sanitizerUrl = config.SANITIZER_URL;
  const { userId, sessionId } = wizardState;
  const appliedDocxPath = wizardState.adaptation.appliedDocxPath;

  if (!appliedDocxPath) {
    throw new Error('No adapted DOCX in wizard state -- run auto-map first');
  }

  if (!fs.existsSync(appliedDocxPath)) {
    throw new Error(`Adapted DOCX file not found: ${appliedDocxPath}`);
  }

  // Read adapted DOCX and convert to base64
  const docxBuffer = fs.readFileSync(appliedDocxPath);
  const adaptedBase64 = docxBuffer.toString('base64');

  // POST to Python /adapter/placeholder-preview
  const previewRes = await fetch(`${sanitizerUrl}/adapter/placeholder-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      adapted_base64: adaptedBase64,
      template_type: wizardState.config.templateType,
      language: wizardState.config.language,
    }),
  });

  if (!previewRes.ok) {
    const detail = await previewRes.text();
    throw new Error(`Sanitizer /adapter/placeholder-preview failed (${previewRes.status}): ${detail}`);
  }

  const previewData: PlaceholderPreviewServiceResponse =
    await previewRes.json() as PlaceholderPreviewServiceResponse;

  // Save annotated DOCX to disk
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  const annotatedFilename = `${randomUUID()}_placeholder.docx`;
  const annotatedPath = path.join(DOCUMENTS_DIR, annotatedFilename);
  const annotatedBuffer = Buffer.from(previewData.annotated_base64, 'base64');
  fs.writeFileSync(annotatedPath, annotatedBuffer);

  // Queue PDF conversion
  const jobId = await addPdfConversionJob(annotatedPath, annotatedFilename);

  // Convert snake_case to camelCase
  const placeholders: PlaceholderInfo[] = previewData.placeholders.map((p) => ({
    paragraphIndex: p.paragraph_index,
    placeholderText: p.placeholder_text,
    gwField: p.gw_field,
  }));

  // Update wizard state with placeholder preview data (including placeholders for cache recovery)
  await updateWizardSession(userId, sessionId, {
    annotatedPreview: {
      pdfJobId: jobId,
      pdfUrl: null,
      placeholders,
      placeholderCount: previewData.placeholder_count,
      tooltipData: [],
      unmappedParagraphs: [],
      gapSummary: null,
    },
  });

  return {
    pdfJobId: jobId,
    placeholders,
    placeholderCount: previewData.placeholder_count,
  };
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
// Batch Selection Helpers
// ---------------------------------------------------------------------------

/** Response from Python /adapter/validate-batch-mapping */
interface ValidateBatchMappingResponse {
  valid: boolean;
  mappings: Array<{
    selection_number: number;
    gw_field: string;
    marker_type: string;
    confidence: number;
    rationale: string;
  }>;
  errors: string[];
  warnings: string[];
}

/**
 * Detect whether a chat message contains batch selection references (#N).
 */
export function detectBatchSelections(message: string): boolean {
  return /#\d+/.test(message);
}

/**
 * Extract all #N selection numbers from a chat message.
 */
export function parseBatchSelectionNumbers(message: string): number[] {
  const matches = message.matchAll(/#(\d+)/g);
  const numbers = new Set<number>();
  for (const match of matches) {
    numbers.add(parseInt(match[1], 10));
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Chat Feedback
// ---------------------------------------------------------------------------

const CHAT_WARNING_THRESHOLD = 5;

/**
 * Selection mapping result emitted as SSE event per resolved selection.
 */
export interface SelectionMappingResult {
  selectionNumber: number;
  gwField: string;
  markerType: string;
  confidence: number;
  rationale: string;
}

/**
 * Extended yield type for processChatFeedback -- includes batch mapping and correction events.
 */
export type ChatFeedbackChunk = LLMStreamChunk & {
  mappingUpdate?: MappingPlan;
  selectionMapping?: SelectionMappingResult;
  batchComplete?: { resolvedCount: number; totalCount: number };
  correctionResult?: MappingPlan;
  regenerationComplete?: { pdfJobId: string; placeholderCount: number };
};

/** Response from Python /adapter/build-correction-prompt */
interface CorrectionPromptResponse {
  prompt: string;
  system_prompt: string;
}

/**
 * Check whether the wizard is in correction mode.
 * Returns true when the user is on the 'verify' step (placeholder review).
 */
function isInCorrectionMode(wizardState: WizardState): boolean {
  return wizardState.currentStep === 'verify';
}

/**
 * Process iterative chat feedback via SSE streaming.
 *
 * Builds chat context from the current mapping plan + history + user message,
 * streams the LLM response, and yields chunks for SSE delivery.
 * If the LLM response contains JSON mapping plan modifications,
 * the mapping plan in session state is updated.
 *
 * When in correction mode (verify step) and the message contains #N
 * selection references, uses the correction prompt for full pipeline
 * regeneration (update mapping -> re-apply DOCX -> new placeholder PDF).
 *
 * When in interactive mapping mode with #N batch selections, uses the
 * batch mapping prompt and emits per-selection mapping events.
 *
 * Includes a soft warning in the system prompt after 5 iterations.
 */
export async function* processChatFeedback(
  wizardState: WizardState,
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatFeedbackChunk> {
  const { userId, sessionId } = wizardState;
  const currentPlan = wizardState.analysis.mappingPlan as unknown as MappingPlan;
  const iterationCount = wizardState.chat.iterationCount;
  const isBatchMessage = detectBatchSelections(userMessage);

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

  // --- Correction mode: verify step + #N references ---
  // Takes priority over batch selection when in the verify step
  if (isBatchMessage && isInCorrectionMode(wizardState)) {
    yield* processCorrectionChat(
      wizardState,
      userMessage,
      updatedHistory,
      signal,
    );
    return;
  }

  // --- Batch selection flow (interactive mapping mode) ---
  if (isBatchMessage && wizardState.interactiveSelections.length > 0) {
    yield* processBatchSelectionChat(
      wizardState,
      userMessage,
      updatedHistory,
      signal,
    );
    return;
  }

  // --- Standard chat flow (backward compatible) ---
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

/**
 * Process batch selection chat -- builds batch mapping prompt, calls LLM,
 * validates via Python, and emits per-selection SSE events.
 */
async function* processBatchSelectionChat(
  wizardState: WizardState,
  userMessage: string,
  updatedHistory: Array<{ role: string; content: string; timestamp: string }>,
  signal?: AbortSignal,
): AsyncGenerator<ChatFeedbackChunk> {
  const { userId, sessionId } = wizardState;
  const sanitizerUrl = config.SANITIZER_URL;
  const iterationCount = wizardState.chat.iterationCount;
  const selections = wizardState.interactiveSelections;
  const referencedNumbers = parseBatchSelectionNumbers(userMessage);

  // Determine if this is initial mapping or re-mapping
  const referencedSelections = selections.filter(
    (s) => referencedNumbers.includes(s.selectionNumber),
  );
  const isRemap = referencedSelections.some((s) => s.status === 'rejected');
  const confirmedMappings = selections.filter((s) => s.status === 'confirmed');

  // Build batch mapping prompts via Python service
  const promptPayload = isRemap
    ? {
        selections: referencedSelections.map((s) => ({
          selection_number: s.selectionNumber,
          text: s.text,
          paragraph_index: s.paragraphIndex,
        })),
        user_description: userMessage,
        previous_mappings: confirmedMappings.map((s) => ({
          selection_number: s.selectionNumber,
          gw_field: s.gwField ?? '',
        })),
      }
    : {
        selections: referencedSelections.map((s) => ({
          selection_number: s.selectionNumber,
          text: s.text,
          paragraph_index: s.paragraphIndex,
        })),
        user_description: userMessage,
      };

  // Build system prompt via reference template info
  // Use the batch mapping system prompt from the Python service
  const templateType = wizardState.config.templateType;
  const language = wizardState.config.language;

  // Get reference info for system prompt (reuse analysis prompt endpoint pattern)
  let batchSystemPrompt = (
    'You are mapping user-selected text from a document to Ghostwriter template fields. ' +
    'The user has highlighted numbered selections from their penetration testing report template ' +
    'and described what each selection represents.\n\n' +
    'Return ONLY a valid JSON array where each entry has: selectionNumber, gwField, markerType, confidence, rationale.\n'
  );

  // Build the user prompt with selections and description
  let batchUserPrompt = '';
  if (isRemap) {
    // Include confirmed context
    if (confirmedMappings.length > 0) {
      batchUserPrompt += 'Already confirmed:\n';
      for (const m of confirmedMappings) {
        batchUserPrompt += `#${m.selectionNumber} -> ${m.gwField ?? 'unknown'}\n`;
      }
      batchUserPrompt += '\nRe-map the following:\n';
    }
  }

  batchUserPrompt += 'Selections:\n';
  for (const sel of referencedSelections) {
    const truncated = sel.text.slice(0, 200) + (sel.text.length > 200 ? '...' : '');
    batchUserPrompt += `#${sel.selectionNumber} (paragraph ${sel.paragraphIndex}): "${truncated}"\n`;
  }
  batchUserPrompt += `\nUser description: ${userMessage}\n`;

  const messages: LLMMessage[] = [
    { role: 'system', content: batchSystemPrompt },
    { role: 'user', content: batchUserPrompt },
  ];

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

  // Validate the LLM response via Python service
  try {
    const validateRes = await fetch(`${sanitizerUrl}/adapter/validate-batch-mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_response: fullResponse,
        selections: referencedSelections.map((s) => ({
          selection_number: s.selectionNumber,
          text: s.text,
          paragraph_index: s.paragraphIndex,
        })),
        template_type: templateType,
        language: language,
      }),
    });

    if (validateRes.ok) {
      const validateData = await validateRes.json() as ValidateBatchMappingResponse;

      if (validateData.valid && validateData.mappings.length > 0) {
        // Emit per-selection mapping events
        for (const mapping of validateData.mappings) {
          yield {
            text: '',
            done: false,
            selectionMapping: {
              selectionNumber: mapping.selection_number,
              gwField: mapping.gw_field,
              markerType: mapping.marker_type,
              confidence: mapping.confidence,
              rationale: mapping.rationale,
            },
          };
        }

        // Update interactiveSelections with resolved mappings
        const updatedSelections = selections.map((s) => {
          const resolved = validateData.mappings.find(
            (m) => m.selection_number === s.selectionNumber,
          );
          if (resolved) {
            return {
              ...s,
              status: 'pending' as const,
              gwField: resolved.gw_field,
              markerType: resolved.marker_type,
              confidence: resolved.confidence,
            };
          }
          return s;
        });

        await updateWizardSession(userId, sessionId, {
          interactiveSelections: updatedSelections,
        });

        // Emit batch_complete event
        yield {
          text: '',
          done: false,
          batchComplete: {
            resolvedCount: validateData.mappings.length,
            totalCount: referencedSelections.length,
          },
        };
      }
    }
  } catch (err) {
    console.error('[templateAdapter] Batch validation failed:', err);
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
    console.error('[templateAdapter] Failed to log batch chat interaction:', err);
  }

  // Final done chunk
  yield {
    text: '',
    done: true,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Correction Chat (Placeholder Verification Flow)
// ---------------------------------------------------------------------------

/**
 * Process correction chat -- builds correction prompt via Python service,
 * calls LLM for updated mapping plan, validates, regenerates DOCX + PDF.
 *
 * Flow:
 * 1. Build correction prompt via Python /adapter/build-correction-prompt
 * 2. Call LLM with correction prompts (streaming)
 * 3. Validate response via /adapter/validate-mapping (same as Pass 1)
 * 4. If valid: update mapping plan in wizard state
 * 5. Yield correction_result SSE event with updated mapping plan
 * 6. Trigger regeneration: applyInstructions() to re-run Pass 2
 * 7. Generate new placeholder preview PDF
 * 8. Yield regeneration_complete SSE event with new pdfJobId
 */
async function* processCorrectionChat(
  wizardState: WizardState,
  userMessage: string,
  updatedHistory: Array<{ role: string; content: string; timestamp: string }>,
  signal?: AbortSignal,
): AsyncGenerator<ChatFeedbackChunk> {
  const { userId, sessionId } = wizardState;
  const sanitizerUrl = config.SANITIZER_URL;
  const iterationCount = wizardState.chat.iterationCount;
  const currentPlan = wizardState.analysis.mappingPlan as unknown as MappingPlan;

  if (!currentPlan) {
    yield { text: 'No mapping plan available for correction.', done: false };
    yield { text: '', done: true };
    return;
  }

  // Extract selection references from message
  const referencedNumbers = parseBatchSelectionNumbers(userMessage);

  // Build selections array from interactive selections if available
  const selections = wizardState.interactiveSelections
    ? wizardState.interactiveSelections
        .filter((s) => referencedNumbers.includes(s.selectionNumber))
        .map((s) => ({
          selection_number: s.selectionNumber,
          text: s.text,
          paragraph_index: s.paragraphIndex,
        }))
    : [];

  // Step 1: Build correction prompt via Python service
  let correctionSystemPrompt: string;
  let correctionUserPrompt: string;

  try {
    const promptRes = await fetch(`${sanitizerUrl}/adapter/build-correction-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_base64: wizardState.templateFile.base64,
        current_mapping_plan: mappingPlanToSnakeCase(currentPlan),
        user_corrections: userMessage,
        selections,
      }),
    });

    if (!promptRes.ok) {
      const detail = await promptRes.text();
      yield { text: `Error building correction prompt: ${detail}`, done: false };
      yield { text: '', done: true };
      return;
    }

    const promptData = await promptRes.json() as CorrectionPromptResponse;
    correctionSystemPrompt = promptData.system_prompt;
    correctionUserPrompt = promptData.prompt;
  } catch (err) {
    console.error('[templateAdapter] Correction prompt build failed:', err);
    yield { text: 'Failed to build correction prompt. Please try again.', done: false };
    yield { text: '', done: true };
    return;
  }

  // Step 2: Call LLM with correction prompts (streaming)
  const messages: LLMMessage[] = [
    { role: 'system', content: correctionSystemPrompt },
    { role: 'user', content: correctionUserPrompt },
  ];

  const client = await createLLMClient();
  let fullResponse = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  const model = client.resolveModel('template-adapter');

  try {
    const stream = client.generateStream(messages, {
      maxTokens: 8192,
      feature: 'template-adapter',
      signal,
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        fullResponse += chunk.text;
        yield { text: chunk.text, done: false };
      }
      if (chunk.done && chunk.usage) {
        usage = chunk.usage;
      }
    }
  } catch (err) {
    console.error('[templateAdapter] Correction LLM call failed:', err);
    yield { text: '\n\nLLM request failed. Please try again.', done: false };
    yield { text: '', done: true };
    return;
  }

  // Step 3: Validate LLM response via /adapter/validate-mapping
  let updatedMappingPlan: MappingPlan | null = null;

  try {
    // Count paragraphs for validation bounds
    const paragraphCount = currentPlan.entries.reduce(
      (max, e) => Math.max(max, e.sectionIndex),
      0,
    ) + 100; // generous upper bound

    const validateRes = await fetch(`${sanitizerUrl}/adapter/validate-mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_response: fullResponse,
        template_type: currentPlan.templateType,
        language: currentPlan.language,
        paragraph_count: paragraphCount,
      }),
    });

    if (validateRes.ok) {
      const validateData = await validateRes.json() as ValidateServiceResponse;

      if (validateData.valid && validateData.mapping_plan) {
        const plan = validateData.mapping_plan;
        updatedMappingPlan = {
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
      }
    }
  } catch (err) {
    console.error('[templateAdapter] Correction validation failed:', err);
  }

  // Step 4-5: If valid, update mapping plan and yield correction_result
  if (updatedMappingPlan) {
    await updateWizardSession(userId, sessionId, {
      analysis: {
        ...wizardState.analysis,
        mappingPlan: updatedMappingPlan as unknown as Record<string, unknown>,
      },
    });

    yield {
      text: '',
      done: false,
      correctionResult: updatedMappingPlan,
    };

    // Step 6-8: Regeneration pipeline (deterministic, no LLM call)
    try {
      // Re-read wizard state after mapping plan update
      const refreshedState = await getWizardSession(userId, sessionId);
      if (refreshedState) {
        // Deterministically re-apply mapping plan (bypasses LLM Pass 2)
        const regeneratedState = await reapplyFromMappingPlan(refreshedState);

        // Generate new placeholder preview PDF
        const previewResult = await generatePlaceholderPreview(regeneratedState);

        // Yield regeneration_complete with new pdfJobId
        yield {
          text: '',
          done: false,
          regenerationComplete: {
            pdfJobId: previewResult.pdfJobId,
            placeholderCount: previewResult.placeholderCount,
          },
        };
      }
    } catch (regenErr) {
      const errMsg = regenErr instanceof Error ? regenErr.message : String(regenErr);
      console.error('[templateAdapter] Regeneration pipeline failed:', errMsg, regenErr);
      yield {
        text: `\n\nCorrection applied but regeneration failed: ${errMsg}. Click "Refresh Preview" to retry.`,
        done: false,
      };
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
    console.error('[templateAdapter] Failed to log correction chat interaction:', err);
  }

  // Final done chunk
  yield {
    text: '',
    done: true,
    usage,
  };
}
