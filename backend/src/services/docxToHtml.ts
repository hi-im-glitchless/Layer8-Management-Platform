/**
 * DOCX-to-HTML conversion utility using mammoth.js.
 *
 * Converts DOCX Buffer to clean semantic HTML with style mappings
 * that produce proper heading hierarchy, lists, tables, and inline
 * placeholders for images. Replaces the docx_parser.py paragraph
 * extraction path for the HTML-centric report pipeline.
 *
 * Images are replaced with [IMAGE_N] placeholders -- they are not
 * needed for the executive report and must not be sent to the LLM.
 */

import mammoth from 'mammoth';

/** Result of a DOCX-to-HTML conversion. */
export interface DocxToHtmlResult {
  /** The converted HTML body content. */
  html: string;
  /** Any conversion warnings produced by mammoth. */
  warnings: string[];
}

/**
 * Style mappings from common DOCX styles to semantic HTML elements.
 *
 * These map Word paragraph and run styles to appropriate HTML tags,
 * ensuring the output is clean and consistent regardless of the
 * DOCX authoring tool used.
 */
const STYLE_MAP: string[] = [
  // Heading styles
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",

  // Title and subtitle
  "p[style-name='Title'] => h1.doc-title:fresh",
  "p[style-name='Subtitle'] => h2.doc-subtitle:fresh",

  // List styles
  "p[style-name='List Paragraph'] => li:fresh",
  "p[style-name='List Bullet'] => ul > li:fresh",
  "p[style-name='List Number'] => ol > li:fresh",

  // Quote/callout styles
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense > p:fresh",

  // Run-level styles
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",

  // Table of Contents entries (preserve but mark)
  "p[style-name='TOC Heading'] => h2.toc-heading:fresh",
  "p[style-name='toc 1'] => p.toc-entry.toc-level-1:fresh",
  "p[style-name='toc 2'] => p.toc-entry.toc-level-2:fresh",
  "p[style-name='toc 3'] => p.toc-entry.toc-level-3:fresh",
];

/**
 * Image converter that replaces images with incrementing [IMAGE_N]
 * placeholders. Executive report images are not needed for the LLM
 * pipeline and base64-inlining them would waste tokens and trigger
 * mammoth bugs on WMF/EMF formats.
 */
function createImagePlaceholderConverter() {
  let counter = 0;
  return mammoth.images.imgElement(() => {
    counter++;
    return Promise.resolve({ src: '', alt: `[IMAGE_${counter}]` });
  });
}

/**
 * Convert a DOCX file buffer to clean semantic HTML.
 *
 * Uses mammoth.js with custom style mappings to produce HTML with
 * proper heading hierarchy (h1-h6), semantic lists (ul/ol), and tables.
 * Images are replaced with [IMAGE_N] placeholders.
 *
 * @param buffer - Raw DOCX file bytes.
 * @returns Object with `html` (the body content) and `warnings` array.
 */
export async function convertDocxToHtml(
  buffer: Buffer,
): Promise<DocxToHtmlResult> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,
      convertImage: createImagePlaceholderConverter(),
    },
  );

  // Replace <img> placeholder tags with plain text placeholders
  // mammoth emits <img src="" alt="[IMAGE_N]"> -- strip to just the alt text
  let html = result.value;
  html = html.replace(/<img\s+src=""\s+alt="(\[IMAGE_\d+\])"\s*\/?>/g, '$1');

  const warnings = result.messages
    .filter((msg) => msg.type === 'warning')
    .map((msg) => msg.message);

  return { html, warnings };
}
