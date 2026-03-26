"""
Shared source download and parsing utilities for both free and premium narration.

Centralizes the duplicated logic for:
- HTTP download with retry
- Source file saving
- PDF vs LaTeX source detection and routing
- regex_scripter invocation
- Raw source text extraction for LLM context
"""

import os
import tarfile
import tempfile
from dataclasses import dataclass, field


@dataclass
class ParseResult:
    """Result of downloading and parsing an arXiv paper source."""

    speech_text: str
    """Parser-generated speech text (with version tag)."""

    source_path: str | None = None
    """Path to the primary source file (LaTeX tar.gz or PDF)."""

    latex_path: str | None = None
    """Path to the LaTeX source archive, if available."""

    pdf_path: str | None = None
    """Path to the PDF file, if available."""

    raw_source_text: str | None = None
    """Raw source text (LaTeX or PDF) for LLM context. Up to 200K chars."""

    figures_dir: str | None = None
    """Directory containing extracted figure image files (PNG, JPG, PDF, EPS, etc.)
    from the LaTeX source archive. Used for multimodal LLM figure descriptions."""

    extracted_title: str = ""
    """Title extracted from the source (LaTeX \\title{} or PDF first line).
    Used as fallback when paper_title is not passed by the caller."""

    work_dir: str = ""
    """Temporary working directory (caller should clean up)."""

    # ── Source stats for cost estimation ─────────────────────────────────────
    tar_bytes: int = 0
    """Compressed size of the downloaded LaTeX archive in bytes."""

    latex_char_count: int = 0
    """Total character count across all .tex files in the archive.
    Used as a proxy for LLM text-input token count (≈ chars / 4)."""

    figure_count: int = 0
    """Number of image files (PNG, JPG, PDF, EPS, SVG, etc.) in the archive.
    Used to estimate image-input tokens for multimodal LLM calls."""


def _safe_extractall(tf: tarfile.TarFile, path: str) -> None:
    """Extract tar archive with path traversal protection (zip slip fix)."""
    real_path = os.path.realpath(path)
    for member in tf.getmembers():
        member_path = os.path.realpath(os.path.join(real_path, member.name))
        if not member_path.startswith(real_path + os.sep) and member_path != real_path:
            raise RuntimeError(f"Blocked path traversal attempt in archive: {member.name!r}")
    tf.extractall(path)


def _http_download(url: str) -> "httpx.Response":
    """Download a URL with unarXiv user-agent and timeout."""
    import httpx
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        r = client.get(url, headers={"User-Agent": "unarXiv/1.0"})
        r.raise_for_status()
        return r


def _save_to_dir(data: bytes, work_dir: str, filename: str) -> str:
    """Write source bytes to work_dir and return the path."""
    path = os.path.join(work_dir, filename)
    with open(path, "wb") as f:
        f.write(data)
    return path


def _extract_source_archive(latex_path: str, work_dir: str) -> str | None:
    """Extract a LaTeX tar archive into work_dir/src/ and return the directory path.

    Returns the extraction directory on success, None on failure.
    Idempotent: if already extracted, returns the existing directory.
    """
    extract_dir = os.path.join(work_dir, "src")
    if os.path.isdir(extract_dir):
        return extract_dir
    try:
        os.makedirs(extract_dir, exist_ok=True)
        with tarfile.open(latex_path, "r:*") as tf:
            _safe_extractall(tf, extract_dir)
        return extract_dir
    except Exception as e:
        print(f"Warning: could not extract LaTeX archive: {e}")
        return None


_FIGURE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".eps", ".svg"}


def _collect_source_stats(latex_path: str, work_dir: str) -> tuple[int, int, int]:
    """Return (tar_bytes, latex_char_count, figure_count) for a LaTeX archive.

    - tar_bytes: compressed archive size on disk
    - latex_char_count: sum of byte sizes of all .tex files (≈ char count for ASCII)
    - figure_count: number of image files in the archive
    """
    tar_bytes = os.path.getsize(latex_path)
    latex_char_count = 0
    figure_count = 0

    extract_dir = _extract_source_archive(latex_path, work_dir)
    if not extract_dir:
        return tar_bytes, 0, 0

    for root, _, files in os.walk(extract_dir):
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            fpath = os.path.join(root, fname)
            if ext == ".tex":
                try:
                    latex_char_count += os.path.getsize(fpath)
                except Exception:
                    pass
            elif ext in _FIGURE_EXTENSIONS:
                figure_count += 1

    return tar_bytes, latex_char_count, figure_count


