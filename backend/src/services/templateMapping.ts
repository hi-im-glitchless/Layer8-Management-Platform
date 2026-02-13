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
