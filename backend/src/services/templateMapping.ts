/**
 * Template Mapping Knowledge Base Service
 *
 * Stores confirmed template mappings so future LLM analyses can benefit
 * from few-shot examples of previously successful mappings. Handles text
 * normalization, upsert-with-increment semantics, and few-shot query retrieval.
 *
 * Non-blocking persistence -- errors are logged, not thrown to callers.
 */
import { z } from 'zod';
import { prisma } from '@/db/prisma.js';
import type { TemplateMapping } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Controls how confidence is updated during upsert operations.
 *
 * - 'create': initial mapping, sets confidence from input (default behavior)
 * - 'confirm': user confirmed an existing mapping, boosts confidence by +0.1 (capped at 1.0)
 * - 'correct': user corrected an existing mapping, decays confidence by 0.7x
 */
export type UpsertMode = 'confirm' | 'correct' | 'create';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const templateMappingSchema = z.object({
  templateType: z.string().min(1),
  language: z.string().min(1),
  sectionText: z.string().min(1),
  gwField: z.string().min(1),
  markerType: z.string().min(1),
  confidence: z.number().min(0).max(1).default(1.0),
  zone: z.string().min(1).optional(),
  zoneRepetitionCount: z.number().int().min(1).optional(),
});

export type TemplateMappingInput = z.infer<typeof templateMappingSchema>;

export const fewShotQuerySchema = z.object({
  templateType: z.string().min(1),
  language: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
});

export type FewShotQueryInput = z.infer<typeof fewShotQuerySchema>;

// ---------------------------------------------------------------------------
// Text Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize section text for knowledge base matching.
 *
 * - Trim leading/trailing whitespace
 * - Convert to lowercase
 * - Collapse consecutive whitespace (spaces, tabs, newlines) into single space
 * - Strip common filler patterns: placeholder underscores, ellipsis, em-dash patterns
 */
export function normalizeSectionText(text: string): string {
  let normalized = text;

  // Trim leading/trailing whitespace
  normalized = normalized.trim();

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Strip placeholder underscores (sequences of 2+ underscores)
  normalized = normalized.replace(/_{2,}/g, '');

  // Strip ellipsis patterns (... or unicode ellipsis)
  normalized = normalized.replace(/\.{3,}/g, '');
  normalized = normalized.replace(/\u2026/g, '');

  // Strip em-dash patterns (-- or unicode em-dash, with optional surrounding spaces)
  normalized = normalized.replace(/\s*(?:—|–|--)\s*/g, ' ');

  // Collapse consecutive whitespace into single space
  normalized = normalized.replace(/\s+/g, ' ');

  // Final trim (stripping patterns may leave trailing whitespace)
  normalized = normalized.trim();

  return normalized;
}

// ---------------------------------------------------------------------------
// Upsert Operations
// ---------------------------------------------------------------------------

/**
 * Compute updated confidence based on upsert mode.
 *
 * - 'confirm': boost by +0.1, capped at 1.0
 * - 'correct': decay by 0.7x
 * - 'create': use the provided input confidence as-is
 */
function computeConfidence(
  mode: UpsertMode,
  existingConfidence: number | undefined,
  inputConfidence: number,
): number {
  if (mode === 'confirm' && existingConfidence !== undefined) {
    return Math.min(1.0, existingConfidence + 0.1);
  }
  if (mode === 'correct' && existingConfidence !== undefined) {
    return existingConfidence * 0.7;
  }
  return inputConfidence;
}

/**
 * Upsert a single template mapping into the knowledge base.
 *
 * Mode controls confidence behavior:
 * - 'create' (default): sets usageCount=1, confidence from input
 * - 'confirm': increments usageCount, boosts confidence by +0.1 (capped at 1.0)
 * - 'correct': increments correctionCount, decays confidence by 0.7x
 *
 * @returns The upserted TemplateMapping record
 */
export async function upsertMapping(
  input: TemplateMappingInput,
  mode: UpsertMode = 'create',
): Promise<TemplateMapping> {
  const validated = templateMappingSchema.parse(input);
  const normalizedText = normalizeSectionText(validated.sectionText);

  const whereClause = {
    templateType_language_normalizedSectionText_gwField: {
      templateType: validated.templateType,
      language: validated.language,
      normalizedSectionText: normalizedText,
      gwField: validated.gwField,
    },
  };

  // For confirm/correct modes, fetch existing record to compute new confidence
  let existingConfidence: number | undefined;
  if (mode !== 'create') {
    const existing = await prisma.templateMapping.findUnique({ where: whereClause });
    existingConfidence = existing?.confidence;
  }

  const newConfidence = computeConfidence(mode, existingConfidence, validated.confidence);

  const updateClause: Record<string, unknown> = {
    markerType: validated.markerType,
    confidence: newConfidence,
  };

  if (mode === 'correct') {
    updateClause.correctionCount = { increment: 1 };
  } else {
    updateClause.usageCount = { increment: 1 };
  }

  // Include zone fields if provided
  if (validated.zone !== undefined) {
    updateClause.zone = validated.zone;
  }
  if (validated.zoneRepetitionCount !== undefined) {
    updateClause.zoneRepetitionCount = validated.zoneRepetitionCount;
  }

  return prisma.templateMapping.upsert({
    where: whereClause,
    create: {
      templateType: validated.templateType,
      language: validated.language,
      normalizedSectionText: normalizedText,
      gwField: validated.gwField,
      markerType: validated.markerType,
      confidence: validated.confidence,
      usageCount: 1,
      ...(validated.zone !== undefined && { zone: validated.zone }),
      ...(validated.zoneRepetitionCount !== undefined && {
        zoneRepetitionCount: validated.zoneRepetitionCount,
      }),
    },
    update: updateClause,
  });
}

