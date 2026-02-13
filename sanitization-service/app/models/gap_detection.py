"""Pydantic models for gap detection and annotated preview."""
from typing import Literal

from pydantic import BaseModel, Field


class GapEntry(BaseModel):
    """A single missing GW field detected by gap analysis."""

    gw_field: str = Field(..., description="The missing GW field path")
    marker_type: str = Field(..., description="Expected marker type for this field")
    expected_context: str = Field(
        "", description="Surrounding text from reference template for context"
    )
    estimated_paragraph_index: int | None = Field(
        None, description="Estimated paragraph position from reference template"
    )


class GapDetectionResult(BaseModel):
    """Result of comparing mapping plan against reference template fields."""

    gaps: list[GapEntry] = Field(default_factory=list)
    mapped_field_count: int = Field(0, description="Number of mapped fields found in reference")
    expected_field_count: int = Field(0, description="Total expected fields from reference")
    coverage_percent: float = Field(0.0, description="Percentage of expected fields that are mapped")


class TooltipEntry(BaseModel):
    """Tooltip metadata for a single annotated paragraph."""

    paragraph_index: int
    gw_field: str
    marker_type: str
    section_text: str
    status: Literal["mapped", "gap"]


class UnmappedParagraph(BaseModel):
    """A paragraph not covered by mapping plan or gap detection."""

    paragraph_index: int
    text: str = Field(..., description="First 200 chars of paragraph text")
    heading_level: int | None = None


class AnnotationMetadata(BaseModel):
    """Metadata generated alongside an annotated DOCX preview."""

    tooltip_data: list[TooltipEntry] = Field(default_factory=list)
    unmapped_paragraphs: list[UnmappedParagraph] = Field(default_factory=list)
