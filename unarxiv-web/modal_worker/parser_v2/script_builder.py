"""
script_builder.py — Assembles the final TTS script with header and footer.

Shared by both LaTeX and PDF parsers. The body text is already clean
plaintext at this point; this module just adds the spoken intro/outro.
"""

from __future__ import annotations

import re

def build_script(
    body: str,
    title: str,
    authors: list[str],
    date: str,
    source_type: str = "unknown",
) -> str:
    """Wrap cleaned body text with a spoken header and footer.

    Args:
        source_type: "LaTeX" or "PDF" — recorded in the metadata tag.
    """
    from datetime import date as date_type
    header = _build_header(title or "Untitled", date, authors)
    footer = _build_footer(title or "Untitled", date, authors)
    source_label = "Tex" if source_type == "LaTeX" else "PDF"
    today = date_type.today().strftime("%y-%m-%d")
    metadata_tag = f"\n\n%%% {today} {source_label} %%%"
    return header + "\n" + body.strip() + footer + metadata_tag


def _build_header(title: str, date: str, authors: list[str]) -> str:
    """Build the spoken header prepended to the transcript."""
    lines = [_ensure_period(title), ""]
    if authors:
        lines += [_format_authors(authors), ""]
    if date:
        lines += [f"Published on {date}.", ""]
    return "\n".join(lines)


def _build_footer(title: str, date: str, authors: list[str]) -> str:
    """Build the spoken footer appended to the transcript."""
    parts = [f"Thanks for listening. This has been an audio narration of {_ensure_period(title)}"]
    if authors:
        parts.append(_format_authors(authors))
    if date:
        parts.append(f"Published on {date}.")
    parts.append("Narrated by un. archive dot org, an app made by Sean Ahrens and Claude.")
    return "\n\n" + " ".join(parts)


def _ensure_period(s: str) -> str:
    return s if s.endswith(".") else s + "."


def _format_authors(authors: list[str]) -> str:
    if len(authors) == 1:
        return f"By {authors[0]}."
    elif len(authors) == 2:
        return f"By {authors[0]} and {authors[1]}."
    elif len(authors) == 3:
        return f"By {authors[0]}, {authors[1]}, and {authors[2]}."
    else:
        first_three = f"{authors[0]}, {authors[1]}, {authors[2]}"
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
    """
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    lines = [l for l in text.split("\n") if l.strip() not in (".", ",", ";", ":", "-", "–")]
    return "\n".join(lines).strip()
