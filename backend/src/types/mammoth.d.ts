declare module 'mammoth' {
  interface ConvertOptions {
    /** Custom style mappings from DOCX styles to HTML elements. */
    styleMap?: string[];
    /** Function to convert images. Return { src } with data URI or URL. */
    convertImage?: {
      (element: ImageElement): Promise<{ src: string }>;
    };
    /** Whether to include default style map (default: true). */
    includeDefaultStyleMap?: boolean;
    /** Whether to include embedded style map from DOCX (default: true). */
    includeEmbeddedStyleMap?: boolean;
    /** ID prefix for generated elements. */
    idPrefix?: string;
  }

  interface ImageElement {
    read(encoding: 'base64'): Promise<string>;
    contentType: string;
    altText?: string;
  }

  interface ConvertResult {
    /** The generated HTML string. */
    value: string;
    /** Warnings produced during conversion. */
    messages: Message[];
  }

  interface Message {
    type: string;
    message: string;
  }

  /** Convert a DOCX buffer to HTML. */
  function convertToHtml(
    input: { buffer: Buffer | ArrayBuffer },
    options?: ConvertOptions
  ): Promise<ConvertResult>;

  /** Convert a DOCX buffer to Markdown. */
  function convertToMarkdown(
    input: { buffer: Buffer | ArrayBuffer },
    options?: ConvertOptions
  ): Promise<ConvertResult>;

  /** Extract raw text from a DOCX buffer. */
  function extractRawText(
    input: { buffer: Buffer | ArrayBuffer }
  ): Promise<ConvertResult>;

  /** Built-in image converter that inlines images as base64 data URIs. */
  const images: {
    inline(element: ImageElement): Promise<{ src: string }>;
    dataUri(element: ImageElement): Promise<{ src: string }>;
  };
}
