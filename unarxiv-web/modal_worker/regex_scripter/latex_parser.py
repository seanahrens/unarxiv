"""
latex_parser.py — Converts LaTeX source files into TTS-ready plaintext.

Architecture:
    1. Source loading (tar extraction, \\input expansion)
    2. Metadata extraction (title, authors, date)
    3. Document body extraction (between \\begin{document} and \\end{document})
    4. Structural pass: remove non-prose environments (figures, tables, bibliography)
    5. Section/list structure → spoken markers
    6. Citation stripping (references AND inline markers)
    7. Math → spoken text conversion
    8. Formatting tag stripping (preserve inner text)
    9. Accent/character normalization
    10. Final cleanup
"""

from __future__ import annotations

import os
import re
import tarfile
from typing import Optional

from regex_scripter.math_to_speech import math_to_speech, inline_math_to_speech
from regex_scripter.latex_accents import latex_accents_to_unicode, GREEK_TO_ENGLISH
from regex_scripter.script_builder import finalize_body


# ---------------------------------------------------------------------------
# Source loading
# ---------------------------------------------------------------------------

def parse_latex_tar(tar_path: str) -> tuple[str, dict]:
    """Parse LaTeX from a tar archive. Returns (body_text, metadata)."""
    latex = _read_latex_from_tar(tar_path)
    return _process_latex(latex, source_stem=_stem_from_path(tar_path))


def parse_latex_file(tex_path: str) -> tuple[str, dict]:
    """Parse a single .tex file. Returns (body_text, metadata)."""
    latex = open(tex_path, encoding="utf-8", errors="replace").read()
    return _process_latex(latex, source_stem=_stem_from_path(tex_path))


def _stem_from_path(path: str) -> str:
    return os.path.splitext(os.path.basename(path))[0]


def _expand_simple_macros(latex: str) -> str:
    """Expand simple zero-argument \\newcommand definitions.

    Only handles \\newcommand{\\name}{replacement} with no arguments.
    This catches common patterns like \\newcommand{\\mistral}{Mistral 7B}.
    """
    # First, strip color-gradient wrappers: \gradientRGB{text}{c1}{c2} -> text
    # (used by papers to render colored system names, e.g. \ours)
    latex = re.sub(r"\\gradientRGB\{([^}]*)\}\{[^}]*\}\{[^}]*\}", r"\1", latex)

    # Find all \newcommand{\name}{body} with no arguments (no [N])
    # Pattern allows one level of nested braces in the body (e.g., \textbf{Name}).
    macros: dict[str, str] = {}
    for m in re.finditer(
        r"\\(?:new|renew|provide)command\*?\{(\\[a-zA-Z]+)\}\s*"
        r"\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}",
        latex
    ):
        cmd_name = m.group(1)
        replacement = m.group(2).strip()
        # Expand text macros that are plain text or end only with \xspace
        clean = re.sub(r"\\xspace\s*$", "", replacement).strip()
        if len(clean) < 100 and "\\" not in clean and clean:
            macros[cmd_name] = clean
        elif len(replacement) < 100 and "\\" not in replacement:
            macros[cmd_name] = replacement
        else:
            # Try stripping inline formatting wrappers to extract plain text.
            # Handles: \newcommand{\ours}{\textbf{SomeName}\xspace} → "SomeName"
            # This recovers system/dataset names defined with bold/italic markup.
            plain = re.sub(
                r"\\(?:textbf|textit|emph|textsc|texttt|textsf|text|mathbf)\{([^}]*)\}",
                r"\1", replacement
            )
            plain = re.sub(r"\\xspace\s*$", "", plain).strip()
            if len(plain) < 100 and "\\" not in plain and plain:
                macros[cmd_name] = plain

    # Apply expansions (up to 3 passes for chained macros)
    for _ in range(3):
        for cmd, repl in macros.items():
            latex = re.sub(re.escape(cmd) + r"(?![a-zA-Z])", repl, latex)

    return latex


def _process_latex(latex: str, source_stem: str = "") -> tuple[str, dict]:
    """Main pipeline: raw LaTeX → (body_text, metadata_dict)."""
    # Expand simple user-defined macros before processing
    latex = _expand_simple_macros(latex)
    meta = _extract_metadata(latex, source_stem)
    body = _extract_body(latex)
    body = _strip_pre_abstract_content(body)
    body = _strip_non_prose(body)
    body = _convert_structure_to_speech(body)
    body = _normalize_paragraphs(body)
    body = _strip_citations(body)
    body = _convert_greek_letters(body)  # before math handling so Greek in math gets spoken
    body = _handle_math(body)
    body = _strip_formatting_tags(body)
    body = _normalize_text(body)
    body = finalize_body(body)
    return body, meta


# ---------------------------------------------------------------------------
# Tar extraction and \input expansion
# ---------------------------------------------------------------------------