def _tex_body_length(path: str) -> int:
    """Return char count of the body between \\begin{document} and \\end{document}.

    Strips comments and whitespace to measure real content. Returns 0 if the
    file can't be read or has no document body.
    """
    import re
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            src = fh.read()
    except Exception:
        return 0
    m = re.search(r'\\begin\{document\}(.*?)\\end\{document\}', src, re.DOTALL)
    if not m:
        return 0
    body = re.sub(r'%[^\n]*', '', m.group(1))  # strip comments
    return len(body.strip())


def _find_main_tex(extract_dir: str) -> str | None:
    """Find the main .tex file in a LaTeX archive (the one with \\documentclass).

    Among candidates with \\documentclass, picks the one with the most body
    content (chars between \\begin{document} and \\end{document}) to avoid
    selecting empty stubs like a bare main.tex that shadows the real paper.
    """
    import re
    candidates: list[str] = []
    for root, _, files in os.walk(extract_dir):
        for fname in sorted(files):
            if fname.endswith(".tex"):
                candidates.append(os.path.join(root, fname))

    def _score_candidates(paths: list[str]) -> str | None:
        """Return the best \\documentclass file from paths, by body length."""
        scored = []
        for path in paths:
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    head = fh.read(4096)
            except Exception:
                continue
            if re.search(r'\\documentclass', head):
                scored.append((path, _tex_body_length(path)))
        if not scored:
            return None
        scored.sort(key=lambda t: t[1], reverse=True)
        return scored[0][0]

    # Prefer root-level files
    root_files = [p for p in candidates if os.path.dirname(p) == extract_dir]
    best = _score_candidates(root_files)
    if best:
        return best

    # Fall back to subdirectory files
    sub_files = [p for p in candidates if p not in root_files]
    best = _score_candidates(sub_files)
    if best:
        return best

    # Last resort: return main.tex or first .tex file at root level
    for name in ("main.tex", "paper.tex", "manuscript.tex"):
        path = os.path.join(extract_dir, name)
        if os.path.isfile(path):
            return path
    return root_files[0] if root_files else (candidates[0] if candidates else None)


def _parse_input_paths(content: str, base_dir: str) -> list[str]:
    """Extract extra search directories from \\def\\input@path or \\makeatletter blocks."""
    import re
    extra: list[str] = []
    # Match \def\input@path{{dir1/}{dir2/}} or \input@path{{dir/}}
    for m in re.finditer(r'\\input@path\{(.+?)\}(?=\s|%|$)', content):
        for sub in re.findall(r'\{([^}]*)\}', m.group(1)):
            if sub:
                p = sub if os.path.isabs(sub) else os.path.join(base_dir, sub)
                if os.path.isdir(p):
                    extra.append(p)
    return extra


