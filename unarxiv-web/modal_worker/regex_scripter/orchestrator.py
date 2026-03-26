"""
orchestrator.py — Entry point that routes to the LaTeX or PDF parser
based on source_priority and file availability.
"""

from __future__ import annotations

import os
import tarfile
from typing import Optional


def generate_script(
    source_path: str,
    source_priority: str = "latex",
    fallback_title: str = "",
    fallback_authors: Optional[list[str]] = None,
    fallback_date: str = "",
    pdf_path: Optional[str] = None,
) -> str:
    """Parse a paper into a TTS-ready script.

    Args:
        source_path: Path to the primary source file (.tar/.gz for LaTeX, .pdf for PDF).
        source_priority: Which parser to try first — "latex" or "pdf".
        fallback_title: Title from arXiv metadata (used if extraction fails).
        fallback_authors: Authors from arXiv metadata.
        fallback_date: Date from arXiv metadata.
        pdf_path: Optional separate PDF path if source_path is a tar.

    Returns:
        TTS-ready plaintext script with header and footer.
    """
    fallback_authors = fallback_authors or []

    if source_priority == "latex":
        parsers = [
            ("latex", source_path),
            ("pdf", pdf_path or source_path),
        ]
    else:
        parsers = [
            ("pdf", pdf_path or source_path),
            ("latex", source_path),
        ]

    last_error = None
    for parser_type, path in parsers:
        if not path or not os.path.isfile(path):
            continue
        try:
            if parser_type == "latex":
                return _try_latex(path, fallback_title, fallback_authors, fallback_date)
            else:
                return _try_pdf(path, fallback_title, fallback_authors, fallback_date)
        except Exception as e:
            last_error = e
            print(f"  regex_scripter: {parser_type} parser failed: {e}")
            continue

    raise RuntimeError(
        f"All parsers failed for {source_path}. Last error: {last_error}"
    )


def _try_latex(
    path: str,
    title: str,
    authors: list[str],
    date: str,
) -> str:
    """Attempt LaTeX parsing from a tar/gz or .tex file."""
    from regex_scripter.latex_parser import parse_latex_tar, parse_latex_file
    from regex_scripter.script_builder import build_script

    ext = os.path.splitext(path)[1].lower()
    if ext in (".tar", ".gz", ".tgz"):
        # Check if it's actually a tar
        try:
            tarfile.open(path, "r:*").close()
            body, meta = parse_latex_tar(path)
        except tarfile.TarError:
            raise ValueError(f"Not a valid tar archive: {path}")
    elif ext == ".tex":
        body, meta = parse_latex_file(path)
    else:
        # Try as tar first (arXiv .gz files are often tars)
        try:
            tarfile.open(path, "r:*").close()
            body, meta = parse_latex_tar(path)
        except tarfile.TarError:
            raise ValueError(f"Unknown file type: {path}")

    # Always use arXiv-scraped metadata (reliable, consistent format).
    # Paper-extracted metadata is ignored — arXiv is the source of truth.
    return build_script(body, title or "Untitled", authors, date, source_type="LaTeX")


def _try_pdf(
    path: str,
    title: str,
    authors: list[str],
    date: str,
) -> str:
    """Attempt PDF parsing."""
    from regex_scripter.pdf_parser import parse_pdf
    from regex_scripter.script_builder import build_script

    body = parse_pdf(path, title=title, authors=authors)
    return build_script(body, title, authors, date, source_type="PDF")