def _read_latex_from_tar(tar_path: str) -> str:
    """Read and expand LaTeX from a tar archive without extracting to disk."""
    with tarfile.open(tar_path, "r:*") as tf:
        members = {m.name: m for m in tf.getmembers() if m.isfile()}
        members_lower = {k.lower(): k for k in members}

        def read_member(member) -> str:
            return tf.extractfile(member).read().decode("utf-8", errors="replace")

        def resolve_member(ref: str, current_dir: str):
            candidates = [ref + ".tex", ref] if not ref.endswith(".tex") else [ref]
            for candidate in candidates:
                search_paths = []
                if current_dir:
                    search_paths.append(os.path.normpath(os.path.join(current_dir, candidate)))
                search_paths.append(os.path.normpath(candidate))
                for base in search_paths:
                    if base in members:
                        return members[base]
                    key = base.lower().lstrip("./")
                    if key in members_lower:
                        return members[members_lower[key]]
            return None

        def expand(src: str, current_dir: str, visited: set[str]) -> str:
            def replacer(m: re.Match) -> str:
                member = resolve_member(m.group(2).strip(), current_dir)
                if member is None:
                    return ""  # silently skip missing includes
                norm = os.path.normpath(member.name)
                if norm in visited:
                    return ""
                visited.add(norm)
                result = expand(read_member(member), os.path.dirname(member.name), visited)
                visited.discard(norm)
                return result
            return re.sub(r"\\(input|include)\{([^}]+)\}", replacer, src)

        entry = _find_entry_tex(tf, members, read_member)
        source = read_member(entry)
        return expand(source, os.path.dirname(entry.name),
                      visited={os.path.normpath(entry.name)})


def _find_entry_tex(tf, members: dict, read_member) -> object:
    """Locate the root .tex file using priority rules:
    1. Any .tex with \\documentclass + \\begin{document}, ranked by body length
       (avoids empty stubs like a bare main.tex that shadows the real paper)
    2. main.tex as last resort if no \\documentclass files found
    """
    tex_members = [m for m in members.values() if m.name.lower().endswith(".tex")]

    # Find all files with full document structure, rank by body content length
    roots = []
    for m in tex_members:
        try:
            src = read_member(m)
        except Exception:
            continue
        if r"\documentclass" in src and r"\begin{document}" in src:
            body_match = re.search(
                r'\\begin\{document\}(.*?)\\end\{document\}', src, re.DOTALL
            )
            body_len = len(body_match.group(1).strip()) if body_match else 0
            roots.append((-body_len, m.name.count("/"), m))

    if roots:
        return min(roots)[2]

    # Fallback: main.tex by name even without \documentclass
    mains = [m for m in tex_members if os.path.basename(m.name).lower() == "main.tex"]
    if mains:
        return min(mains, key=lambda m: m.name.count("/"))

    raise FileNotFoundError("No root .tex file found in archive")


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

_MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _extract_metadata(latex: str, source_stem: str = "") -> dict:
    """Extract title, date, and authors from LaTeX source."""
    # --- Title ---
    raw_title = _extract_cmd_arg(latex, "title") or ""
    raw_sub = _extract_cmd_arg(latex, "subtitle")

    title = _strip_inline_latex(raw_title)
    if raw_sub:
        subtitle = _strip_inline_latex(raw_sub)
        if subtitle:
            title = f"{title}: {subtitle}"

    # Try ICML title if standard title is empty
    if not title or title == "Untitled":
        icml = _extract_cmd_arg(latex, "icmltitle")
        if icml:
            title = _strip_inline_latex(icml)

    if not title:
        title = "Untitled"

    # --- Date ---
    date_str = ""
    preamble_end = latex.find(r"\begin{document}")
    preamble = latex[:preamble_end] if preamble_end != -1 else latex[:3000]
    date_m = re.search(r"\\date\{(.+?)\}", preamble, re.DOTALL)
    if date_m:
        raw_date = _strip_inline_latex(date_m.group(1))
        if raw_date and re.search(
            r"\d|january|february|march|april|may|june|july|august|september|october|november|december",
            raw_date, re.IGNORECASE
        ):
            date_str = raw_date

    # Fallback: parse arXiv ID from source_stem
    if not date_str and source_stem:
        arxiv_m = re.search(r"(\d{2})(\d{2})\.\d{4,5}", source_stem)
        if arxiv_m:
            year = 2000 + int(arxiv_m.group(1))
            month = int(arxiv_m.group(2))
            if 1 <= month <= 12:
                date_str = f"{_MONTH_NAMES[month]} {year}"

    # --- Authors ---
    authors = _extract_authors(latex)

    return {"title": title, "date": date_str, "authors": authors}


def _extract_authors(latex: str) -> list[str]:
    """Extract author names from various LaTeX author formats."""
    authors: list[str] = []

    # Try \\icmlauthor{Name}{Affiliation}
    icml = re.findall(r"\\icmlauthor\{([^}]+)\}", latex)
    if icml:
        authors = [_strip_inline_latex(a) for a in icml]

    # Try multiple separate \\author{} commands
    if not authors:
        multi = re.findall(r"\\author\b[^{]*\{", latex)
        if len(multi) > 1:
            names = []
            pos = 0
            while True:
                idx = latex.find("\\author", pos)
                if idx == -1:
                    break
                end_cmd = idx + len("\\author")
                if end_cmd < len(latex) and latex[end_cmd].isalpha():
                    pos = end_cmd
                    continue
                arg = _extract_cmd_arg(latex[idx:], "author")
                if arg:
                    name = _strip_inline_latex(arg)
                    if name and "@" not in name and len(name) < 80:
                        names.append(name)
                pos = end_cmd + 1
            authors = names

    # Try single \\author{} with \\and separators
    if not authors:
        raw = _extract_cmd_arg(latex, "author")
        if raw:
            parts = re.split(r"\\and\b|\\AND\b", raw)
            for part in parts:
                name = _strip_inline_latex(part)
                if name and "@" not in name and len(name) < 80:
                    authors.append(name)

    # Deduplicate preserving order
    seen: set[str] = set()
    unique = []
    for a in authors:
        if a and a not in seen:
            seen.add(a)
            unique.append(a)
    return unique


