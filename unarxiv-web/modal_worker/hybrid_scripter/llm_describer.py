"""
llm_describer.py — Targeted LLM calls to describe complex LaTeX elements
extracted by element_extractor.py.

Instead of sending the entire paper to the LLM (like llm_scripter does),
this module sends only the specific elements the regex pipeline can't handle:
figures, display math (complex), tables, and algorithms. This is faster and
cheaper while producing equally high-quality descriptions.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from hybrid_scripter.element_extractor import ExtractedElement, get_display_math_inner


@dataclass
class ElementDescription:
    """An LLM-generated spoken description of a complex element."""

    element_id: str
    description: str
    source: str  # "regex" (math_to_speech) or "llm"


# ---------------------------------------------------------------------------
# System prompt for element description — much more focused than full scripter
# ---------------------------------------------------------------------------

_ELEMENT_SYSTEM_PROMPT = """\
You are converting extracted LaTeX elements into spoken English for an audio
narration of a research paper. The surrounding prose has already been converted
to spoken text by a separate system — you are ONLY handling figures, equations,
tables, and algorithms.

Rules:
1. EQUATIONS: Speak the mathematical expression in plain English. Example:
   "x squared plus y squared equals r squared". Use "sub" for subscripts,
   "to the power of" for superscripts, "over" for fractions.
   NEVER output LaTeX commands or math delimiters in your response.

2. FIGURES: Describe with enough detail that a listener understands ~75% without
   seeing the figure. Include: chart type, axes, specific data values, visual
   layout, comparisons, and the main takeaway. Go beyond just restating the caption.

3. TABLES: Describe the table structure and key data. Example: "The table has
   five columns: Model, Accuracy, F1, Precision, and Recall. The best-performing
   model is GPT-4 with 89 percent accuracy, followed by..." Include specific numbers.

4. ALGORITHMS: Describe the algorithm's purpose and key steps in natural prose.
   Example: "The algorithm takes as input a graph G and threshold epsilon.
   It iteratively selects the node with highest degree, adds it to the solution
   set, and removes all adjacent edges. It terminates when no edges remain."

Output ONLY the spoken description for each element. No preamble, no commentary.
Each description should flow naturally as a paragraph that could be inserted into
continuous spoken narration.

