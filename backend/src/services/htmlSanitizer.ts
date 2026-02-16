/**
 * HTML Text Node Sanitizer -- walks HTML, extracts text nodes, calls Presidio,
 * and wraps detected entities in <span> tags with data attributes.
 *
 * Uses a session-scoped counter map for incrementing placeholders:
 * same original value always gets the same placeholder within a session.
 */
import { parse, HTMLElement, TextNode, NodeType } from 'node-html-parser';
import { sanitizeText } from './sanitization.js';
import type { EntityMapping, SanitizedParagraph, SanitizedEntity } from './reportWizardState.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SanitizeHtmlResult {
  sanitizedHtml: string;
  entityMappings: EntityMapping[];
  updatedCounterMap: Record<string, Record<string, number>>;
  sanitizedParagraphs: SanitizedParagraph[]; // backward compat
  forwardMappings: Record<string, string>;
  reverseMappings: Record<string, string>;
}

/** Entity detected by Presidio sanitize endpoint. */
interface PresidioEntity {
  entityType: string;
  start: number;
  end: number;
  score: number;
  text: string;
  placeholder: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize entity type to lowercase-hyphenated CSS class fragment. */
function entityTypeToCssClass(entityType: string): string {
  return entityType.toLowerCase().replace(/_/g, '-');
}

/**
 * Build an entity span tag wrapping the placeholder text.
 * Format: <span class="entity entity-{type}" data-entity-type="{TYPE}"
 *          data-placeholder="{placeholder}" data-original="{original}">{placeholder}</span>
 */
function buildEntitySpan(
  entityType: string,
  placeholder: string,
  originalValue: string,
): string {
  const cssClass = entityTypeToCssClass(entityType);
  const escaped = escapeHtmlAttr(originalValue);
  return (
    `<span class="entity entity-${cssClass}" ` +
    `data-entity-type="${entityType}" ` +
    `data-placeholder="${placeholder}" ` +
    `data-original="${escaped}">` +
    `${placeholder}</span>`
  );
}

/** Escape a string for safe use in an HTML attribute value. */
function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Look up or assign a placeholder index for an entity.
 * Same originalValue for the same entityType always returns the same index.
 */
function getOrAssignIndex(
  counterMap: Record<string, Record<string, number>>,
  entityType: string,
  originalValue: string,
): number {
  if (!counterMap[entityType]) {
    counterMap[entityType] = {};
  }
  const typeMap = counterMap[entityType];

  if (typeMap[originalValue] !== undefined) {
    return typeMap[originalValue];
  }

  // Next index = number of unique values already assigned + 1
  const nextIndex = Object.keys(typeMap).length + 1;
  typeMap[originalValue] = nextIndex;
  return nextIndex;
}

/**
 * Build the placeholder string: [ENTITY_TYPE_N]
 * e.g. [PERSON_1], [IP_ADDRESS_3]
 */
function buildPlaceholder(entityType: string, index: number): string {
  return `[${entityType}_${index}]`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Sanitize HTML by walking text nodes, calling Presidio for each,
 * and wrapping detected entities in <span> tags.
 *
 * @param html - Raw HTML string (mammoth output)
 * @param sessionId - Session ID for Presidio mapping storage
 * @param counterMap - Session-scoped counter map (mutated in place and returned)
 * @param language - Detected language for Presidio (default 'en')
 * @param manualMappings - User-added manual entity mappings to apply after Presidio detection
 * @returns Sanitized HTML with entity spans, mappings, and backward-compat paragraphs
 */
export async function sanitizeHtmlTextNodes(
  html: string,
  sessionId: string,
  counterMap: Record<string, Record<string, number>>,
  language: string = 'en',
  manualMappings: EntityMapping[] = [],
): Promise<SanitizeHtmlResult> {
  const root = parse(html, {
    comment: true,
    blockTextElements: {
      script: true,
      noscript: true,
      style: true,
      pre: true,
    },
  });

  const entityMappings: EntityMapping[] = [];
  const forwardMappings: Record<string, string> = {};
  const reverseMappings: Record<string, string> = {};
  const sanitizedParagraphs: SanitizedParagraph[] = [];

  // Collect all text nodes that have meaningful content
  const textNodes: { node: TextNode; parent: HTMLElement }[] = [];
  collectTextNodes(root, textNodes);

  // Track paragraph index for backward compat
  let paragraphIndex = 0;

  // Process each text node
  for (const { node, parent } of textNodes) {
    const originalText = node.rawText;
    if (!originalText.trim()) continue;

    try {
      // Call Presidio to detect entities in this text segment
      const presidioLang = language === 'pt-pt' ? 'pt' : language;
      const result = await sanitizeText(originalText, sessionId, [], {
        language: presidioLang,
      });

      if (result.entities.length === 0) {
        // No entities detected -- keep text as-is, add to backward compat
        sanitizedParagraphs.push({
          index: paragraphIndex++,
          original: originalText,
          sanitized: originalText,
          entities: [],
        });
        continue;
      }

      // Process entities in reverse order (so start/end offsets remain valid)
      const sortedEntities = [...result.entities].sort(
        (a, b) => b.start - a.start,
      );

      let processedText = originalText;
      const paragraphEntities: SanitizedEntity[] = [];

      for (const entity of sortedEntities) {
        const entityText = entity.text;
        const entityType = entity.entityType;

        // Get or assign an incrementing index for this entity value
        const index = getOrAssignIndex(counterMap, entityType, entityText);
        const placeholder = buildPlaceholder(entityType, index);
        const span = buildEntitySpan(entityType, placeholder, entityText);

        // Replace the entity text with the span in the processed text
        processedText =
          processedText.substring(0, entity.start) +
          span +
          processedText.substring(entity.end);

        // Track the mapping (deduplicate by original value)
        if (!forwardMappings[entityText]) {
          forwardMappings[entityText] = placeholder;
          reverseMappings[placeholder] = entityText;
          entityMappings.push({
            originalValue: entityText,
            placeholder,
            entityType,
            isManual: false,
          });
        }

        paragraphEntities.push({
          type: entityType,
          start: entity.start,
          end: entity.end,
          text: entityText,
          placeholder,
        });
      }

      // Replace the text node content with the processed HTML
      // node-html-parser: replace the text node with raw HTML in its parent
      replaceTextNodeWithHtml(parent, node, processedText);

      // Build backward-compat paragraph (text-only, with placeholders replacing entities)
      const textOnlySanitized = result.entities.reduce(
        (text: string, ent: PresidioEntity) => {
          const idx = getOrAssignIndex(counterMap, ent.entityType, ent.text);
          const ph = buildPlaceholder(ent.entityType, idx);
          return text.replace(ent.text, ph);
        },
        originalText,
      );

      sanitizedParagraphs.push({
        index: paragraphIndex++,
        original: originalText,
        sanitized: textOnlySanitized,
        entities: paragraphEntities,
      });
    } catch (err) {
      console.warn(
        `[htmlSanitizer] Failed to sanitize text node, keeping original:`,
        err,
      );
      // Keep original text on failure
      sanitizedParagraphs.push({
        index: paragraphIndex++,
        original: originalText,
        sanitized: originalText,
        entities: [],
      });
    }
  }

  // Second pass: global coverage for ALL known entity values.
  // Presidio first pass only tags entities at the specific offsets it detected.
  // If "CompanyX" appears 10 times and Presidio catches 3, the other 7 are
  // silently missed. This pass finds and replaces ALL remaining occurrences
  // of every known entity value (both Presidio-detected and manual mappings).
  //
  // We use string-level replacement on the serialized HTML rather than DOM
  // manipulation, because set_content() invalidates child nodes and makes
  // subsequent indexOf-based text node replacement unreliable.

  // Register manual mappings in tracking structures
  for (const mapping of manualMappings) {
    const { originalValue, entityType } = mapping;
    if (!originalValue || !entityType) continue;

    const index = getOrAssignIndex(counterMap, entityType, originalValue);
    const placeholder = buildPlaceholder(entityType, index);

    if (!forwardMappings[originalValue]) {
      forwardMappings[originalValue] = placeholder;
      reverseMappings[placeholder] = originalValue;
      entityMappings.push({
        originalValue,
        placeholder,
        entityType,
        isManual: true,
      });
    }
  }

  // Build replacement list: all known entity values (manual + Presidio)
  // sorted by length descending so longer matches take priority
  const replacements: { value: string; span: string }[] = [];
  for (const mapping of entityMappings) {
    replacements.push({
      value: mapping.originalValue,
      span: buildEntitySpan(mapping.entityType, mapping.placeholder, mapping.originalValue),
    });
  }
  replacements.sort((a, b) => b.value.length - a.value.length);

  // Serialize the DOM after the Presidio first pass, then do global
  // text-content-only replacement (skip inside HTML tags/attributes)
  let finalHtml = root.toString();
  const htmlLenBefore = finalHtml.length;

  console.log(
    `[htmlSanitizer] Global pass: ${manualMappings.length} manual, ${entityMappings.length} total mappings, ${replacements.length} replacements to apply`,
  );

  if (replacements.length > 0) {
    finalHtml = replaceInTextSegments(finalHtml, replacements);
  }

  if (finalHtml.length !== htmlLenBefore) {
    console.log(
      `[htmlSanitizer] Global pass changed HTML: ${htmlLenBefore} -> ${finalHtml.length} chars (+${finalHtml.length - htmlLenBefore})`,
    );
  } else {
    console.log(`[htmlSanitizer] Global pass: no changes to HTML`);
  }

  return {
    sanitizedHtml: finalHtml,
    entityMappings,
    updatedCounterMap: counterMap,
    sanitizedParagraphs,
    forwardMappings,
    reverseMappings,
  };
}

// ---------------------------------------------------------------------------
// DOM walking helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect text nodes from the HTML tree that have
 * meaningful content (non-whitespace).
 */
function collectTextNodes(
  node: HTMLElement,
  results: { node: TextNode; parent: HTMLElement }[],
): void {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      const textNode = child as TextNode;
      if (textNode.rawText.trim()) {
        results.push({ node: textNode, parent: node });
      }
    } else if (child.nodeType === NodeType.ELEMENT_NODE) {
      const el = child as HTMLElement;
      // Skip script, style, and pre tags
      const tag = el.tagName?.toLowerCase();
      if (tag !== 'script' && tag !== 'style' && tag !== 'pre') {
        collectTextNodes(el, results);
      }
    }
  }
}

