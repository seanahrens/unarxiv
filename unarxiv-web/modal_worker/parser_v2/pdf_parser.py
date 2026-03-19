"""
pdf_parser.py — Extract text from academic PDFs and produce TTS-ready plaintext.

Uses PyMuPDF (fitz) for primary text extraction and pdfplumber as a
secondary option for better table/column handling.

Architecture:
    1. Extract raw text from PDF pages
    2. Strip title/author block (already provided via arXiv metadata)
    3. Strip headers/footers (repeated per-page content)
    4. Strip citation section (References/Bibliography)
    5. Strip acknowledgments
    6. Strip figure/table captions and table data
    7. Strip inline citation markers ([1], [2,3])
    8. Rejoin column-broken lines
    9. Normalize for TTS
"""

from __future__ import annotations

import re
from typing import Optional

from parser_v2.script_builder import finalize_body


def parse_pdf(
    pdf_path: str,
    title: str = "",
    authors: Optional[list[str]] = None,
) -> str:
    """Extract and clean text from a PDF for TTS narration.

    Args:
        pdf_path: Path to the PDF file.
        title: Paper title (from arXiv metadata) for title block detection.
        authors: Author names (from arXiv metadata) for title block detection.

    Returns:
        Cleaned body text ready for script assembly.
    """
    authors = authors or []

    raw_text = _extract_text_pymupdf(pdf_path)

    if not raw_text or len(raw_text.strip()) < 200:
        raise RuntimeError(
            f"PDF text extraction yielded too little text ({len(raw_text)} chars). "
            "The PDF may be scanned/image-based."
        )

    text = _strip_title_block(raw_text, title, authors)
    text = _strip_page_artifacts(text, title)
    text = _strip_references_section(text)
    text = _strip_acknowledgments(text)
    text = _strip_figures_and_tables(text)
    text = _strip_citation_markers(text)
    text = _rejoin_lines(text)
    text = _normalize_paragraphs(text)
    text = _normalize_for_tts(text)
    text = finalize_body(text)

    return text


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def _extract_text_pymupdf(pdf_path: str) -> str:
    """Extract text from PDF using PyMuPDF."""
    import fitz

    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        pages.append(page.get_text("text"))
    doc.close()

    return "\n\n".join(pages)


# ---------------------------------------------------------------------------
# Title block removal
# ---------------------------------------------------------------------------

def _strip_title_block(text: str, title: str, authors: list[str]) -> str:
    """Remove the title/author/affiliation block from the top of the PDF.

    This information is rendered separately in the spoken header.
    """
    if not title:
        return text

    # Find the title in the first ~3000 chars
    title_lower = title.lower().strip().rstrip(".")
    head = text[:3000].lower()
    idx = head.find(title_lower)
    if idx == -1:
        # Try with first few words only
        words = title_lower.split()[:5]
        if len(words) >= 3:
            short_title = " ".join(words)
            idx = head.find(short_title)
    if idx == -1:
        return text

    # Find where body text begins after the title block
    after_title = text[idx + len(title_lower):]

    # Look for "Abstract" keyword
    abstract_m = re.search(r"\n\s*Abstract\s*\n", after_title, re.IGNORECASE)
    if abstract_m:
        return after_title[abstract_m.start():]

    # Look for a heading-like pattern (e.g., "1 Introduction", "I. Introduction")
    intro_m = re.search(r"\n\s*(?:1\.?\s+Introduction|I\.?\s+Introduction|1\s+INTRODUCTION)\s*\n",
                        after_title, re.IGNORECASE)
    if intro_m:
        return after_title[intro_m.start():]

    # Fallback: skip short lines (author names, affiliations) until we hit
    # a substantial paragraph
    lines_after = after_title.split("\n")
    skip = 0
    for i, line in enumerate(lines_after):
        if len(line.strip()) > 100:
            skip = i
            break
    if skip > 2:
        return "\n".join(lines_after[skip:])

    return text


# ---------------------------------------------------------------------------
# Page header/footer stripping
# ---------------------------------------------------------------------------

def _strip_page_artifacts(text: str, title: str = "") -> str:
    """Remove repeated page headers/footers, page numbers, arXiv stamps."""

    # Remove form-feed characters
    text = text.replace("\f", "\n\n")

    # Strip arXiv stamp lines
    text = re.sub(r"^arXiv:\S+[^\n]*\n?", "", text, flags=re.MULTILINE)

    # Strip "Author et al." running headers
    text = re.sub(r"^\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+et al\.\s*$\n?",
                  "", text, flags=re.MULTILINE)

    # Strip footnote/affiliation markers (symbols at line start)
    text = re.sub(r"^[∗†‡✝✦⋆]\s*.{0,80}$", "", text, flags=re.MULTILINE)

    # Strip standalone page numbers
    text = re.sub(r"^\s*[-–—]?\s*\d{1,3}\s*[-–—]?\s*$", "", text, flags=re.MULTILINE)

    # Strip standalone section numbers on their own line
    text = re.sub(r"^\s*\d+(?:\.\d+)+\s*$", "", text, flags=re.MULTILINE)

    # Strip running title if it appears multiple times
    if title:
        title_words = title.split()[:5]
        if len(title_words) >= 3:
            short_pattern = re.escape(" ".join(title_words[:4]))
            # Count occurrences after first 500 chars
            text_tail = text[500:]
            count = len(re.findall(short_pattern, text_tail, re.IGNORECASE))
            if count >= 2:
                text = text[:500] + re.sub(short_pattern, "", text_tail, flags=re.IGNORECASE)

    # Strip Authors' addresses block
    text = re.sub(r"^Authors\S*\s*addresses:.*?(?=\n[A-Z]|\Z)",
                  "", text, flags=re.DOTALL | re.MULTILINE)

    return text


