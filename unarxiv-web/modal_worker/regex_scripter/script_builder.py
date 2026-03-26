"""
script_builder.py — Assembles the final TTS script with header and footer.

Shared by both LaTeX and PDF parsers. The body text is already clean
plaintext at this point; this module just adds the spoken intro/outro.
"""

from __future__ import annotations

import re
from datetime import datetime


def build_script(
    body: str,
    title: str,
    authors: list[str],
    date: str,
    source_type: str = "unknown",
) -> str:
    """Wrap cleaned body text with a spoken header and footer."""
    formatted_date = format_date(date)
    header = build_header(title or "Untitled", formatted_date, authors)
    footer = build_footer(title or "Untitled", formatted_date, authors)
    return header + "\n" + body.strip() + footer


def build_header(title: str, date: str, authors: list[str]) -> str:
    """Build the spoken header prepended to the transcript."""
    lines = [_ensure_period(title), ""]
    if authors:
        lines += [_format_authors(authors), ""]
    if date:
        lines += [f"Published on {date}.", ""]
    return "\n".join(lines)


def build_footer(title: str, date: str, authors: list[str]) -> str:
    """Build the spoken footer appended to the transcript."""
    parts = [f"Thanks for listening. This has been an audio narration of {_ensure_period(title)}"]
    if authors:
        parts.append(_format_authors(authors))
    if date:
        parts.append(f"Published on {date}.")
    parts.append("Narrated by un. archive dot org, an app made by Sean Ahrens and Claude.")
    return "\n\n" + " ".join(parts)


def format_date(date: str) -> str:
    """Convert YYYY-MM-DD to 'Month D, YYYY'; pass through other formats."""
    try:
        dt = datetime.strptime(date.strip(), "%Y-%m-%d")
        return dt.strftime("%B %-d, %Y")
    except (ValueError, AttributeError):
        return date


# Backward-compat aliases (used by callers that imported the private names)
_build_header = build_header
_build_footer = build_footer
_format_date = format_date


def _ensure_period(s: str) -> str:
    return s if s.endswith(".") else s + "."


def _format_authors(authors: list[str]) -> str:
    # Strip trailing periods from author names to prevent double-period ("et al..")
    def _clean(name: str) -> str:
        return name.rstrip(".")

    if len(authors) == 1:
        return f"By {_clean(authors[0])}."
    elif len(authors) == 2:
        return f"By {_clean(authors[0])} and {_clean(authors[1])}."
    elif len(authors) == 3:
        return f"By {_clean(authors[0])}, {_clean(authors[1])}, and {_clean(authors[2])}."
    else:
        first_three = f"{_clean(authors[0])}, {_clean(authors[1])}, {_clean(authors[2])}"
        remaining = len(authors) - 3
        return f"By {first_three}, and {remaining} more author{'s' if remaining != 1 else ''}."


def _format_paper_info(title: str, date: str, authors: list[str]) -> str:
    parts = [_ensure_period(title)]
    if date:
        parts.append(f"Published {date}.")
    if authors:
        parts.append(_format_authors(authors))
    return " ".join(parts)


def finalize_body(text: str) -> str:
    """Final cleanup pass on body text before assembly.

    - Collapse excessive blank lines
    - Remove stray punctuation-only lines
    - Normalize whitespace
    - Deduplicate consecutive identical paragraph headers
    """
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    lines = [l for l in text.split("\n") if l.strip() not in (".", ",", ";", ":", "-", "–")]
    text = "\n".join(lines)
    # Strip lines that are only TeX length/spacing residue, e.g. ", -2ex," or " ,-1.5ex."
    # These are left over from partially stripped column specs or \vspace-style commands.
    text = re.sub(
        r"^\s*[,\s]*-?\d+\.?\d*(?:ex|em|pt|cm|mm|in|sp|bp|pc)\s*[,.\s]*$",
        "",
        text,
        flags=re.MULTILINE,
    )
    # Deduplicate consecutive identical short paragraph headers
    # e.g., "Abstract.\n\nAbstract." -> "Abstract." (ICML two-abstract-block pattern)
    text = re.sub(r"([A-Z][^\n]{2,60}\.)\n\n\1(?=\n)", r"\1", text)
    return text.strip()