CRITICAL: Never output LaTeX commands, math delimiters, or formatting. Everything
must be plain spoken English suitable for text-to-speech.\
"""


def describe_elements(
    provider,  # LLMProvider
    elements: list[ExtractedElement],
    figure_map: dict[str, str] | None = None,
    math_to_speech_fn=None,
) -> dict[str, str]:
    """Generate spoken descriptions for extracted elements.

    Args:
        provider: An LLMProvider instance (from llm_providers.py).
        elements: Elements extracted by element_extractor.extract_elements().
        figure_map: Mapping of figure ref names to file paths (for vision).
        math_to_speech_fn: Optional regex math_to_speech function to try first
            for display math. If it returns a non-empty result, the LLM is skipped.

    Returns:
        Dict mapping element_id -> spoken description text.
    """
    if not elements:
        return {}

    descriptions: dict[str, str] = {}

    # Phase 1: Try regex math_to_speech for display math (free, instant)
    llm_elements: list[ExtractedElement] = []

    for elem in elements:
        if elem.element_type == "display_math" and math_to_speech_fn:
            inner = get_display_math_inner(elem)
            if inner:
                # Check complexity first — only use regex for simple expressions
                from regex_scripter.math_to_speech import _estimate_complexity
                complexity = _estimate_complexity(inner)
                if complexity <= 6:  # stricter than inline (8) since display math is usually more complex
                    # Apply Greek letter conversion before math_to_speech
                    from regex_scripter.latex_accents import GREEK_TO_ENGLISH
                    for cmd, eng in GREEK_TO_ENGLISH.items():
                        inner = re.sub(re.escape(cmd) + r"(?![a-zA-Z])", f" {eng} ", inner)
                    spoken = math_to_speech_fn(inner)
                    if spoken and len(spoken.strip()) > 2:
                        descriptions[elem.element_id] = spoken.strip() + "."
                        print(f"  [hybrid] {elem.element_id}: regex math_to_speech succeeded (complexity={complexity})")
                        continue
            # Regex couldn't handle it or too complex — fall through to LLM
            print(f"  [hybrid] {elem.element_id}: queuing for LLM")

        llm_elements.append(elem)

    if not llm_elements:
        return descriptions

    # Phase 2: Batch LLM calls for remaining elements
    # Group by type for efficient batching:
    # - Figures get individual calls (one per figure, with vision)
    # - Everything else batched into a single call
    figures = [e for e in llm_elements if e.element_type == "figure"]
    non_figures = [e for e in llm_elements if e.element_type != "figure"]

    # Process non-figure elements in a single batch call
    if non_figures:
        batch_descriptions = _batch_describe_non_figures(provider, non_figures)
        descriptions.update(batch_descriptions)

    # Process figures individually (with vision when available)
    for fig in figures:
        desc = _describe_figure(provider, fig, figure_map)
        if desc:
            descriptions[fig.element_id] = desc

    return descriptions


def _batch_describe_non_figures(
    provider,
    elements: list[ExtractedElement],
) -> dict[str, str]:
    """Send all non-figure elements to the LLM in a single batched call."""
    if not elements:
        return {}

    # Build the user message with all elements
    parts = []
    for elem in elements:
        label = elem.element_type.upper().replace("_", " ")
        parts.append(f"--- {elem.element_id} ({label}) ---")
        if elem.context_before:
            parts.append(f"Context: ...{elem.context_before}")
        parts.append(elem.raw_latex)
        parts.append("")

    user_msg = (
        "Convert each of the following LaTeX elements into spoken English "
        "for audio narration. Output each description on its own line, "
        "prefixed with the element ID followed by a colon.\n\n"
        "Example output format:\n"
        "DISPLAY_MATH_001: x squared plus y squared equals r squared.\n"
        "TABLE_001: The table shows five models compared across...\n\n"
        + "\n".join(parts)
    )

    # Estimate output tokens: ~50 tokens per element on average
    max_tokens = max(2048, len(elements) * 200)

    print(f"  [hybrid] Batching {len(elements)} non-figure elements to LLM...")
    try:
        result = provider._call_llm(
            _ELEMENT_SYSTEM_PROMPT,
            user_msg,
            min(max_tokens, 8192),
        )
        return _parse_batch_response(result.improved_script, elements)
    except Exception as e:
        print(f"  [hybrid] WARNING: batch LLM call failed: {e}")
        return {}


def _describe_figure(
    provider,
    element: ExtractedElement,
    figure_map: dict[str, str] | None,
) -> str | None:
    """Send a single figure to the LLM with vision (if image available)."""
    # Try to load figure images
    images: list[tuple[str, str]] = []
    if figure_map and element.figure_refs:
        from figure_utils import load_image
        for ref in element.figure_refs:
            # Try exact ref, then without extension
            import os
            for key in (ref, os.path.splitext(ref)[0]):
                path = figure_map.get(key)
                if path:
                    img = load_image(path)
                    if img:
                        images.append(img)
                    break
            if len(images) >= 3:  # cap per figure
                break

    # Build user message
    caption_note = f"\nCaption: {element.caption}" if element.caption else ""
    context_note = f"\nContext: ...{element.context_before}" if element.context_before else ""
    img_note = f" ({len(images)} image(s) attached)" if images else " (no image available)"

    user_msg = (
        f"Describe this figure for audio narration.{img_note}\n\n"
        f"LaTeX source:\n{element.raw_latex}"
        f"{caption_note}{context_note}\n\n"
        "Provide a detailed spoken description including specific data values, "
        "visual layout, and main takeaway. Output ONLY the description paragraph."
    )

    print(f"  [hybrid] Describing {element.element_id}{img_note}...")
    try:
        result = provider._call_llm(
            _ELEMENT_SYSTEM_PROMPT,
            user_msg,
            2048,
            images=images or None,
        )
        desc = result.improved_script.strip()
        # Strip any accidental element ID prefix from the response
        desc = re.sub(r"^FIGURE_\d+:\s*", "", desc)
        return desc if desc else None
    except Exception as e:
        # Fall back to caption if LLM fails
        print(f"  [hybrid] WARNING: figure LLM call failed: {e}")
        if element.caption:
            return element.caption
        return None


def _parse_batch_response(
    response: str,
    elements: list[ExtractedElement],
) -> dict[str, str]:
    """Parse the LLM's batch response into element_id -> description mappings."""
    descriptions: dict[str, str] = {}

    # Try to parse "ELEMENT_ID: description" format
    for elem in elements:
        # Look for the element ID followed by a colon
        pattern = re.compile(
            re.escape(elem.element_id) + r"\s*:\s*(.+?)(?=\n[A-Z]+_\d{3}\s*:|$)",
            re.DOTALL,
        )
        m = pattern.search(response)
        if m:
            desc = m.group(1).strip()
            if desc:
                # Post-process: strip any remaining LaTeX artifacts
                from latex_post_process import strip_latex_artifacts
                desc = strip_latex_artifacts(desc)
                descriptions[elem.element_id] = desc
                print(f"  [hybrid] {elem.element_id}: LLM description ({len(desc)} chars)")
            continue

        # Fallback: if element is display math, try to find any spoken math in response
        if elem.element_type == "display_math":
            print(f"  [hybrid] WARNING: no LLM description found for {elem.element_id}")

    return descriptions