def _inline_latex_inputs(
    file_path: str,
    max_chars: int,
    _visited: set[str] | None = None,
    _extra_dirs: list[str] | None = None,
) -> str:
    """Recursively inline \\input{} and \\include{} commands in a LaTeX file.

    Replaces each \\input{filename} command with the actual content of the
    referenced file, recursing into nested includes. This produces a single
    complete LaTeX document in the correct logical order.

    Respects \\def\\input@path{{dir/}} for papers that store content in
    subdirectories (e.g. content/sec/1_intro.tex referenced as sec/1_intro).
    """
    import re

    if _visited is None:
        _visited = set()

    real_path = os.path.realpath(file_path)
    if real_path in _visited:
        return ""  # Cycle guard
    _visited.add(real_path)

    try:
        with open(file_path, encoding="utf-8", errors="replace") as fh:
            content = fh.read(max_chars)
    except Exception:
        return ""

    base_dir = os.path.dirname(file_path)

    # On first call, parse \input@path from the document for extra search dirs
    if _extra_dirs is None:
        _extra_dirs = _parse_input_paths(content, base_dir)

    search_dirs = [base_dir] + _extra_dirs

    # Replace \input{filename} and \include{filename} with inlined content.
    # Handles optional .tex extension in the argument.
    input_pattern = re.compile(
        r'\\(?:input|include)\{([^}]+)\}',
        re.MULTILINE,
    )

    parts: list[str] = []
    last_end = 0
    total_chars = 0

    for m in input_pattern.finditer(content):
        before = content[last_end:m.start()]
        parts.append(before)
        total_chars += len(before)
        last_end = m.end()

        if total_chars >= max_chars:
            break

        ref = m.group(1).strip()
        # Try the path as-is, then with .tex appended
        suffixes = [ref]
        if not ref.endswith(".tex"):
            suffixes.append(ref + ".tex")

        inlined = ""
        for d in search_dirs:
            for cand in suffixes:
                full = cand if os.path.isabs(cand) else os.path.join(d, cand)
                if os.path.isfile(full):
                    remaining = max_chars - total_chars
                    inlined = _inline_latex_inputs(full, remaining, _visited, _extra_dirs)
                    break
            if inlined:
                break

        parts.append(inlined)
        total_chars += len(inlined)

    if total_chars < max_chars:
        parts.append(content[last_end:])

    return "".join(parts)[:max_chars]


def _extract_raw_latex_text(latex_path: str, work_dir: str, max_chars: int = 200_000) -> str | None:
    """Extract raw .tex content from a LaTeX tar archive for LLM context.

    Finds the main .tex file (the one with \\documentclass), then recursively
    resolves \\input{} and \\include{} commands to produce a single inlined
    document in logical order. This avoids the broken alphabetical concatenation
    which (a) caused \\end{document} from main.tex to truncate all content files,
    and (b) gave the LLM a list of \\input{} stubs instead of actual paper text.
    """
    try:
        extract_dir = _extract_source_archive(latex_path, work_dir)
        if not extract_dir:
            return None

        main_tex = _find_main_tex(extract_dir)
        if not main_tex:
            return None

        print(f"[source] Main tex: {os.path.relpath(main_tex, extract_dir)}")
        result = _inline_latex_inputs(main_tex, max_chars)
        if result:
            print(f"[source] Inlined LaTeX: {len(result):,} chars")
        return result or None
    except Exception as e:
        print(f"Warning: could not extract LaTeX for LLM context: {e}")
        return None


def _extract_raw_pdf_text(pdf_path: str, max_chars: int = 200_000) -> str | None:
    """Extract raw text from a PDF for LLM context."""
    try:
        import fitz  # pymupdf
        doc = fitz.open(pdf_path)
        parts: list[str] = []
        total = 0
        for page in doc:
            text = page.get_text()
            parts.append(text)
            total += len(text)
            if total >= max_chars:
                break
        doc.close()
        text = "\n\n".join(parts) if parts else None
        if text:
            print(f"Using PDF text for LLM context: {len(text):,} chars")
        return text
    except Exception as e:
        print(f"Warning: could not extract PDF text for LLM context: {e}")
        return None