# ---------------------------------------------------------------------------
# References/bibliography removal
# ---------------------------------------------------------------------------

def _strip_references_section(text: str) -> str:
    """Remove the References/Bibliography section and everything after it."""
    text = re.split(
        r"\n\s*(?:References|Bibliography|REFERENCES|BIBLIOGRAPHY)\s*\n",
        text, maxsplit=1
    )[0]
    return text


# ---------------------------------------------------------------------------
# Acknowledgments removal
# ---------------------------------------------------------------------------

def _strip_acknowledgments(text: str) -> str:
    """Remove the Acknowledgments section."""
    # Match heading + content until next heading or end
    text = re.sub(
        r"\n\s*(?:Acknowledg(?:e?ments?)|ACKNOWLEDG(?:E?MENTS?))\s*\n.*?"
        r"(?=\n\s*(?:[A-Z][A-Za-z\s]{3,40})\s*\n|\Z)",
        "\n", text, flags=re.DOTALL,
    )
    return text


# ---------------------------------------------------------------------------
# Figure/table caption and data stripping
# ---------------------------------------------------------------------------

def _strip_figures_and_tables(text: str) -> str:
    """Remove figure captions, table captions, and table-like data rows."""

    # Remove figure/table captions
    text = re.sub(r"^(?:Figure|Fig\.|Table)\s+\d+[.:].+$",
                  "", text, flags=re.MULTILINE)

    # Remove lines that look like table data (>50% numeric tokens)
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned.append("")
            continue
        # Skip standalone URLs
        if re.match(r"^https?://\S+$", stripped):
            continue
        # Skip standalone footnote markers
        if re.match(r"^\d{1,2}$", stripped):
            continue
        # Skip table-like rows
        tokens = stripped.split()
        if len(tokens) >= 3:
            num_tokens = sum(1 for t in tokens if re.match(r"^[\d.,±]+%?$", t))
            if num_tokens > len(tokens) * 0.5:
                continue
        cleaned.append(line)
    text = "\n".join(cleaned)

    return text


# ---------------------------------------------------------------------------
# Citation marker stripping
# ---------------------------------------------------------------------------

def _strip_citation_markers(text: str) -> str:
    """Remove inline citation markers like [1], [1,2,3], [12; 15]."""

    # Bracketed numeric citations
    text = re.sub(r"\[\d+(?:[,;]\s*\d+)*\]", "", text)

    # Superscript-style citations after punctuation
    text = re.sub(r"(?<=[.!?,;])\d{1,2}(?=\s)", "", text)

    # Clean up URLs
    text = re.sub(r"https?://\S+", "", text)

    # Clean up empty parentheses/brackets from stripped refs
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\[\s*\]", "", text)

    return text


# ---------------------------------------------------------------------------
# Line rejoining
# ---------------------------------------------------------------------------

def _rejoin_lines(text: str) -> str:
    """Rejoin lines broken by PDF column layout and hyphenation."""

    # Rejoin hyphenated line breaks
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)

    # Rejoin lines that are continuations
    lines = text.split("\n")
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Join with next line if current doesn't end with sentence punctuation
        # and next line starts with lowercase (continuation)
        while (
            i + 1 < len(lines)
            and line.rstrip()
            and line.rstrip()[-1] not in ".!?:;\n"
            and lines[i + 1].strip()
            and lines[i + 1].strip()[0].islower()
        ):
            i += 1
            line = line.rstrip() + " " + lines[i].strip()
        merged.append(line)
        i += 1
    text = "\n".join(merged)

    return text


def _normalize_paragraphs(text: str) -> str:
    """Join within-paragraph lines while preserving paragraph breaks.

    After line-rejoining, paragraphs are separated by blank lines (\n\n)
    but may still have single newlines within them from PDF column breaks.
    This collapses each paragraph into a single line.
    """
    paragraphs = re.split(r"\n{2,}", text)
    joined = []
    for para in paragraphs:
        para = re.sub(r"\n", " ", para)
        para = re.sub(r" {2,}", " ", para)
        joined.append(para.strip())
    return "\n\n".join(p for p in joined if p)


# ---------------------------------------------------------------------------
# TTS normalization
# ---------------------------------------------------------------------------

def _normalize_for_tts(text: str) -> str:
    """Final normalization for TTS readability."""

    # Common abbreviations
    text = re.sub(r"e\.g\.", "for example,", text)
    text = re.sub(r"i\.e\.", "that is,", text)
    text = re.sub(r"cf\.", "compare", text)
    text = re.sub(r"w\.r\.t\.", "with respect to", text)

    # Collapse multiple newlines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Collapse multiple spaces
    text = re.sub(r"[ \t]+", " ", text)

    # Clean trailing spaces before punctuation
    text = re.sub(r" +([.,;:!?])", r"\1", text)

    return text.strip()