# ---------------------------------------------------------------------------
# Body extraction
# ---------------------------------------------------------------------------

def _extract_body(latex: str) -> str:
    """Extract text between \\begin{document} and \\end{document}.

    Also captures \\abstract{...} commands that appear in the preamble
    (before \\begin{document}), which is common in modern conference templates
    (NeurIPS, ICML, ICLR, arXiv templates) that use \\abstract{} as a
    preamble command rather than a \\begin{abstract} environment.
    """
    doc_m = re.search(r"\\begin\{document\}(.*?)\\end\{document\}", latex, re.DOTALL)
    body = doc_m.group(1) if doc_m else latex

    # Check for \abstract{...} in the preamble (before \begin{document})
    if doc_m:
        preamble = latex[:doc_m.start()]
        abs_m = re.search(r"\\abstract\s*\{", preamble)
        if abs_m:
            # Extract the full braced argument using brace-counting
            abs_content = _extract_braced_arg(preamble, abs_m.end() - 1)
            if abs_content:
                # Prepend the abstract to the body as a \begin{abstract} block
                body = r"\begin{abstract}" + abs_content + r"\end{abstract}" + "\n" + body

    return body


def _strip_pre_abstract_content(body: str) -> str:
    """Strip boilerplate that appears before the abstract or first section.

    Many papers include copyright notices, permission blocks, or institutional
    headers in a \\begin{center}...\\end{center} block between \\maketitle and
    \\begin{abstract}.  These are not part of the paper body and should be
    excluded from narration.
    """
    # Find the start of the abstract or first section — whichever comes first
    # Handle both \begin{abstract} (environment form) and \abstract{ (command form)
    abstract_env_m = re.search(r"\\begin\{abstract\}", body)
    abstract_cmd_m = re.search(r"\\abstract\s*\{", body)
    section_m = re.search(r"\\(?:sub)*section\*?\{", body)

    first_body = None
    if abstract_env_m:
        first_body = abstract_env_m.start()
    if abstract_cmd_m and (first_body is None or abstract_cmd_m.start() < first_body):
        first_body = abstract_cmd_m.start()
    if section_m and (first_body is None or section_m.start() < first_body):
        first_body = section_m.start()

    # Only strip if there is substantial pre-content (>50 chars) to remove
    if first_body is not None and first_body > 50:
        return body[first_body:]
    return body


# ---------------------------------------------------------------------------
# Non-prose stripping (figures, tables, bibliography, etc.)
# ---------------------------------------------------------------------------

