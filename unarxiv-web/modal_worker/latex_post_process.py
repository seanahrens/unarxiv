"""latex_post_process.py — Shared LaTeX artifact stripping for LLM output.

Post-processing safety net that removes LaTeX artifacts from LLM-generated
narration scripts. Used by both the full LLM scripter and the hybrid scripter.
"""

from __future__ import annotations

import re


def strip_latex_artifacts(text: str) -> str:
    """Post-processing safety net: strip LaTeX artifacts from LLM output.

    Handles:
    - Math delimiters: \\( \\) \\[ \\] and equation environments
    - Cross-reference artifacts: \\ref{...} and ~ref~ passthrough
    - Backslash macro names: \\ours, \\benchname, etc.
    - Markdown bold/italic artifacts from \\textbf{} -> **bold** conversion
    - Section-outro artifacts injected by LLMs
    - LLM refusal lines
    """
    # Strip \( ... \) inline math delimiters (keep inner content)
    text = re.sub(r'\\\(|\\\)', '', text)
    # Strip \[ ... \] display math delimiters (keep inner content)
    text = re.sub(r'\\\[|\\\]', '', text)
    # Strip \begin{equation}/\end{equation} and similar environments
    text = re.sub(
        r'\\begin\{(?:equation|align|gather|multline|eqnarray)\*?\}',
        '', text
    )
    text = re.sub(
        r'\\end\{(?:equation|align|gather|multline|eqnarray)\*?\}',
        '', text
    )
    # Strip \ref{...} and related cross-reference commands entirely
    # (includes \ref, \Cref, \cref, \autoref, \pageref, \eqref)
    text = re.sub(r'\\[cC]?ref\{[^}]*\}', '', text)
    text = re.sub(r'\\(?:autoref|pageref|eqref)\{[^}]*\}', '', text)
    # Strip bare "Cref" or "cref" words that leaked through when LLM stripped the backslash
    # e.g. "Appendix Cref" or "Table cref" should become "Appendix" / "Table"
    text = re.sub(r'\b[Cc]ref\b', '', text)
    # Strip tilde-separated ref artifacts: e.g. ~ref~ablation_qual or Figure~ref~foo
    text = re.sub(r'~ref~\S*', '', text)
    # Strip "reference label" artifacts where LLM converted \ref{label} to "reference label"
    # e.g. "Section reference sec:model" -> "Section", "Theorem reference thm:upper" -> "Theorem"
    # Discriminator: LaTeX labels contain colons or underscores; plain English "reference" doesn't.
    text = re.sub(r'\breference\s+[a-zA-Z][a-zA-Z0-9]*(?:[_:][a-zA-Z0-9_:.-]*)?\b', '', text, flags=re.IGNORECASE)
    # Strip LLM refusal lines ("I'm sorry, I can't assist...") injected when a chunk has no body.
    # These appear when the LLM receives a style-only or macro-only chunk and defaults to chatbot mode.
    text = re.sub(r"(?m)^I(?:'m| am) sorry[^\n]*\.\s*$", '', text, flags=re.IGNORECASE)
    # Strip backslash macros that leaked through (e.g. \ours, \benchname)
    # Replace \macroname with just "macroname" (the plain word, better than "backslash macroname")
    text = re.sub(r'\\([A-Za-z]+)\b', r'\1', text)
    # Strip section-outro artifacts injected by LLMs (persistent failure mode — 4+ rounds).
    # Matches standalone lines like "This concludes the Introduction section." or
    # "That concludes our discussion of the proposed method."
    # These phrases are almost never present in academic source text as isolated sentences.
    text = re.sub(
        r'(?m)^(?:This|That) (?:concludes|ends|wraps up) [^\n.]{0,200}\.\s*$',
        '',
        text,
        flags=re.IGNORECASE,
    )
    # Strip Markdown bold/italic artifacts where LLM converted \textbf{X} -> **X** or \textit{X} -> *X*.
    # TTS engines speak asterisks literally; these must be stripped before reaching audio output.
    # **bold text** -> bold text
    text = re.sub(r'\*\*([^*\n]+)\*\*', r'\1', text)
    # *italic text* -> italic text  (only single asterisks; avoid matching * in math/code contexts)
    text = re.sub(r'(?<!\*)\*([^*\n]+)\*(?!\*)', r'\1', text)
    # Normalize whitespace after stripping
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()
