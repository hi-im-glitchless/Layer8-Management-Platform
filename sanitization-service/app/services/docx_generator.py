"""DOCX generation service -- renders Jinja2 templates into DOCX files."""
import logging
from io import BytesIO

from docx import Document
from docxtpl import DocxTemplate

logger = logging.getLogger(__name__)


class DocxGeneratorService:
    """Generates DOCX files from Jinja2-templated DOCX inputs.

    Leverages docxtpl which natively supports:
    - ``{{ variable }}`` simple text placeholders
    - ``{{r variable }}`` run-level rich text (inline formatting preserved)
    - ``{{p variable }}`` paragraph-level rich text
    - ``{%tr for ... %}`` / ``{%tr endfor %}`` table row loops
    """

    def generate(self, template_bytes: bytes, context: dict) -> bytes:
        """Render a DOCX template with the given Jinja2 context.

        Args:
            template_bytes: Raw bytes of a .docx template containing Jinja2 markers.
            context: Dictionary of placeholder values for rendering.

        Returns:
            Rendered DOCX file as bytes.

        Raises:
            ValueError: If the template cannot be loaded or rendered.
        """
        # Validate the bytes are a valid DOCX before passing to docxtpl.
        # DocxTemplate defers Document loading to render(), so we validate
        # early to give a clear "load" vs "render" error distinction.
        try:
            Document(BytesIO(template_bytes))
        except Exception as exc:
            raise ValueError(f"Failed to load DOCX template: {exc}") from exc

        try:
            tpl = DocxTemplate(BytesIO(template_bytes))
            tpl.render(context)
        except Exception as exc:
            raise ValueError(f"Failed to render DOCX template: {exc}") from exc

        output = BytesIO()
        tpl.save(output)
        return output.getvalue()
