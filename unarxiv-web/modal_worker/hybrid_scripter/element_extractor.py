"""
element_extractor.py — Extract complex LaTeX elements (figures, display math,
tables, algorithms) from a LaTeX document body, replacing them with unique
placeholders that survive the regex processing pipeline.

The regex_scripter handles prose text excellently but drops all complex
elements entirely. This module captures those elements before the regex
pipeline strips them, so they can be sent to an LLM for spoken descriptions.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class ExtractedElement:
    """A complex LaTeX element extracted from the document body."""

    element_id: str
    """Unique ID like 'FIGURE_001', 'DISPLAY_MATH_003'."""

    element_type: str
    """One of: 'figure', 'table', 'display_math', 'algorithm'."""

    raw_latex: str
    """The original LaTeX content of the element."""

    placeholder: str
    """The placeholder string inserted into the body."""

    caption: str = ""
    """Extracted caption text (for figures and tables)."""

    figure_refs: list[str] = field(default_factory=list)
    """List of \\includegraphics file references (for figures)."""

    context_before: str = ""
    """A sentence or two of surrounding context (helps LLM describe the element)."""


def extract_elements(body: str) -> tuple[str, list[ExtractedElement]]:
    """Extract complex elements from a LaTeX body, replacing with placeholders.

    Returns (modified_body, extracted_elements).
    The modified body has each complex element replaced with a placeholder like:
        HYBRID_ELEMENT_FIGURE_001
    These placeholders are plain words that survive the regex pipeline intact.
    """
    elements: list[ExtractedElement] = []
    counters = {"figure": 0, "table": 0, "display_math": 0, "algorithm": 0}

    def _make_placeholder(etype: str) -> tuple[str, str]:
        counters[etype] += 1
        eid = f"{etype.upper()}_{counters[etype]:03d}"
        # Use a distinctive marker that won't be mangled by the regex pipeline.
        # No backslashes, no brackets, no braces — just uppercase words.
        placeholder = f"\n\nHYBRID_ELEMENT_{eid}\n\n"
        return eid, placeholder

    # -----------------------------------------------------------------------
    # Phase 1: Extract environment-based elements (figures, tables, algorithms)
    # These are the outermost environments — we don't try to extract nested ones.
    # -----------------------------------------------------------------------

    # Environments to extract, in priority order (outermost first)
    env_configs = [
        # (env_names, element_type)
        (["figure", "figure*"], "figure"),
        (["table", "table*", "longtable"], "table"),
        (["algorithm", "algorithm*", "algorithm2e"], "algorithm"),
    ]

    for env_names, etype in env_configs:
        for env_name in env_names:
            body = _extract_environment(body, env_name, etype, elements, counters)

    # -----------------------------------------------------------------------
    # Phase 2: Extract display math (not inside already-extracted environments)
    # Order matters: named environments first, then bare delimiters.
    # -----------------------------------------------------------------------

    # Named display math environments
    math_envs = [
        "equation", "equation*",
        "align", "align*",
        "gather", "gather*",
        "multline", "multline*",
        "eqnarray", "eqnarray*",
    ]
    for env_name in math_envs:
        body = _extract_environment(body, env_name, "display_math", elements, counters)

    # Bare \[...\] display math
    body = _extract_bracket_display_math(body, elements, counters)

    # Bare $$...$$ display math
    body = _extract_dollar_display_math(body, elements, counters)

    return body, elements


def _extract_environment(
    body: str,
    env_name: str,
    element_type: str,
    elements: list[ExtractedElement],
    counters: dict[str, int],
) -> str:
    """Extract all occurrences of \\begin{env_name}...\\end{env_name}."""
    # Use a non-greedy match for the environment content.
    # For nested environments of the same name, this will match the innermost.
    # That's fine — we process iteratively until none remain.
    pattern = re.compile(
        r"\\begin\{" + re.escape(env_name) + r"\}"
        r"(.*?)"
        r"\\end\{" + re.escape(env_name) + r"\}",
        re.DOTALL,
    )

    while True:
        m = pattern.search(body)
        if not m:
            break

        raw_latex = m.group(0)
        inner = m.group(1)

        counters[element_type] += 1
        eid = f"{element_type.upper()}_{counters[element_type]:03d}"
        placeholder = f"\n\nHYBRID_ELEMENT_{eid}\n\n"

        # Extract caption if present
        caption = _extract_caption(inner)

        # Extract figure references if it's a figure
        figure_refs = _extract_figure_refs(inner) if element_type == "figure" else []

        # Get context: up to 200 chars before the element
        ctx_start = max(0, m.start() - 200)
        context_before = body[ctx_start:m.start()].strip()
        # Take just the last sentence
        last_period = context_before.rfind(".")
        if last_period >= 0:
            context_before = context_before[last_period + 1:].strip()

        elements.append(ExtractedElement(
            element_id=eid,
            element_type=element_type,
            raw_latex=raw_latex,
            placeholder=placeholder.strip(),
            caption=caption,
            figure_refs=figure_refs,
            context_before=context_before,
        ))

        body = body[:m.start()] + placeholder + body[m.end():]

    return body


def _extract_bracket_display_math(
    body: str,
    elements: list[ExtractedElement],
    counters: dict[str, int],
) -> str:
    r"""Extract \[...\] display math."""
    pattern = re.compile(r"\\\[(.*?)\\\]", re.DOTALL)
    while True:
        m = pattern.search(body)
        if not m:
            break
        raw_latex = m.group(0)
        counters["display_math"] += 1
        eid = f"DISPLAY_MATH_{counters['display_math']:03d}"
        placeholder = f"\n\nHYBRID_ELEMENT_{eid}\n\n"

        elements.append(ExtractedElement(
            element_id=eid,
            element_type="display_math",
            raw_latex=raw_latex,
            placeholder=placeholder.strip(),
        ))
        body = body[:m.start()] + placeholder + body[m.end():]

    return body


def _extract_dollar_display_math(
    body: str,
    elements: list[ExtractedElement],
    counters: dict[str, int],
) -> str:
    """Extract $$...$$ display math."""
    pattern = re.compile(r"\$\$(.*?)\$\$", re.DOTALL)
    while True:
        m = pattern.search(body)
        if not m:
            break
        raw_latex = m.group(0)
        counters["display_math"] += 1
        eid = f"DISPLAY_MATH_{counters['display_math']:03d}"
        placeholder = f"\n\nHYBRID_ELEMENT_{eid}\n\n"

        elements.append(ExtractedElement(
            element_id=eid,
            element_type="display_math",
            raw_latex=raw_latex,
            placeholder=placeholder.strip(),
        ))
        body = body[:m.start()] + placeholder + body[m.end():]

    return body


def _extract_caption(latex: str) -> str:
    """Extract the text content of \\caption{...} from a LaTeX snippet."""
    # Simple extraction — handle one level of nesting
    m = re.search(r"\\caption\{", latex)
    if not m:
        return ""
    # Brace-count to find matching close
    start = m.end()
    depth = 1
    pos = start
    while pos < len(latex) and depth > 0:
        if latex[pos] == "{":
            depth += 1
        elif latex[pos] == "}":
            depth -= 1
        pos += 1
    if depth == 0:
        caption = latex[start:pos - 1]
        # Strip LaTeX formatting from caption
        caption = re.sub(r"\\textbf\{([^}]*)\}", r"\1", caption)
        caption = re.sub(r"\\textit\{([^}]*)\}", r"\1", caption)
        caption = re.sub(r"\\emph\{([^}]*)\}", r"\1", caption)
        caption = re.sub(r"\\label\{[^}]*\}", "", caption)
        caption = re.sub(r"\\[a-zA-Z]+\{([^}]*)\}", r"\1", caption)
        caption = re.sub(r"[{}]", "", caption)
        return caption.strip()
    return ""


def _extract_figure_refs(latex: str) -> list[str]:
    """Extract \\includegraphics file references from LaTeX."""
    refs = []
    for m in re.finditer(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", latex):
        ref = m.group(1).strip()
        refs.append(ref)
    return refs


def get_display_math_inner(element: ExtractedElement) -> str:
    """Extract the inner math content from a display math element,
    stripping the environment wrappers."""
    raw = element.raw_latex

    # Strip \begin{env}...\end{env}
    m = re.match(r"\\begin\{[^}]+\}(.*?)\\end\{[^}]+\}", raw, re.DOTALL)
    if m:
        inner = m.group(1).strip()
        # Strip equation numbering labels
        inner = re.sub(r"\\label\{[^}]*\}", "", inner)
        # Strip alignment markers
        inner = inner.replace("&", " ")
        inner = inner.replace("\\\\", " ")
        inner = re.sub(r"\\nonumber\b", "", inner)
        inner = re.sub(r"\\notag\b", "", inner)
        return inner.strip()

    # Strip \[...\]
    m = re.match(r"\\\[(.*?)\\\]", raw, re.DOTALL)
    if m:
        return m.group(1).strip()

    # Strip $$...$$
    m = re.match(r"\$\$(.*?)\$\$", raw, re.DOTALL)
    if m:
        return m.group(1).strip()

    return raw
