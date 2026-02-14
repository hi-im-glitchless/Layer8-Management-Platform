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
import type { TemplateMapping, BlueprintPattern, StyleHint } from '@prisma/client';

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
 * Returns top entries ordered by confidence DESC, then usageCount DESC.
 * Optionally filters by zone when provided.
 * Default limit is 5.
 */
export async function queryFewShotExamples(
  templateType: string,
  language: string,
  limit: number = 5,
  zone?: string,
): Promise<TemplateMapping[]> {
  const validated = fewShotQuerySchema.parse({ templateType, language, limit });

  const whereClause: Record<string, unknown> = {
    templateType: validated.templateType,
    language: validated.language,
  };

  if (zone !== undefined) {
    whereClause.zone = zone;
  }

  return prisma.templateMapping.findMany({
    where: whereClause,
    orderBy: [{ confidence: 'desc' }, { usageCount: 'desc' }],
    take: validated.limit,
  });
}

/**
 * Query all mappings for a template type and language, grouped by zone.
 *
 * Only returns mappings with confidence >= minConfidence.
 * Results within each zone are ordered by confidence descending.
 */
export async function queryByZone(
  templateType: string,
  language: string,
  minConfidence: number = 0.3,
): Promise<Map<string, TemplateMapping[]>> {
  const mappings = await prisma.templateMapping.findMany({
    where: {
      templateType,
      language,
      confidence: { gte: minConfidence },
    },
    orderBy: [{ confidence: 'desc' }],
  });

  const grouped = new Map<string, TemplateMapping[]>();
  for (const mapping of mappings) {
    const zoneKey = mapping.zone;
    const existing = grouped.get(zoneKey);
    if (existing) {
      existing.push(mapping);
    } else {
      grouped.set(zoneKey, [mapping]);
    }
  }

  return grouped;
}

/**
 * Return aggregated zone repetition counts per (gwField, zone) for a template type.
 *
 * Used by the structured prompt builder to understand how many times each
 * GW field appears in each document zone.
 */
