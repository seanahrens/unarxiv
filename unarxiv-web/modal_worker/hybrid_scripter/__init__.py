"""
hybrid_scripter — Hybrid regex+LLM narration script generator.

Combines the best of both approaches:
  - Regex pipeline handles prose (fast, free, deterministic, 9/10 quality)
  - LLM handles only complex elements regex can't: figures, display math,
    tables, algorithms (~10% of content)

Result: near-LLM quality (target 9.5/10) at ~20% of the cost and latency.

Usage:
    from hybrid_scripter import generate_script
    from llm_providers import get_provider

    provider = get_provider("anthropic", api_key=key)
    result = generate_script(
        provider=provider,
        source_path="paper.tar",
        fallback_title="...",
        figures_dir="/path/to/extracted/figures",
    )
    # result.improved_script = TTS-ready text
    # result.cost_usd = LLM cost (typically $0.01-0.03)
"""

from __future__ import annotations

import os
import re
import tarfile
from typing import Optional

from llm_providers import LLMProvider, LLMResult
from hybrid_scripter.element_extractor import extract_elements
from hybrid_scripter.llm_describer import describe_elements


class _CostTrackingProvider:
    """Wraps an LLMProvider to accumulate token counts and cost across calls."""

    def __init__(self, inner: LLMProvider):
        self._inner = inner
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost_usd = 0.0
        self.call_count = 0
        self.provider_name = ""
        self.model_name = ""

    def _call_llm(self, system, user, max_tokens, images=None):
        result = self._inner._call_llm(system, user, max_tokens, images=images)
        self.total_input_tokens += result.input_tokens
        self.total_output_tokens += result.output_tokens
        self.total_cost_usd += result.cost_usd
        self.call_count += 1
        self.provider_name = result.provider
        self.model_name = result.model
        return result