def _strip_non_prose(text: str) -> str:
    """Remove all environments and commands that don't contain readable prose."""

    # Strip LaTeX comments
    text = re.sub(r"(?<!\\)%.*$", "", text, flags=re.MULTILINE)

    # Remove command/environment definitions
    text = _drop_command_defs(text)

    # Remove color commands (keep inner text of \textcolor)
    text = re.sub(r"\\definecolor\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\textcolor\{[^}]*\}\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\colorbox\{[^}]*\}\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\fcolorbox\{[^}]*\}\{[^}]*\}\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\color\{[^}]*\}", "", text)

    # Remove \hypersetup, tikz, pgfplots
    for cmd in ("hypersetup", "tikz", "usetikzlibrary", "pgfplotsset", "tikzset"):
        text = _drop_braced_command(text, cmd)
    # Remove \tikzstyle{name}=[...] definitions
    text = re.sub(r"\\tikzstyle\{[^}]*\}\s*=\s*\[[^\]]*\]", "", text, flags=re.DOTALL)

    # Remove acknowledgements section (greedy to end of section or document)
    # Match sections whose title CONTAINS "Acknowledg" anywhere (handles compound titles)
    text = re.sub(
        r"\\(?:sub)*section\*?\{[^}]*Acknowledg(?:e?ments?)[^}]*\}.*?(?=\\section[^a-zA-Z]|\\appendix\b|\Z)",
        "", text, flags=re.DOTALL | re.IGNORECASE,
    )
    text = re.sub(r"\\begin\{acks\}.*?\\end\{acks\}", "", text, flags=re.DOTALL)
    # Also catch "Acknowledgments" as a paragraph header
    text = re.sub(
        r"\\paragraph\*?\{[^}]*Acknowledg(?:e?ments?)[^}]*\}.*?(?=\\(?:sub)*section|\\paragraph|\Z)",
        "", text, flags=re.DOTALL | re.IGNORECASE,
    )

    # Remove appendix
    text = re.sub(r"\\appendix\b.*", "", text, flags=re.DOTALL)
    text = re.sub(
        r"\\section\*?\{Appendix(?:es)?\}.*",
        "", text, flags=re.DOTALL | re.IGNORECASE,
    )

    # Remove author/affiliation metadata from body
    for cmd in ("icmlauthor", "icmltitle", "icmltitlerunning",
                "icmlaffiliation", "icmlcorrespondingauthor",
                "affiliation", "correspondingauthor", "altaffiliation",
                "shorttitle", "shortauthors", "orcidlink", "orcid",
                "email", "thanks", "keywords"):
        text = _drop_braced_command(text, cmd)
    text = _drop_braced_command(text, "author")
    text = _drop_braced_command(text, "title")

    # Strip \twocolumn[...] optional args
    text = _strip_twocolumn(text)

    # Remove figure, table, bibliography environments entirely
    text = re.sub(
        r"\\begin\{(figure|table|longtable|icmlauthorlist|thebibliography)[*]?\}.*?\\end\{\1[*]?\}",
        "", text, flags=re.DOTALL,
    )
    # Also strip from first \bibitem onward
    text = re.sub(r"\\bibitem\{[^}]*\}.*", "", text, flags=re.DOTALL)

    # Remove display math environments (equations, align, etc.)
    text = re.sub(
        r"\\begin\{(equation\*?|align\*?|eqnarray\*?|multline\*?|gather\*?|"
        r"aligned|split|subequations|dcases|cases)\}.*?\\end\{\1\}",
        "", text, flags=re.DOTALL,
    )

    # Remove \includegraphics commands (with optional args like [width=0.29])
    text = re.sub(r"\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}", "", text)
    # Also strip bare \includegraphics with just optional args and no braces
    text = re.sub(r"\\includegraphics(?:\[[^\]]*\])?", "", text)

    # Remove \centering, \caption, \captionsetup (keep caption text but we'll lose it with figures)
    text = re.sub(r"\\centering\b", "", text)
    text = _drop_braced_command(text, "caption")
    text = _drop_braced_command(text, "captionof")
    text = _drop_braced_command(text, "captionsetup")

    # Remove \wrapfigure, wraptable, minipage with figure content
    text = re.sub(r"\\begin\{(wrapfigure|wraptable)\}.*?\\end\{\1\}", "", text, flags=re.DOTALL)
    # Remove minipage environments that contain \includegraphics (figure content)
    text = re.sub(r"\\begin\{minipage\}.*?\\end\{minipage\}", "", text, flags=re.DOTALL)
    # Remove tikzpicture, forest, pgfpicture environments
    text = re.sub(r"\\begin\{(tikzpicture|forest|pgfpicture)\}.*?\\end\{\1\}", "", text, flags=re.DOTALL)
    # Remove algorithm environments (pseudocode)
    text = re.sub(r"\\begin\{(algorithm|algorithmic|algorithmicx|algorithm2e)\}.*?\\end\{\1\}", "", text, flags=re.DOTALL)
    # Remove lstlisting environments (code blocks)
    text = re.sub(r"\\begin\{(lstlisting|verbatim|minted|Verbatim)\}.*?\\end\{\1\}", "", text, flags=re.DOTALL)
    # Remove tikz style definitions that leak (my-box=[ ... ])
    text = re.sub(r"[a-z-]+=\[\s*(?:rectangle|draw|rounded|minimum|fill|text|align|inner|line|font)[^\]]*\]", "", text)

    # Remove footnotes and marginpars
    text = _drop_braced_command(text, "footnote")
    text = _drop_braced_command(text, "footnotetext")
    text = _drop_braced_command(text, "marginpar")

    # Remove layout/navigation commands
    text = re.sub(r"\\label\{[^}]*\}", "", text)
    text = re.sub(
        r"\\(maketitle|tableofcontents|printbibliography|bibliographystyle|"
        r"bibliography|listoffigures|listoftables|newpage|clearpage|"
        r"cleardoublepage|vspace|hspace|vfill|hfill|noindent|medskip|"
        r"bigskip|smallskip|hypertarget|tightlist|pagestyle|"
        r"thispagestyle|fancyhf|lfoot|rfoot|lhead|rhead|cfoot|chead|"
        r"printindex|glsaddall|printglossary|"
        r"itemsep|parsep|topsep|partopsep|labelsep|leftmargin|"
        r"setlength|setcounter|addtocounter|"
        r"icmlsetsymbol|icmlkeywords|printAffiliationsAndNotice|"
        r"DeclareSectionCommand|RedeclareSectionCommand|"
        r"columnwidth|textwidth|linewidth)[^\n]*\n?",
        "", text,
    )
    # Remove table-of-contents and list-of-figures update commands
    # (e.g. \addtocontents{toc}{...} — first arg "toc"/"lof" would otherwise leak)
    text = re.sub(r"\\addtocontents\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\addcontentsline\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\contentsline\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", text)

    return text


# ---------------------------------------------------------------------------
# Structure → spoken markers
# ---------------------------------------------------------------------------

_ORDINALS = [
    "", "First", "Second", "Third", "Fourth", "Fifth",
    "Sixth", "Seventh", "Eighth", "Ninth", "Tenth",
]


def _ordinal(n: int) -> str:
    if 1 <= n < len(_ORDINALS):
        return _ORDINALS[n]
    return f"{n}th"


def _convert_structure_to_speech(text: str) -> str:
    """Convert LaTeX structural commands into natural spoken text.

    Unlike the old parser which uses intermediate marker tokens, we
    directly produce the spoken output in a single pass.
    """
    # Abstract — handle both environment form and command form
    text = re.sub(r"\\begin\{abstract\}", "\n\nAbstract.\n\n", text)
    text = re.sub(r"\\end\{abstract\}", "\n\n", text)
    # \abstract{content} command form (used in NeurIPS/ICML/ICLR preamble templates
    # and in papers that \input the abstract from a separate file)
    # Replace \abstract{ with "Abstract.\n\n" and let the closing brace be handled
    # by the catch-all brace stripper downstream
    text = re.sub(r"\\abstract\s*\{", "\n\nAbstract.\n\n", text)

    # Sections — produce spoken section headers
    text = re.sub(r"\\section\*?\{([^}]+)\}", r"\n\n\1.\n\n", text)
    text = re.sub(r"\\subsection\*?\{([^}]+)\}", r"\n\n\1.\n\n", text)
    text = re.sub(r"\\subsubsection\*?\{([^}]+)\}", r"\n\n\1.\n\n", text)
    text = re.sub(r"\\paragraph\*?\{([^}]+)\}", r"\n\n\1.\n\n", text)

    # Example environments
    text = re.sub(r"\\begin\{example\}", "\n\nFor example:\n", text)
    text = re.sub(r"\\end\{example\}", "\n\n", text)

    # Convert enumerate/itemize to spoken lists
    text = _convert_lists(text)

    # Strip remaining environment tags but keep body
    text = re.sub(r"\\begin\{[^}]+\}(\[[^\]]*\])?", "", text)
    text = re.sub(r"\\end\{[^}]+\}", "", text)

    return text