export async function queryZoneRepetitionSummary(
  templateType: string,
  language: string,
): Promise<Array<{ gwField: string; zone: string; totalCount: number }>> {
  const mappings = await prisma.templateMapping.findMany({
    where: { templateType, language },
    select: { gwField: true, zone: true, zoneRepetitionCount: true },
  });

  // Aggregate by (gwField, zone)
  const aggregated = new Map<string, { gwField: string; zone: string; totalCount: number }>();
  for (const m of mappings) {
    const key = `${m.gwField}::${m.zone}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.totalCount += m.zoneRepetitionCount;
    } else {
      aggregated.set(key, {
        gwField: m.gwField,
        zone: m.zone,
        totalCount: m.zoneRepetitionCount,
      });
    }
  }

  return Array.from(aggregated.values());
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

// ---------------------------------------------------------------------------
// BlueprintPattern CRUD
// ---------------------------------------------------------------------------

export type BlueprintMarker = { gwField: string; markerType: string };

const blueprintSchema = z.object({
  templateType: z.string().min(1),
  zone: z.string().min(1),
  patternType: z.enum(['loop', 'conditional', 'group']),
  markers: z.array(z.object({ gwField: z.string(), markerType: z.string() })),
  anchorStyle: z.string().nullable().optional(),
});

export type BlueprintPatternInput = z.infer<typeof blueprintSchema>;

/**
 * Upsert a blueprint pattern into the knowledge base.
 *
 * Serializes the markers array to JSON for storage.
 * Upserts by the unique constraint [templateType, zone, patternType, markers].
 */
export async function upsertBlueprint(
  input: BlueprintPatternInput,
): Promise<BlueprintPattern> {
  const validated = blueprintSchema.parse(input);
  const markersJson = JSON.stringify(validated.markers);

  return prisma.blueprintPattern.upsert({
    where: {
      templateType_zone_patternType_markers: {
        templateType: validated.templateType,
        zone: validated.zone,
        patternType: validated.patternType,
        markers: markersJson,
      },
    },
    create: {
      templateType: validated.templateType,
      zone: validated.zone,
      patternType: validated.patternType,
      markers: markersJson,
      anchorStyle: validated.anchorStyle ?? null,
    },
    update: {
      anchorStyle: validated.anchorStyle ?? null,
    },
  });
}

/**
 * Query blueprint patterns for a template type, optionally filtered by zone.
 *
 * Deserializes the markers JSON string back into an array of BlueprintMarker objects.
 * Returns results with a parsed `parsedMarkers` property for convenience.
 */
export async function queryBlueprints(
  templateType: string,
  zone?: string,
): Promise<(BlueprintPattern & { parsedMarkers: BlueprintMarker[] })[]> {
  const whereClause: Record<string, unknown> = { templateType };
  if (zone !== undefined) {
    whereClause.zone = zone;
  }

  const results = await prisma.blueprintPattern.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
  });

  return results.map((bp) => ({
    ...bp,
    parsedMarkers: JSON.parse(bp.markers) as BlueprintMarker[],
  }));
}

// ---------------------------------------------------------------------------
// StyleHint CRUD
// ---------------------------------------------------------------------------

/**
 * Upsert a style hint, incrementing mappedCount or skippedCount based on
 * whether the style was mapped or skipped during template analysis.
 */
export async function upsertStyleHint(
  templateType: string,
  styleName: string,
  zone: string,
  mapped: boolean,
): Promise<StyleHint> {
  return prisma.styleHint.upsert({
    where: {
      templateType_styleName_zone: {
        templateType,
        styleName,
        zone,
      },
    },
    create: {
      templateType,
      styleName,
      zone,
      mappedCount: mapped ? 1 : 0,
      skippedCount: mapped ? 0 : 1,
    },
    update: mapped
      ? { mappedCount: { increment: 1 } }
      : { skippedCount: { increment: 1 } },
  });
}

/**
 * Bulk upsert style hints for all styles encountered in a document analysis.
 *
 * @param entries - Array of { styleName, zone, mapped } objects
 * @returns Count of upserted records
 */
export async function bulkUpsertStyleHints(
  templateType: string,
  entries: Array<{ styleName: string; zone: string; mapped: boolean }>,
): Promise<number> {
  if (entries.length === 0) return 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        await tx.styleHint.upsert({
          where: {
            templateType_styleName_zone: {
              templateType,
              styleName: entry.styleName,
              zone: entry.zone,
            },
          },
          create: {
            templateType,
            styleName: entry.styleName,
            zone: entry.zone,
            mappedCount: entry.mapped ? 1 : 0,
            skippedCount: entry.mapped ? 0 : 1,
          },
          update: entry.mapped
            ? { mappedCount: { increment: 1 } }
            : { skippedCount: { increment: 1 } },
        });
      }
    });
    return entries.length;
  } catch (error) {
    console.error('[templateMapping] bulkUpsertStyleHints failed:', error);
    return 0;
  }
}

/**
 * Query style hints for a template type, ordered by mapping ratio descending.
 *
 * Styles that are most frequently mapped (vs skipped) surface first.
 */
export async function queryStyleHints(
  templateType: string,
): Promise<StyleHint[]> {
  const hints = await prisma.styleHint.findMany({
    where: { templateType },
  });

  // Sort by mapping ratio (mappedCount / total) descending
  return hints.sort((a, b) => {
    const totalA = a.mappedCount + a.skippedCount;
    const totalB = b.mappedCount + b.skippedCount;
    const ratioA = totalA > 0 ? a.mappedCount / totalA : 0;
    const ratioB = totalB > 0 ? b.mappedCount / totalB : 0;
    return ratioB - ratioA;
  });
}

/**
 * Get style names that are almost never mapped (boilerplate/decorative styles).
 *
 * Returns styles where mappedCount / (mappedCount + skippedCount) < threshold.
 * Default threshold is 0.1 (styles mapped less than 10% of the time).
 */
export async function getBoilerplateStyles(
  templateType: string,
  threshold: number = 0.1,
): Promise<string[]> {
  const hints = await prisma.styleHint.findMany({
    where: { templateType },
  });

  return hints
    .filter((h) => {
      const total = h.mappedCount + h.skippedCount;
      if (total === 0) return false; // No data yet, don't classify
      return h.mappedCount / total < threshold;
    })
    .map((h) => h.styleName);
}
