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
} from './wizardState.js';

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

  // Step 1: Get analysis prompt from Python service
  const analyzeRes = await fetch(`${sanitizerUrl}/adapter/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: templateBase64,
      template_type: templateType,
      language: language,
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

  // Step 1: Get insertion prompt from Python service
  // We need doc_structure, which requires re-parsing the template
  const analyzeRes = await fetch(`${sanitizerUrl}/adapter/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_base64: wizardState.templateFile.base64,
      template_type: wizardState.config.templateType,
      language: wizardState.config.language,
    }),
  });

  if (!analyzeRes.ok) {
    const detail = await analyzeRes.text();
    throw new Error(`Sanitizer /adapter/analyze failed (${analyzeRes.status}): ${detail}`);
  }

  const analyzeData = await analyzeRes.json() as AnalyzeServiceResponse;

  // Build insertion prompt via Python service
  const promptRes = await fetch(`${sanitizerUrl}/adapter/build-insertion-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doc_structure: analyzeData.doc_structure_summary,
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