/**
 * Bulk upsert template mappings into the knowledge base.
 *
 * Runs all upserts in a Prisma transaction for atomicity.
 * Non-blocking: errors are logged but not thrown to the caller.
 *
 * @param mappings - Array of mapping inputs to upsert
 * @param mode - Controls confidence behavior (default: 'create')
 * @returns Count of created and updated records
 */
export async function bulkUpsertMappings(
  mappings: TemplateMappingInput[],
  mode: UpsertMode = 'create',
): Promise<{ created: number; updated: number }> {
  if (mappings.length === 0) {
    return { created: 0, updated: 0 };
  }

  try {
    let created = 0;
    let updated = 0;

    await prisma.$transaction(async (tx) => {
      for (const mapping of mappings) {
        const validated = templateMappingSchema.parse(mapping);
        const normalizedText = normalizeSectionText(validated.sectionText);

        const whereClause = {
          templateType_language_normalizedSectionText_gwField: {
            templateType: validated.templateType,
            language: validated.language,
            normalizedSectionText: normalizedText,
            gwField: validated.gwField,
          },
        };

        // Check if record exists to track created vs updated and for confidence computation
        const existing = await tx.templateMapping.findUnique({ where: whereClause });

        const newConfidence = computeConfidence(
          mode,
          existing?.confidence,
          validated.confidence,
        );

        const updateClause: Record<string, unknown> = {
          markerType: validated.markerType,
          confidence: newConfidence,
        };

        if (mode === 'correct') {
          updateClause.correctionCount = { increment: 1 };
        } else {
          updateClause.usageCount = { increment: 1 };
        }

        if (validated.zone !== undefined) {
          updateClause.zone = validated.zone;
        }
        if (validated.zoneRepetitionCount !== undefined) {
          updateClause.zoneRepetitionCount = validated.zoneRepetitionCount;
        }

        await tx.templateMapping.upsert({
          where: whereClause,
          create: {
            templateType: validated.templateType,
            language: validated.language,
            normalizedSectionText: normalizedText,
            gwField: validated.gwField,
            markerType: validated.markerType,
            confidence: validated.confidence,
            usageCount: 1,
            ...(validated.zone !== undefined && { zone: validated.zone }),
            ...(validated.zoneRepetitionCount !== undefined && {
              zoneRepetitionCount: validated.zoneRepetitionCount,
            }),
          },
          update: updateClause,
        });

        if (existing) {
          updated++;
        } else {
          created++;
        }
      }
    });

    return { created, updated };
  } catch (error) {
    console.error('[templateMapping] bulkUpsertMappings failed:', error);
    return { created: 0, updated: 0 };
  }
}

// ---------------------------------------------------------------------------
// Few-Shot Query
// ---------------------------------------------------------------------------

/**
 * Query the knowledge base for few-shot examples matching template type and language.
 *
 * Returns top entries ordered by usageCount DESC (most-confirmed patterns first).
 * Default limit is 5.
 */
export async function queryFewShotExamples(
  templateType: string,
  language: string,
  limit: number = 5,
): Promise<TemplateMapping[]> {
  const validated = fewShotQuerySchema.parse({ templateType, language, limit });

  return prisma.templateMapping.findMany({
    where: {
      templateType: validated.templateType,
      language: validated.language,
    },
    orderBy: { usageCount: 'desc' },
    take: validated.limit,
  });
}

/**
 * Format few-shot examples into a prompt section for LLM injection.
 *
 * Produces a "## Previous Successful Mappings" section with numbered list.
 * Returns empty string if no examples found (no section injected into prompt).
 */
export function formatFewShotExamples(examples: TemplateMapping[]): string {
  if (examples.length === 0) {
    return '';
  }

  const header =
    '## Previous Successful Mappings\n\n' +
    'These mappings were confirmed by users in previous template adaptations:\n\n';

  const lines = examples.map(
    (ex, i) =>
      `${i + 1}. Section: "${ex.normalizedSectionText}" -> GW Field: ${ex.gwField} (confirmed ${ex.usageCount} times)`,
  );

  return header + lines.join('\n');
}