def _convert_lists(text: str) -> str:
    """Convert enumerate/itemize environments to spoken text.

    Processes nested lists by tracking depth and type.
    """
    result = []
    enum_counters: list[int] = []  # stack of counters for nested enumerates
    in_list_type: list[str] = []   # stack: "enum" or "item"

    lines = text.split("\n")
    for line in lines:
        stripped = line.strip()

        # Check for enumerate start
        if re.match(r"\\begin\{(enumerate|compactenum)\}", stripped):
            enum_counters.append(0)
            in_list_type.append("enum")
            continue
        if re.match(r"\\end\{(enumerate|compactenum)\}", stripped):
            if enum_counters:
                enum_counters.pop()
            if in_list_type:
                in_list_type.pop()
            result.append("")
            continue

        # Check for itemize start
        if re.match(r"\\begin\{(itemize|compactitem|inparaenum)\}", stripped):
            in_list_type.append("item")
            continue
        if re.match(r"\\end\{(itemize|compactitem|inparaenum)\}", stripped):
            if in_list_type:
                in_list_type.pop()
            result.append("")
            continue

        # Handle \item
        item_m = re.match(r"\\item\s*(?:\[[^\]]*\])?\s*(.*)", stripped)
        if item_m:
            content = item_m.group(1)
            if in_list_type and in_list_type[-1] == "enum" and enum_counters:
                enum_counters[-1] += 1
                result.append(f"{_ordinal(enum_counters[-1])}, {content}")
            else:
                result.append(content)
            continue

        result.append(line)

    return "\n".join(result)


# ---------------------------------------------------------------------------
# Paragraph normalization
# ---------------------------------------------------------------------------

def _normalize_paragraphs(text: str) -> str:
    """Join within-paragraph lines while preserving paragraph breaks.

    In LaTeX, a single newline is just whitespace (line wrapping), while
    a blank line (double newline) is a paragraph break.  After structural
    conversion, we have \n\n for paragraph/section breaks and \n for
    in-paragraph line breaks.  This collapses each paragraph into a single
    line so that downstream steps don't accidentally merge paragraphs.
    """
    paragraphs = re.split(r"\n{2,}", text)
    joined = []
    for para in paragraphs:
        # Replace single newlines within the paragraph with spaces
        para = re.sub(r"\n", " ", para)
        # Collapse any resulting multiple spaces
        para = re.sub(r" {2,}", " ", para)
        joined.append(para.strip())
    return "\n\n".join(p for p in joined if p)


# ---------------------------------------------------------------------------
# Citation stripping
# ---------------------------------------------------------------------------

def _strip_citations(text: str) -> str:
    """Remove all citation commands and clean up orphaned punctuation.

    Handles: \\cite, \\citep, \\citet, \\citeauthor, etc.
    Also handles optional args: \\citep[e.g.][]{keys}
    """
    # Remove all \cite variants with optional args
    text = re.sub(r"\\cite[a-z]*(?:\[[^\]]*\])*\{[^}]*\}", "", text)

    # Remove cross-references but KEEP figure/section/table references text
    # \\ref{fig:1} → "" but "Figure \\ref{fig:1}" → "Figure 1" is ideal
    # Since we can't resolve refs, we remove the \ref command
    text = re.sub(r"\\(eqref|pageref)\{[^}]*\}", "", text)

    # For \ref, \autoref, \cref — these typically follow "Figure", "Section", etc.
    # We want to KEEP the reference word but remove the \ref command
    # "Figure~\\ref{fig:1}" → "Figure "
    # Also handle starred variants: \ref*, \cref*
    text = re.sub(r"\\(ref\*?|autoref|cref\*?|Cref\*?|vref)\{[^}]*\}", "", text)

    # \hyperref[label]{text} → text (keep the link text, drop the label)
    text = re.sub(r"\\hyperref\[[^\]]*\]\{([^}]*)\}", r"\1", text)

    # Remove URLs and hyperlinks (keep link text)
    text = re.sub(r"\\href\{[^}]*\}\{([^}]+)\}", r"\1", text)
    text = re.sub(r"\\url\{[^}]*\}", "", text)

    # Clean up orphaned reference text pointing to nothing
    # "Figure " or "Table " at end of sentence or before comma
    text = re.sub(r"\b(Figure|Fig\.|Table|Eq\.|Equation)\s*~?\s*(?=[,.\s]|$)", "", text, flags=re.MULTILINE)

    # Clean up parenthetical citation lists now empty except for "e.g."/"i.e."
    # "(e.g. ; ; )" or "(e.g.)" → "" — the intro phrase is meaningless without citations
    text = re.sub(r"\(\s*(?:e\.g\.|i\.e\.)\s*[;,\s]*\)", "", text)

    # Clean up orphaned "by, etc." / "by, and others" after stripped \cite chains
    # "inspired by, etc." → "inspired by others"
    text = re.sub(r"\bby\s*,\s*etc\.", "by others", text)
    # "inspired by, and others" → "inspired by others"
    text = re.sub(r"\bby\s*,\s*and others", "by others", text)
    # Standalone orphaned ", etc." preceded by space (after cite removal) → ""
    text = re.sub(r"\s*,\s*etc\.\s*(?=[.,;:!?\s]|$)", " ", text)

    # Clean up empty parentheses/brackets left by dropped citations
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\[\s*\]", "", text)

    # Clean up doubled punctuation from citation removal: "text. ." → "text."
    text = re.sub(r"([.!?])\s*\.\s", r"\1 ", text)

    # Clean up spaces before punctuation left by removals
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)

    # Clean up "text ," or "text  " double spaces (preserve newlines)
    text = re.sub(r"[^\S\n]+", " ", text)

    # Clean up trailing space before period/comma from stripped citations
    # "text ." → "text."
    text = re.sub(r" +([.,;:!?])", r"\1", text)

    return text