/**
 * Replace a text node in its parent with raw HTML content.
 * node-html-parser does not support direct text node replacement,
 * so we rebuild the parent's innerHTML with the replacement.
 */
function replaceTextNodeWithHtml(
  parent: HTMLElement,
  textNode: TextNode,
  replacementHtml: string,
): void {
  // Get the current inner HTML of the parent
  const parentHtml = parent.innerHTML;
  const originalText = textNode.rawText;

  // Find the text in the parent HTML and replace first occurrence
  const idx = parentHtml.indexOf(originalText);
  if (idx !== -1) {
    const newHtml =
      parentHtml.substring(0, idx) +
      replacementHtml +
      parentHtml.substring(idx + originalText.length);
    parent.set_content(newHtml);
  }
}

/**
 * Replace entity values in text segments of HTML only.
 * Splits HTML into alternating [text, tag, text, tag, ...] segments,
 * applies replacements only on text segments, and leaves HTML tags
 * (including attributes like data-original) untouched.
 */
function replaceInTextSegments(
  html: string,
  replacements: { value: string; span: string }[],
): string {
  // Split by HTML tags — odd indices are tags, even indices are text
  const parts = html.split(/(<[^>]+>)/);
  for (let i = 0; i < parts.length; i += 2) {
    // Only process text segments (even indices)
    let segment = parts[i];
    if (!segment) continue;
    for (const { value, span } of replacements) {
      if (segment.includes(value)) {
        segment = segment.split(value).join(span);
      }
    }
    parts[i] = segment;
  }
  return parts.join('');
}
