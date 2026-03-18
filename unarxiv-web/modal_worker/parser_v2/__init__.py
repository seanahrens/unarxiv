"""
parser_v2 — Next-generation arXiv paper → TTS script parser.

Two independent parsers:
  - latex_parser: Parses LaTeX source into narration-ready plaintext
  - pdf_parser:   Parses PDF files into narration-ready plaintext

Usage:
    from parser_v2 import parse_paper

    script = parse_paper(
        source_path="paper.tar",   # .tar/.gz or .pdf
        source_priority="latex",   # "latex" or "pdf"
        fallback_title="...",
        fallback_authors=["..."],
        fallback_date="...",
    )
"""

from parser_v2.orchestrator import parse_paper
from parser_v2.script_builder import PARSER_VERSION

__all__ = ["parse_paper", "PARSER_VERSION"]