# ---------------------------------------------------------------------------
# Math handling
# ---------------------------------------------------------------------------

def _convert_greek_letters(text: str) -> str:
    """Convert Greek letter commands to English names early in the pipeline.

    This runs before math handling so that Greek letters inside inline
    math ($\Phi$, $\alpha$) get properly spoken.
    """
    for cmd, name in GREEK_TO_ENGLISH.items():
        text = re.sub(re.escape(cmd) + r"(?![a-zA-Z])", f" {name} ", text)
    return text


def _handle_math(text: str) -> str:
    """Convert math expressions to spoken form or remove them.

    Strategy:
    - Display math (\\[...\\], $$...$$): Remove entirely (too complex to speak)
    - Inline math ($...$): Attempt to convert to spoken form
    - Superscripts/subscripts: Remove notation artifacts
    """
    # Convert LaTeX escaped dollar signs to "dollar" BEFORE inline math regex.
    # In LaTeX, \$ is a literal currency dollar sign (e.g. \$137 for USD 137).
    # If not pre-converted, \$...\$ spans are incorrectly treated as math delimiters,
    # causing hyphens within the span to become "minus" and large spans to be deleted.
    text = text.replace("\\$", "dollar ")

    # Remove display math
    text = re.sub(r"\\\[.*?\\\]", "", text, flags=re.DOTALL)
    text = re.sub(r"\$\$.*?\$\$", "", text, flags=re.DOTALL)

    # Convert inline math to spoken form
    text = re.sub(r"\$([^$]+)\$", lambda m: inline_math_to_speech(m.group(1)), text)

    # Remove leftover superscript/subscript with braces
    text = re.sub(r"[\^_]\{[^}]*\}", "", text)
    # Remove bare ^/_ followed by a single non-word-boundary char
    text = re.sub(r"[\^_](?=[a-zA-Z0-9*])(?!\w{2})", "", text)

    # Clean up remaining _ artifacts from Greek-expanded subscripts.
    # _convert_greek_letters adds spaces: \pi_\theta -> "$ pi _ theta $"
    # _convert_subscripts only handles "_X" (no space) and "_{...}" (braced),
    # so "_ theta" (underscore + space + word) is left unhandled.
    text = re.sub(r"(\w)[ ]*_[ ]+(\w)", r"\1 sub \2", text)  # "pi _ theta" -> "pi sub theta"
    text = re.sub(r"(?<![.\w])_[ ]+(\w)", r"sub \1", text)   # leading "_ theta" -> "sub theta"

    return text


# ---------------------------------------------------------------------------
# Formatting tag stripping
# ---------------------------------------------------------------------------

def _strip_formatting_tags(text: str) -> str:
    """Strip formatting commands but preserve the text they wrap.

    Handles arbitrarily nested tags by repeatedly applying the pattern.
    """
    # Inline formatting — strip command, keep inner content
    # We do multiple passes to handle nesting like \textbf{\emph{text}}
    formatting_cmds = (
        "textbf", "emph", "textit", "texttt", "text", "textrm", "textsf",
        "textsc", "textsl", "textup", "textnormal",
        "mathbf", "mathit", "mathrm", "mathsf", "mathtt", "mathcal",
        "boldsymbol", "bm",
        "highlight", "newterm", "term", "ul", "st",
        "underline", "overline",
    )

    for _ in range(3):  # multiple passes for nested formatting
        for cmd in formatting_cmds:
            text = re.sub(rf"\\{cmd}\{{([^}}]*)\}}", r"\1", text)

    # Remove \mbox, \hbox, \vbox — keep content
    for cmd in ("mbox", "hbox", "vbox", "fbox", "makebox", "framebox", "parbox"):
        text = re.sub(rf"\\{cmd}(?:\[[^\]]*\])?\{{([^}}]*)\}}", r"\1", text)

    return text


# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

