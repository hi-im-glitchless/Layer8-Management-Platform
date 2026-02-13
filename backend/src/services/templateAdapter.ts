/**
 * Template Adapter Service -- orchestrates LLM Pass 1 analysis.
 *
 * Flow:
 * 1. POST base64 DOCX to Python service /adapter/analyze -> get prompt + metadata
 * 2. Call LLM with the analysis prompt (non-streaming, structured JSON output)
 * 3. POST raw LLM response to Python service /adapter/validate-mapping -> validated MappingPlan
 */
import { config } from '../config.js';
import { createLLMClient } from './llm/client.js';
import type { LLMMessage } from '../types/llm.js';

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

// ---------------------------------------------------------------------------
// Public API
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
