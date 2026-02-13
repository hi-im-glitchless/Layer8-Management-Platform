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
// Zod Schemas
// ---------------------------------------------------------------------------

export const templateMappingSchema = z.object({
  templateType: z.string().min(1),
  language: z.string().min(1),
  sectionText: z.string().min(1),
  gwField: z.string().min(1),
  markerType: z.string().min(1),
  confidence: z.number().min(0).max(1).default(1.0),
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
 * Upsert a single template mapping into the knowledge base.
 *
 * On create: sets usageCount=1, confidence=input.confidence
 * On update (duplicate key): increments usageCount by 1, updates confidence
 *
 * @returns The upserted TemplateMapping record
 */
export async function upsertMapping(input: TemplateMappingInput): Promise<TemplateMapping> {
  const validated = templateMappingSchema.parse(input);
  const normalizedText = normalizeSectionText(validated.sectionText);

  return prisma.templateMapping.upsert({
    where: {
      templateType_language_normalizedSectionText_gwField: {
        templateType: validated.templateType,
        language: validated.language,
        normalizedSectionText: normalizedText,
        gwField: validated.gwField,
      },
    },
    create: {
      templateType: validated.templateType,
      language: validated.language,
      normalizedSectionText: normalizedText,
      gwField: validated.gwField,
      markerType: validated.markerType,
      confidence: validated.confidence,
      usageCount: 1,
    },
    update: {
      usageCount: { increment: 1 },
      confidence: validated.confidence,
      markerType: validated.markerType,
    },
  });
}

/**
 * Bulk upsert template mappings into the knowledge base.
 *
 * Runs all upserts in a Prisma transaction for atomicity.
 * Non-blocking: errors are logged but not thrown to the caller.
 *
 * @returns Count of created and updated records
 */
export async function bulkUpsertMappings(
  mappings: TemplateMappingInput[],
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

        // Check if record exists to track created vs updated
        const existing = await tx.templateMapping.findUnique({
          where: {
            templateType_language_normalizedSectionText_gwField: {
              templateType: validated.templateType,
              language: validated.language,
              normalizedSectionText: normalizedText,
              gwField: validated.gwField,
            },
          },
        });

        await tx.templateMapping.upsert({
          where: {
            templateType_language_normalizedSectionText_gwField: {
              templateType: validated.templateType,
              language: validated.language,
              normalizedSectionText: normalizedText,
              gwField: validated.gwField,
            },
          },
          create: {
            templateType: validated.templateType,
            language: validated.language,
            normalizedSectionText: normalizedText,
            gwField: validated.gwField,
            markerType: validated.markerType,
            confidence: validated.confidence,
            usageCount: 1,
          },
          update: {
            usageCount: { increment: 1 },
            confidence: validated.confidence,
            markerType: validated.markerType,
          },
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