def generate_script(
    provider: LLMProvider,
    source_path: str,
    source_priority: str = "latex",
    fallback_title: str = "",
    fallback_authors: Optional[list[str]] = None,
    fallback_date: str = "",
    pdf_path: Optional[str] = None,
    figures_dir: Optional[str] = None,
    raw_source: Optional[str] = None,
) -> LLMResult:
    """Generate a TTS-ready script using the hybrid regex+LLM approach.

    The pipeline:
      1. Load and expand LaTeX source (reuses regex_scripter internals)
      2. Extract complex elements (figures, display math, tables, algorithms)
         and replace with placeholders
      3. Run the full regex pipeline on the remaining prose
      4. Generate LLM descriptions for extracted elements
      5. Insert descriptions back at placeholder positions
      6. Wrap with standard header/footer

    Args:
        provider: LLM provider for element descriptions.
        source_path: Path to .tar/.gz (LaTeX) or .pdf source.
        source_priority: "latex" or "pdf" — which parser to try first.
        fallback_title: Paper title from arXiv metadata.
        fallback_authors: Author names from arXiv metadata.
        fallback_date: Publication date from arXiv metadata.
        pdf_path: Optional separate PDF path.
        figures_dir: Directory with extracted figure images (for vision).
        raw_source: Pre-read raw LaTeX text (skips file loading if provided).

    Returns:
        LLMResult with the complete script and cost tracking.
    """
    fallback_authors = fallback_authors or []

    # -----------------------------------------------------------------------
    # Step 1: Load LaTeX source
    # -----------------------------------------------------------------------
    if raw_source and ("\\section" in raw_source or "\\begin{document}" in raw_source):
        latex = raw_source
        source_stem = "paper"
    else:
        latex = _load_latex_source(source_path)
        source_stem = os.path.splitext(os.path.basename(source_path))[0]

    if not latex:
        # Fall back to pure regex scripter (no LLM enhancement possible)
        from regex_scripter import generate_script as regex_generate
        script = regex_generate(
            source_path=source_path,
            source_priority=source_priority,
            fallback_title=fallback_title,
            fallback_authors=fallback_authors,
            fallback_date=fallback_date,
            pdf_path=pdf_path,
        )
        return LLMResult(
            improved_script=script,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
            provider="regex", model="regex_scripter",
        )

    # -----------------------------------------------------------------------
    # Step 2: Run early regex stages (macro expansion, metadata, body extraction)
    # -----------------------------------------------------------------------
    from regex_scripter.latex_parser import (
        _expand_simple_macros,
        _extract_metadata,
        _extract_body,
        _strip_pre_abstract_content,
        _strip_non_prose,
        _convert_structure_to_speech,
        _normalize_paragraphs,
        _strip_citations,
        _convert_greek_letters,
        _handle_math,
        _strip_formatting_tags,
        _normalize_text,
    )
    from regex_scripter.script_builder import build_script, finalize_body
    from regex_scripter.math_to_speech import math_to_speech

    latex = _expand_simple_macros(latex)
    meta = _extract_metadata(latex, source_stem)
    body = _extract_body(latex)
    body = _strip_pre_abstract_content(body)

    # -----------------------------------------------------------------------
    # Step 3: HYBRID — Extract complex elements BEFORE regex strips them
    # -----------------------------------------------------------------------
    body_with_placeholders, elements = extract_elements(body)

    elem_counts = {}
    for e in elements:
        elem_counts[e.element_type] = elem_counts.get(e.element_type, 0) + 1
    print(f"[hybrid] Extracted {len(elements)} elements: {elem_counts}")

    # -----------------------------------------------------------------------
    # Step 4: Run remaining regex pipeline on prose (with placeholders)
    # -----------------------------------------------------------------------
    body = _strip_non_prose(body_with_placeholders)
    body = _convert_structure_to_speech(body)
    body = _normalize_paragraphs(body)
    body = _strip_citations(body)
    body = _convert_greek_letters(body)
    body = _handle_math(body)
    body = _strip_formatting_tags(body)
    body = _normalize_text(body)
    body = finalize_body(body)

    # Verify placeholders survived the regex pipeline
    surviving_placeholders = re.findall(r"HYBRID_ELEMENT_[A-Z_]+_\d{3}", body)
    print(f"[hybrid] {len(surviving_placeholders)}/{len(elements)} placeholders survived regex pipeline")

    # -----------------------------------------------------------------------
    # Step 5: LLM descriptions for extracted elements
    # -----------------------------------------------------------------------
    figure_map = None
    if figures_dir:
        from figure_utils import build_figure_map
        figure_map = build_figure_map(figures_dir)
        print(f"[hybrid] Figure map: {len(figure_map)} entries")

    # Wrap provider to track costs across all LLM calls
    tracked_provider = _CostTrackingProvider(provider)

    descriptions = describe_elements(
        provider=tracked_provider,
        elements=elements,
        figure_map=figure_map,
        math_to_speech_fn=math_to_speech,
    )

    print(f"[hybrid] Generated {len(descriptions)}/{len(elements)} descriptions "
          f"({tracked_provider.call_count} LLM calls, ${tracked_provider.total_cost_usd:.4f})")

    # -----------------------------------------------------------------------
    # Step 6: Replace placeholders with descriptions
    # -----------------------------------------------------------------------
    for elem in elements:
        placeholder = f"HYBRID_ELEMENT_{elem.element_id}"
        desc = descriptions.get(elem.element_id, "")
        if desc:
            # Ensure description is surrounded by paragraph breaks
            body = body.replace(placeholder, f"\n\n{desc}\n\n")
        else:
            # Remove placeholder if no description available
            body = body.replace(placeholder, "")

    # Clean up any double/triple newlines from insertion
    body = re.sub(r"\n{3,}", "\n\n", body)
    body = body.strip()

    # -----------------------------------------------------------------------
    # Step 7: Wrap with header/footer
    # -----------------------------------------------------------------------
    title = fallback_title or meta.get("title", "Untitled")
    authors = fallback_authors or meta.get("authors", [])
    date = fallback_date or meta.get("date", "")

    script = build_script(body, title, authors, date, source_type="hybrid")

    return LLMResult(
        improved_script=script,
        input_tokens=tracked_provider.total_input_tokens,
        output_tokens=tracked_provider.total_output_tokens,
        cost_usd=round(tracked_provider.total_cost_usd, 6),
        provider=tracked_provider.provider_name or "hybrid",
        model=tracked_provider.model_name or "hybrid_scripter",
    )


def _load_latex_source(source_path: str) -> str | None:
    """Load raw LaTeX text from a file path (.tar/.gz or .tex)."""
    if not source_path or not os.path.isfile(source_path):
        return None

    ext = os.path.splitext(source_path)[1].lower()

    # Check if it's a PDF (not LaTeX)
    try:
        with open(source_path, "rb") as f:
            magic = f.read(5)
        if magic == b"%PDF-":
            return None
    except Exception:
        return None

    if ext == ".tex":
        try:
            return open(source_path, encoding="utf-8", errors="replace").read()
        except Exception:
            return None

    # Try as tar archive
    try:
        from regex_scripter.latex_parser import _read_latex_from_tar
        return _read_latex_from_tar(source_path)
    except Exception as e:
        print(f"[hybrid] Could not read LaTeX from {source_path}: {e}")
        return None