def download_and_parse(
    arxiv_id: str,
    tex_source_url: str,
    paper_title: str,
    paper_author: str,
    paper_date: str,
    source_priority: str = "latex",
    extract_raw_source: bool = False,
) -> ParseResult:
    """
    Download arXiv source, parse with regex_scripter, and return speech text.

    Args:
        arxiv_id: The arXiv paper ID.
        tex_source_url: URL for the LaTeX/source download.
        paper_title: Paper title for metadata.
        paper_author: Comma-separated author names.
        paper_date: Publication date string.
        source_priority: "latex" (default) or "pdf".
        extract_raw_source: If True, extract raw LaTeX/PDF text for LLM context.

    Returns:
        ParseResult with speech text and source paths.
    """
    import sys
    sys.path.insert(0, "/app")
    import tts_utils

    work_dir = tempfile.mkdtemp()
    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
    authors_list = [a.strip() for a in paper_author.split(",")] if paper_author else []

    latex_path: str | None = None
    pdf_local_path: str | None = None

    if source_priority == "pdf":
        # Download PDF first
        print(f"Source priority: PDF. Downloading {pdf_url}...")
        try:
            resp = _http_download(pdf_url)
            pdf_local_path = _save_to_dir(resp.content, work_dir, f"{arxiv_id}.pdf")
            print(f"Downloaded PDF: {len(resp.content):,} bytes")
        except Exception as e:
            print(f"PDF download failed ({e}), trying LaTeX fallback...")

        # Also try LaTeX as fallback
        try:
            resp = _http_download(tex_source_url)
            lp = _save_to_dir(resp.content, work_dir, f"{arxiv_id}.tar.gz")
            if tts_utils.is_pdf_file(lp):
                if not pdf_local_path:
                    pdf_local_path = lp
            else:
                latex_path = lp
        except Exception as e:
            print(f"LaTeX download failed ({e})")

        source_path = pdf_local_path or latex_path
        if source_path is None:
            raise RuntimeError("Both PDF and LaTeX downloads failed")
    else:
        # LaTeX-first (default)
        print(f"Source priority: LaTeX. Downloading {tex_source_url}...")
        resp = _http_download(tex_source_url)
        print(f"Downloaded {len(resp.content):,} bytes")
        lp = _save_to_dir(resp.content, work_dir, f"{arxiv_id}.tar.gz")

        if tts_utils.is_pdf_file(lp):
            print("Source is a PDF (no LaTeX available). Using PDF pipeline...")
            pdf_local_path = lp
        else:
            latex_path = lp
            # Also grab PDF as fallback for regex_scripter
            try:
                pdf_resp = _http_download(pdf_url)
                pdf_local_path = _save_to_dir(pdf_resp.content, work_dir, f"{arxiv_id}.pdf")
            except Exception:
                pass  # PDF fallback is optional

        source_path = latex_path or pdf_local_path

    # Collect source stats for cost estimation (always, when LaTeX available — cheap).
    tar_bytes = 0
    latex_char_count = 0
    figure_count = 0
    if latex_path:
        tar_bytes, latex_char_count, figure_count = _collect_source_stats(latex_path, work_dir)
        print(f"Source stats: {tar_bytes:,} tar bytes, {latex_char_count:,} latex chars, {figure_count} figures")

    # Extract raw source text for LLM context (premium only).
    # Also extract the source archive to expose figures_dir for multimodal LLM calls.
    raw_source_text: str | None = None
    figures_dir: str | None = None
    if extract_raw_source:
        if latex_path:
            raw_source_text = _extract_raw_latex_text(latex_path, work_dir)
            # figures_dir is the extracted archive directory — contains all image files
            figures_dir = os.path.join(work_dir, "src") if os.path.isdir(os.path.join(work_dir, "src")) else None
        if not raw_source_text and pdf_local_path:
            raw_source_text = _extract_raw_pdf_text(pdf_local_path)

    # Parse with regex_scripter
    from regex_scripter import generate_script
    speech = generate_script(
        source_path=source_path,
        source_priority=source_priority,
        fallback_title=paper_title,
        fallback_authors=authors_list,
        fallback_date=paper_date,
        pdf_path=pdf_local_path,
    )
    print(f"Regex scripter output: {len(speech):,} chars")

    # Extract title from the parser output (first line of the header)
    first_line = speech.split("\n", 1)[0].rstrip(".").strip() if speech else ""
    _extracted_title = first_line if first_line and first_line != "Untitled" else ""

    return ParseResult(
        speech_text=speech,
        source_path=source_path,
        latex_path=latex_path,
        pdf_path=pdf_local_path,
        raw_source_text=raw_source_text,
        figures_dir=figures_dir,
        extracted_title=_extracted_title,
        work_dir=work_dir,
        tar_bytes=tar_bytes,
        latex_char_count=latex_char_count,
        figure_count=figure_count,
    )
