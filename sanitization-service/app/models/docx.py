"""Pydantic models for DOCX parsing and generation."""
from typing import Literal

from pydantic import BaseModel, Field

ZoneType = Literal["header", "footer", "body", "table_cell", "text_box", "cover", "unknown"]


class DocxRun(BaseModel):
    """A run within a paragraph -- a contiguous span of text with uniform formatting."""

    text: str
    bold: bool | None = None
    italic: bool | None = None
    underline: bool | None = None
    font_name: str | None = None
    font_size: float | None = None  # Points
    color: str | None = None  # Hex color string e.g. "FF0000"


class DocxParagraph(BaseModel):
    """A paragraph extracted from a DOCX document."""

    text: str
    style_name: str | None = None
    heading_level: int | None = None  # 1-9 for headings, None for non-headings
    alignment: str | None = None  # LEFT, CENTER, RIGHT, JUSTIFY, etc.
    runs: list[DocxRun] = Field(default_factory=list)
    zone: ZoneType | None = None  # Document zone: header, footer, body, table_cell, text_box, cover, unknown
    table_index: int | None = None  # Which table a paragraph comes from (-1 for body paragraphs)


class DocxCell(BaseModel):
    """A cell within a table row."""

    text: str
    paragraphs: list[DocxParagraph] = Field(default_factory=list)
    merge_info: dict | None = None  # Vertical/horizontal merge metadata


class DocxRow(BaseModel):
    """A row within a table."""

    cells: list[DocxCell] = Field(default_factory=list)


class DocxTable(BaseModel):
    """A table extracted from a DOCX document."""

    rows: list[DocxRow] = Field(default_factory=list)
    style_name: str | None = None


class DocxImage(BaseModel):
    """An image reference extracted from a DOCX document."""

    content_type: str | None = None
    width: int | None = None  # EMU (English Metric Units)
    height: int | None = None  # EMU
    filename: str | None = None
    paragraph_index: int | None = None


class DocxSection(BaseModel):
    """A section (page layout region) from a DOCX document."""

    header_paragraphs: list[DocxParagraph] = Field(default_factory=list)
    footer_paragraphs: list[DocxParagraph] = Field(default_factory=list)
    page_width: int | None = None  # EMU
    page_height: int | None = None  # EMU
    orientation: str | None = None  # PORTRAIT or LANDSCAPE


class DocxTextBox(BaseModel):
    """A text box (w:txbxContent) extracted from a DOCX document."""

    paragraphs: list[DocxParagraph] = Field(default_factory=list)
    location: str = "body"  # "body", "header (Section 1)", "footer (Section 1)", etc.


class DocxStructure(BaseModel):
    """Complete structured representation of a parsed DOCX document."""

    paragraphs: list[DocxParagraph] = Field(default_factory=list)
    tables: list[DocxTable] = Field(default_factory=list)
    images: list[DocxImage] = Field(default_factory=list)
    sections: list[DocxSection] = Field(default_factory=list)
    styles: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    text_boxes: list[DocxTextBox] = Field(default_factory=list)


class GenerateDocxRequest(BaseModel):
    """Request model for DOCX generation endpoint."""

    template_content: str  # Base64-encoded DOCX template
    placeholders: dict = Field(default_factory=dict)  # Placeholder values for Jinja2 rendering


class GenerateDocxResponse(BaseModel):
    """Response model for DOCX generation endpoint (metadata only; file is streamed)."""

    filename: str
    size_bytes: int


class RenderTemplateRequest(BaseModel):
    """Request model for Jinja2 template rendering endpoint."""

    template_base64: str  # Base64-encoded DOCX template
    context: dict = Field(default_factory=dict)  # Jinja2 rendering context (template variables)