def _normalize_text(text: str) -> str:
    """Final text normalization for TTS readability."""

    # Convert LaTeX accents to Unicode
    text = latex_accents_to_unicode(text)

    # Common abbreviations → spoken form
    text = re.sub(r"e\.g\.~?", "for example, ", text)
    text = re.sub(r"i\.e\.~?", "that is, ", text)
    text = re.sub(r"cf\.~?", "compare ", text)
    text = re.sub(r"et al\.(?!\.)", "et al.", text)  # keep et al. as is (TTS reads it fine)
    text = re.sub(r"w\.r\.t\.~?", "with respect to ", text)
    text = re.sub(r"w\.l\.o\.g\.~?", "without loss of generality, ", text)

    # LaTeX punctuation
    text = re.sub(r"\\ldots\{?\}?", "...", text)
    text = text.replace("---", ", ")
    text = text.replace("--", " to ")
    text = text.replace("``", '"').replace("''", '"').replace("`", "'")
    text = text.replace("~", " ")
    text = text.replace("\\ ", " ")
    text = text.replace("\\\\", " ")
    text = text.replace("\\_", " ")
    text = text.replace("\\#", "")
    text = re.sub(r"\\&", " and ", text)
    text = text.replace("\\%", " percent")
    # LaTeX spacing micro-commands that contain no printable content
    text = re.sub(r"\\[!,;:]", "", text)  # \! \, \; \: — negative/thin/thick math spaces

    # ORCID identifiers
    text = re.sub(r"\\orcid\{[^}]*\}", "", text)
    text = re.sub(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]", "", text)

    # Strip any remaining LaTeX commands — keep braced content
    text = re.sub(r"\\[a-zA-Z]+\*?\{([^}]*)\}", r"\1", text)
    # Strip remaining bare commands
    text = re.sub(r"\\[a-zA-Z]+\*?", " ", text)
    # Strip bare braces
    text = re.sub(r"[{}]", "", text)
    # Strip known LaTeX optional-arg artifacts (targeted, not catch-all,
    # so prose brackets like [precautionarily] are preserved)
    text = re.sub(r"\[[htbpH!]+\]", "", text)             # float placement: [htbp], [!t], [H]
    text = re.sub(r"\[\d+(?:[,;\s]*\d+)*\]", "", text)    # numeric markers: [1], [2,3]
    text = re.sub(r"\[[lcr|p]+\]", "", text)               # column specs: [c], [l|r]
    # Strip stray backslashes
    text = text.replace("\\", "")
    # Strip dollar signs
    text = text.replace("$", "")

    # Clean up orphaned reference phrases pointing at nothing
    # "as shown in." → "as shown."
    text = re.sub(r"\b(shown|depicted|illustrated|described|defined|discussed|presented|listed|given|reported|displayed|summarized|outlined)\s+in\s*([.,;)])", r"\1\2", text)
    # "As shown, the model..." where the figure was stripped — drop the dangling opener
    text = re.sub(r"\b[Aa]s (shown|depicted|illustrated|detailed),\s+", "", text)
    text = re.sub(r"\bsee\s*\.", ".", text)
    text = re.sub(r"\(see\s*\)", "", text)
    text = re.sub(r"such as\s*\.", ".", text)

    # Clean up orphaned sentence-opening verbs left by stripped figure/table references.
    # Pattern: "\n\nIllustrates the..." (sentence starts with a bare verb that was preceded by
    # a stripped \ref{...} or \cref{...}).  We drop the entire fragment to end of sentence.
    # We only do this at paragraph starts (after a blank line) to avoid false positives.
    text = re.sub(
        r"(?<=\n\n)(illustrates|provides|shows|depicts|visualizes|demonstrates|presents|"
        r"summarizes|outlines|describes|compares|lists|plots|displays|reports|contains|"
        r"gives|details)[^.!?]*[.!?]?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    # "(for example, )" or "(for example, ; )" — dangling intro after citation removal
    text = re.sub(r"\(\s*for example,[\s;,]*\)", "", text)
    text = re.sub(r"\(\s*that is,[\s;,]*\)", "", text)
    # "in , reducing" → ", reducing"  (dangling "in" before comma/period after citation removal)
    # Use lookbehind for space/start-of-line to avoid eating compound words like "zoom-in,"
    text = re.sub(r"(?<=\s)in\s*,", ",", text)
    text = re.sub(r"(?<=\s)in\s*\.", ".", text)
    # "at ." → "."
    text = re.sub(r"\bat\s+\.", ".", text)
    # "from ." → "."
    text = re.sub(r"\bfrom\s+\.", ".", text)

    # Dangling "in/see Section" with no number → replace with readable phrase
    # Use varied phrasing to avoid repetition when a paper has many cross-references
    _in_section_phrases = [
        "in a later section", "as discussed below", "later in this paper",
        "as we will see", "in a subsequent section",
    ]
    _see_section_phrases = [
        "see a later section", "see below", "see later in this paper",
        "as we will see", "see a subsequent section",
    ]
    _section_counter = [0]  # mutable counter for cycling

    def _varied_section_ref(match: re.Match) -> str:
        prefix = match.group(1).lower()
        phrases = _see_section_phrases if prefix == "see" else _in_section_phrases
        phrase = phrases[_section_counter[0] % len(phrases)]
        _section_counter[0] += 1
        return phrase

    text = re.sub(r"\b(in|see)\s+Section[s]?\s*(?=[.,;:)])", _varied_section_ref, text, flags=re.IGNORECASE)

    # "Figure" / "Table" etc. with no number following → remove
    text = re.sub(r"\b(Figure|Fig\.|Table|Section|Eq\.|Equation)\s*(?=[,.\s;:)]|$)", "", text, flags=re.MULTILINE)

    # Clean up parenthetical phrases now empty after ref stripping
    # "(see )" or "(see also )" or "(cf. )" → ""
    text = re.sub(r"\(\s*(?:see\s+(?:also\s+)?|cf\.\s*)\)", "", text)

    # Clean up doubled punctuation (but preserve ellipsis — three or more consecutive dots)
    text = re.sub(r"([!?])\.", r"\1", text)          # !. -> !  and ?. -> ?
    text = re.sub(r"(?<!\.)\.\.(?!\.)", ".", text)   # ".." not part of "..." -> "."
    text = re.sub(r",\s*,", ",", text)
    text = re.sub(r"\(\s*,", "(", text)
    text = re.sub(r",\s*\)", ")", text)
    text = re.sub(r"\(\s*\)", "", text)

    # Clean up stray whitespace artifacts
    text = re.sub(r" +", " ", text)

    return text


# ---------------------------------------------------------------------------
# Brace-aware helpers
# ---------------------------------------------------------------------------

def _skip_braced_group(text: str, pos: int) -> int:
    """Advance past a {...} group starting at pos."""
    if pos >= len(text) or text[pos] != "{":
        return pos
    depth = 1
    i = pos + 1
    while i < len(text) and depth:
        depth += (text[i] == "{") - (text[i] == "}")
        i += 1
    return i


def _extract_braced_arg(text: str, pos: int) -> str:
    """Extract the content of a {...} group starting at pos, handling nesting."""
    if pos >= len(text) or text[pos] != "{":
        return ""
    end = _skip_braced_group(text, pos)
    return text[pos + 1:end - 1]


def _skip_bracketed_group(text: str, pos: int) -> int:
    """Advance past an optional [...] group starting at pos."""
    if pos >= len(text) or text[pos] != "[":
        return pos
    depth = 1
    i = pos + 1
    while i < len(text) and depth:
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
        i += 1
    return i


def _drop_braced_command(text: str, command: str) -> str:
    """Remove all \\command{...} from text, handling nested braces."""
    result = []
    i = 0
    needle = "\\" + command
    while i < len(text):
        if text[i:i + len(needle)] == needle and (
            i + len(needle) >= len(text) or not text[i + len(needle)].isalpha()
        ):
            i += len(needle)
            # skip optional [...] then required {...}
            while i < len(text) and text[i] in " \t\n":
                i += 1
            i = _skip_bracketed_group(text, i)
            i = _skip_braced_group(text, i)
        else:
            result.append(text[i])
            i += 1
    return "".join(result)


def _drop_command_defs(text: str) -> str:
    """Remove \\newcommand, \\renewcommand, \\def definitions."""
    result = []
    i = 0
    prefixes = ("\\newcommand", "\\renewcommand",
                "\\newenvironment", "\\renewenvironment",
                "\\providecommand", "\\DeclareRobustCommand",
                "\\DeclareMathOperator",
                "\\newcolumntype")
    while i < len(text):
        matched = False
        for pfx in prefixes:
            if text[i:i + len(pfx)] == pfx and (
                i + len(pfx) >= len(text) or not text[i + len(pfx)].isalpha()
            ):
                i += len(pfx)
                if i < len(text) and text[i] == "*":
                    i += 1
                i = _skip_braced_group(text, i)
                i = _skip_bracketed_group(text, i)
                i = _skip_bracketed_group(text, i)
                i = _skip_braced_group(text, i)
                i = _skip_braced_group(text, i)
                matched = True
                break
        if not matched:
            if text[i:i + 4] == "\\def" and (
                i + 4 < len(text) and not text[i + 4].isalpha()
            ):
                i += 4
                if i < len(text) and text[i] == "\\":
                    i += 1
                    while i < len(text) and text[i].isalpha():
                        i += 1
                while i < len(text) and text[i] not in "{\n":
                    i += 1
                i = _skip_braced_group(text, i)
            else:
                result.append(text[i])
                i += 1
    return "".join(result)


def _strip_twocolumn(text: str) -> str:
    """Strip \\twocolumn[...] optional args but keep body text."""
    result = []
    i = 0
    while i < len(text):
        needle = "\\twocolumn"
        if text[i:i + len(needle)] == needle:
            i += len(needle)
            while i < len(text) and text[i] in " \t\n":
                i += 1
            i = _skip_bracketed_group(text, i)
        else:
            result.append(text[i])
            i += 1
    return "".join(result)


def _extract_cmd_arg(text: str, command: str) -> Optional[str]:
    """Extract the brace-balanced argument of \\command{...}.

    Matches \\command exactly (not \\commandfoo), and tries all occurrences
    in order, returning the first one that has a valid braced argument.
    """
    needle = f"\\{command}"
    search_start = 0
    while True:
        pos = text.find(needle, search_start)
        if pos == -1:
            return None
        # Ensure exact command match (not \titlebox when looking for \title)
        end_cmd = pos + len(needle)
        if end_cmd < len(text) and text[end_cmd].isalpha():
            search_start = end_cmd
            continue
        i = end_cmd
        while i < len(text) and text[i] in " \t\n":
            i += 1
        if i < len(text) and text[i] == "[":
            i = _skip_bracketed_group(text, i)
            while i < len(text) and text[i] in " \t\n":
                i += 1
        if i >= len(text) or text[i] != "{":
            search_start = end_cmd
            continue
        start = i + 1
        end = _skip_braced_group(text, i)
        return text[start:end - 1]


def _strip_inline_latex(text: str) -> str:
    """Remove LaTeX markup from short inline strings (title, author, etc.)."""
    text = re.sub(r"%.*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\$[^$]*\$", "", text)
    text = re.sub(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]", "", text)
    text = re.sub(r"\\text[a-zA-Z]+\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\emph\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\[a-zA-Z]+\{[^}]*\}", "", text)
    text = re.sub(r"\\[a-zA-Z]+", "", text)
    text = latex_accents_to_unicode(text)
    text = text.replace("``", '"').replace("''", '"').replace("`", "'")
    text = text.replace("\\ ", " ")
    text = re.sub(r"[{}\\]", "", text)
    text = re.sub(r"[$^_]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
