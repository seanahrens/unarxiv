"""
regex_scripter — Deterministic regex-based arXiv paper → TTS script generator.

Two independent parsers:
  - latex_parser: Parses LaTeX source into narration-ready plaintext
  - pdf_parser:   Parses PDF files into narration-ready plaintext

Usage:
    from regex_scripter import generate_script

    script = generate_script(
        source_path="paper.tar",   # .tar/.gz or .pdf
        source_priority="latex",   # "latex" or "pdf"
        fallback_title="...",
        fallback_authors=["..."],
        fallback_date="...",
    )
"""

from regex_scripter.orchestrator import generate_script

__all__ = ["generate_script"]
