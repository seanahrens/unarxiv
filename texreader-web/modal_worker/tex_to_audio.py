#!/usr/bin/env python3
"""
tex_to_audio.py — Convert LaTeX .tar archives to listenable MP3 audiobooks.

Used by the Modal serverless worker (narrate.py) to process arXiv papers.
Can also be run standalone for local testing.

USAGE:
  python tex_to_audio.py path/to/paper.tar
  python tex_to_audio.py path/to/paper.tar  -o out.mp3
  python tex_to_audio.py path/to/paper.tex

OUTPUT FILENAME:  LastName - Title - sourcestem.mp3

REQUIREMENTS:
  pip install edge-tts mutagen   # edge-tts = Microsoft TTS (no rate limiting)
  pip install pyttsx3            # optional offline fallback (uses system voices)
  brew install ffmpeg   # macOS  |  sudo apt install ffmpeg  # Linux
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import sys
import tarfile
import tempfile
import time
from typing import Optional


# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

#: Default edge-tts voice used when no voice is specified.
DEFAULT_VOICE = "en-US-JennyNeural"

#: Short alias keys → full edge-tts BCP-47 voice names.
VOICE_PRESETS: dict[str, str] = {
    "en":    "en-US-JennyNeural",
    "en-gb": "en-GB-RyanNeural",
    "en-au": "en-AU-NatashaNeural",
}

#: Maximum characters per TTS request chunk (keeps requests well inside API limits).
CHUNK_MAX_CHARS = 4_000

#: Courtesy pause (seconds) between papers in batch mode.
INTER_PAPER_PAUSE = 15


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

def extract_metadata(latex: str) -> tuple[str, str]:
    """Return ``(title, author)`` as plain, LaTeX-free strings.

    Combines ``\\title`` and ``\\subtitle`` (if present) into a single title
    string separated by ``": "``.  Falls back to ``'Untitled'`` /
    ``'Unknown Author'`` when the macros are absent.
    """
    title_m    = re.search(r'\\title\{(.*?)\}',    latex, re.DOTALL)
    subtitle_m = re.search(r'\\subtitle\{(.*?)\}', latex, re.DOTALL)
    author_m   = re.search(r'\\author\{(.*?)\}',   latex, re.DOTALL)

    raw_title  = title_m.group(1)  if title_m  else "Untitled"
    raw_author = author_m.group(1) if author_m else "Unknown Author"

    title = re.sub(r"\s+", " ", _strip_latex_commands(raw_title)).strip()
    if subtitle_m:
        subtitle = re.sub(r"\s+", " ", _strip_latex_commands(subtitle_m.group(1))).strip()
        if subtitle:
            title = f"{title}: {subtitle}"

    author = re.sub(r"\s+", " ", _strip_latex_commands(raw_author)).strip()
    return title, author


def _latex_accents_to_unicode(text: str) -> str:
    """Convert LaTeX accent commands to their Unicode equivalents.

    Handles both braced forms like \\'{e} and unbraced forms like \\'e.
    Also handles special character commands like \\aa, \\ae, \\ss, etc.
    """
    # Mapping of LaTeX accent command -> dict of (base char -> accented char)
    _ACCENT_MAP: dict[str, dict[str, str]] = {
        "'": {  # acute
            "a": "á", "e": "é", "i": "í", "o": "ó", "u": "ú", "y": "ý",
            "A": "Á", "E": "É", "I": "Í", "O": "Ó", "U": "Ú", "Y": "Ý",
            "c": "ć", "n": "ń", "s": "ś", "z": "ź", "C": "Ć", "N": "Ń",
            "S": "Ś", "Z": "Ź", "l": "ĺ", "L": "Ĺ", "r": "ŕ", "R": "Ŕ",
        },
        "`": {  # grave
            "a": "à", "e": "è", "i": "ì", "o": "ò", "u": "ù",
            "A": "À", "E": "È", "I": "Ì", "O": "Ò", "U": "Ù",
        },
        "^": {  # circumflex
            "a": "â", "e": "ê", "i": "î", "o": "ô", "u": "û",
            "A": "Â", "E": "Ê", "I": "Î", "O": "Ô", "U": "Û",
            "c": "ĉ", "g": "ĝ", "h": "ĥ", "j": "ĵ", "s": "ŝ", "w": "ŵ",
        },
        '"': {  # umlaut / diaeresis
            "a": "ä", "e": "ë", "i": "ï", "o": "ö", "u": "ü", "y": "ÿ",
            "A": "Ä", "E": "Ë", "I": "Ï", "O": "Ö", "U": "Ü", "Y": "Ÿ",
        },
        "~": {  # tilde
            "a": "ã", "n": "ñ", "o": "õ",
            "A": "Ã", "N": "Ñ", "O": "Õ",
        },
        "c": {  # cedilla
            "c": "ç", "C": "Ç", "s": "ş", "S": "Ş", "t": "ţ", "T": "Ţ",
        },
        "=": {  # macron
            "a": "ā", "e": "ē", "i": "ī", "o": "ō", "u": "ū",
            "A": "Ā", "E": "Ē", "I": "Ī", "O": "Ō", "U": "Ū",
        },
        "H": {  # double acute
            "o": "ő", "u": "ű", "O": "Ő", "U": "Ű",
        },
        ".": {  # dot above
            "z": "ż", "Z": "Ż", "c": "ċ", "g": "ġ", "I": "İ",
        },
        "d": {  # dot below
            "a": "ạ", "e": "ẹ", "i": "ị", "o": "ọ", "u": "ụ",
        },
        "r": {  # ring above
            "a": "å", "A": "Å", "u": "ů", "U": "Ů",
        },
        "u": {  # breve
            "a": "ă", "g": "ğ", "A": "Ă", "G": "Ğ", "u": "ŭ",
        },
        "v": {  # caron / háček
            "c": "č", "s": "š", "z": "ž", "r": "ř", "n": "ň", "e": "ě",
            "C": "Č", "S": "Š", "Z": "Ž", "R": "Ř", "N": "Ň", "E": "Ě",
            "d": "ď", "t": "ť", "D": "Ď", "T": "Ť",
        },
        "k": {  # ogonek
            "a": "ą", "e": "ę", "A": "Ą", "E": "Ę",
        },
    }

    # Special whole-word character commands (no base character needed)
    _SPECIAL_CHARS: dict[str, str] = {
        "aa": "å", "AA": "Å",
        "ae": "æ", "AE": "Æ",
        "oe": "œ", "OE": "Œ",
        "ss": "ß",
        "o": "ø", "O": "Ø",
        "l": "ł", "L": "Ł",
        "i": "ı",  # dotless i
        "j": "ȷ",  # dotless j
    }

    # 1. Handle special character commands: \aa, \ae, \ss, \o, \l, etc.
    #    Must match as whole words (word boundary or followed by non-alpha)
    for cmd, char in sorted(_SPECIAL_CHARS.items(), key=lambda x: -len(x[0])):
        # Braced form: \aa{} or \aa
        text = re.sub(rf"\\{cmd}\{{\}}", char, text)
        # Word-boundary form: \aa followed by space/non-alpha/end
        text = re.sub(rf"\\{cmd}(?=[^a-zA-Z]|$)", char, text)

    # 2. Handle accent commands with braces: \'{e}, \^{o}, \"{u}, \c{c}, etc.
    def _replace_braced(m: re.Match) -> str:
        cmd = m.group(1)
        base = m.group(2)
        if cmd in _ACCENT_MAP and base in _ACCENT_MAP[cmd]:
            return _ACCENT_MAP[cmd][base]
        return base  # unknown combo — just keep the base char

    # Symbol accents: \' \` \^ \" \~ \. \=
    text = re.sub(r"""\\(['\"`^~.=])\{(\w)\}""", _replace_braced, text)
    # Named accents: \c{c}, \v{s}, \H{o}, \d{a}, \r{a}, \u{a}, \k{a}
    text = re.sub(r"\\([cHdrukvk])\{(\w)\}", _replace_braced, text)

    # 3. Handle accent commands without braces: \'e, \^o, \"u, etc.
    def _replace_bare(m: re.Match) -> str:
        cmd = m.group(1)
        base = m.group(2)
        if cmd in _ACCENT_MAP and base in _ACCENT_MAP[cmd]:
            return _ACCENT_MAP[cmd][base]
        return base

    # Symbol accents bare: \'e, \`a, \^o, \"u, \~n, \.z, \=a
    text = re.sub(r"""\\(['\"`^~.=])(\w)""", _replace_bare, text)
    # Named accents bare: \cc, \vs (only single-char commands to avoid
    # false positives with real commands like \cite)
    text = re.sub(r"\\([cHdrukvk])(?=[a-zA-Z])(\w)", _replace_bare, text)

    return text


def _strip_latex_commands(text: str) -> str:
    """Remove LaTeX markup from a short inline string (title, author, etc.)."""
    text = re.sub(r"%.*$",                         "",    text, flags=re.MULTILINE)
    text = _latex_accents_to_unicode(text)
    text = re.sub(r"\\text[a-zA-Z]+\{([^}]*)\}",  r"\1", text)
    text = re.sub(r"\\emph\{([^}]*)\}",            r"\1", text)
    text = re.sub(r"\\[a-zA-Z]+\{[^}]*\}",         "",    text)
    text = re.sub(r"\\[a-zA-Z]+",                  "",    text)
    text = text.replace("``", '"').replace("''", '"').replace("`", "'")
    text = re.sub(r"[{}\\]",                        "",    text)
    return text.strip()


_MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def extract_full_metadata(
    latex: str, source_stem: str = "",
) -> dict[str, object]:
    """Extract title, date, and individual author names from LaTeX source.

    Returns ``{"title": str, "date": str, "authors": list[str]}``.
    """
    # --- title (reuse existing logic) ---
    title_m    = re.search(r'\\title\{(.*?)\}',    latex, re.DOTALL)
    subtitle_m = re.search(r'\\subtitle\{(.*?)\}', latex, re.DOTALL)
    raw_title  = title_m.group(1) if title_m else "Untitled"
    title = re.sub(r"\s+", " ", _strip_latex_commands(raw_title)).strip()
    if subtitle_m:
        subtitle = re.sub(r"\s+", " ", _strip_latex_commands(subtitle_m.group(1))).strip()
        if subtitle:
            title = f"{title}: {subtitle}"

    # Also handle \icmltitle
    if not title_m:
        icml_m = re.search(r"\\icmltitle\{(.*?)\}", latex, re.DOTALL)
        if icml_m:
            title = re.sub(r"\s+", " ", _strip_latex_commands(icml_m.group(1))).strip()

    # --- date (search preamble only to avoid false matches in body) ---
    date_str = ""
    preamble_end = latex.find(r"\begin{document}")
    preamble = latex[:preamble_end] if preamble_end != -1 else latex[:3000]
    date_m = re.search(r"\\date\{(.+?)\}", preamble, re.DOTALL)
    if date_m:
        raw_date = _strip_latex_commands(date_m.group(1)).strip()
        # Accept only if it looks like a real date (contains digit or month name)
        if raw_date and re.search(r"\d|january|february|march|april|may|june|july|august|september|october|november|december", raw_date, re.IGNORECASE):
            date_str = raw_date

    # Fallback: parse arXiv ID from source_stem (e.g. "arXiv-2411.09222v4")
    if not date_str and source_stem:
        arxiv_m = re.search(r"(\d{2})(\d{2})\.\d{4,5}", source_stem)
        if arxiv_m:
            year  = 2000 + int(arxiv_m.group(1))
            month = int(arxiv_m.group(2))
            if 1 <= month <= 12:
                date_str = f"{_MONTH_NAMES[month]} {year}"

    # --- authors ---
    authors: list[str] = []

    # Try \icmlauthor{Name}{Affiliation} (ICML format)
    icml_authors = re.findall(r"\\icmlauthor\{([^}]+)\}", latex)
    if icml_authors:
        authors = [_strip_latex_commands(a).strip() for a in icml_authors]

    # Try \author[N]{Name} (authblk format)
    if not authors:
        authblk = re.findall(r"\\author(?:\[[^\]]*\])?\{([^}]+)\}", latex)
        if authblk:
            raw_names: list[str] = []
            for block in authblk:
                # Split on \and, \AND, commas, or "and"
                parts = re.split(r"\\and\b|\\AND\b", block)
                for part in parts:
                    name = _strip_latex_commands(part).strip()
                    # Skip things that look like affiliations or emails
                    if name and "@" not in name and len(name) < 80:
                        raw_names.append(name)
            authors = raw_names

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for a in authors:
        if a and a not in seen:
            seen.add(a)
            unique.append(a)
    authors = unique

    return {"title": title, "date": date_str, "authors": authors}


def _format_paper_info(title: str, date: str, authors: list[str]) -> str:
    """Build a reusable one-line description: title, date, authors."""
    parts = [f"{title}."]
    if date:
        parts.append(f"Published {date}.")
    if authors:
        if len(authors) <= 3:
            if len(authors) == 1:
                author_text = f"By {authors[0]}."
            elif len(authors) == 2:
                author_text = f"By {authors[0]} and {authors[1]}."
            else:
                author_text = f"By {authors[0]}, {authors[1]}, and {authors[2]}."
        else:
            first_three = f"{authors[0]}, {authors[1]}, {authors[2]}"
            remaining = len(authors) - 3
            author_text = f"By {first_three}, and {remaining} more author{'s' if remaining != 1 else ''}."
        parts.append(author_text)
    return " ".join(parts)


def _ensure_period(s: str) -> str:
    """Ensure *s* ends with a period."""
    return s if s.endswith(".") else s + "."


def _build_transcript_header(title: str, date: str, authors: list[str]) -> str:
    """Build the spoken header prepended to the transcript."""
    lines = [_ensure_period(title), ""]
    if date:
        lines += [f"Published {date}.", ""]
    if authors:
        if len(authors) <= 3:
            if len(authors) == 1:
                lines += [f"By {authors[0]}.", ""]
            elif len(authors) == 2:
                lines += [f"By {authors[0]} and {authors[1]}.", ""]
            else:
                lines += [f"By {authors[0]}, {authors[1]}, and {authors[2]}.", ""]
        else:
            first_three = f"{authors[0]}, {authors[1]}, {authors[2]}"
            remaining = len(authors) - 3
            lines += [f"By {first_three}, and {remaining} more author{'s' if remaining != 1 else ''}.", ""]
    lines += ["Narration by un. archive.org.", ""]
    return "\n".join(lines)


def _build_transcript_footer(title: str, date: str, authors: list[str]) -> str:
    """Build the spoken footer appended to the transcript."""
    info = _format_paper_info(title, date, authors)
    return (
        f"\n\n"
        f"Thanks for listening. "
        f"This has been an audio narration of {info} "
        f"This paper was narrated by un archive dot org, a project by Sean Ahrens. "
        f"un. archive.org makes it easy to listen to archive papers for free. "
        f"Simply visit a paper on archive.org. "
        f"which is spelled a r. x i. v dot org, "
        f"then pre-pend u. n. to the domain name."
    )


def _safe_filename_part(text: str, max_len: int = 100) -> str:
    """Sanitise *text* for use in a filename."""
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", text)
    return re.sub(r"\s+", " ", text).strip()[:max_len].rstrip()


def build_output_filename(
    title: str,
    first_author: str,
    source_stem: str,
    date_prefix: str = "",
    duration_min: int | None = None,
) -> str:
    """Build the canonical MP3 filename.

    Format: ``DATE - DURm - FirstAuthor - Title - stem.mp3``
    where DATE and DUR are omitted when unavailable.
    """
    parts: list[str] = []
    if date_prefix:
        parts.append(date_prefix)
    if duration_min is not None:
        parts.append(f"{duration_min}m")
    parts.append(_safe_filename_part(first_author or "Unknown", 40))
    parts.append(_safe_filename_part(title, 100))
    parts.append(_safe_filename_part(source_stem, 40))
    return " - ".join(parts) + ".mp3"


def _get_mp3_duration_minutes(path: str) -> int | None:
    """Return the duration of an MP3 file in whole minutes, or None."""
    try:
        from mutagen.mp3 import MP3
        audio = MP3(path)
        return round(audio.info.length / 60)
    except Exception:
        return None


def _date_prefix_from_metadata(date_str: str) -> str:
    """Convert a date like 'November 2024' to '2024-11' for filenames."""
    if not date_str:
        return ""
    for i, name in enumerate(_MONTH_NAMES):
        if name and name.lower() in date_str.lower():
            year_m = re.search(r"\d{4}", date_str)
            if year_m:
                return f"{year_m.group()}-{i:02d}"
    return ""


# ---------------------------------------------------------------------------
# Tar extraction and \input expansion
# ---------------------------------------------------------------------------

def extract_tar_to_papers(tar_path: str, papers_dir: str) -> str:
    """Extract *tar_path* into ``papers_dir/{stem}/``.

    Returns the destination directory path.  No-op if the directory already
    exists (safe to call on re-runs).
    """
    stem = os.path.splitext(os.path.basename(tar_path))[0]
    dest = os.path.join(papers_dir, stem)
    if not os.path.isdir(dest):
        os.makedirs(dest, exist_ok=True)
        with tarfile.open(tar_path, "r:*") as tf:
            tf.extractall(dest)
    return dest


def _find_entry_tex(paper_dir: str) -> str:
    """Locate the root ``.tex`` file inside an extracted paper directory.

    Selection priority:
    1. ``main.tex`` at the shallowest directory depth.
    2. Any ``.tex`` that contains both ``\\documentclass`` and
       ``\\begin{document}``, preferring shallower paths and, among ties,
       files that also declare ``\\title{``.

    Raises ``FileNotFoundError`` if no suitable file is found.
    """
    all_tex: list[str] = []
    for root, _, files in os.walk(paper_dir):
        for fname in files:
            if fname.lower().endswith(".tex"):
                all_tex.append(os.path.join(root, fname))

    if not all_tex:
        raise FileNotFoundError(f"No .tex files found in {paper_dir}")

    # Priority 1: main.tex (shallowest wins)
    mains = [p for p in all_tex if os.path.basename(p).lower() == "main.tex"]
    if mains:
        return min(mains, key=lambda p: p.count(os.sep))

    # Priority 2: any .tex declaring a complete document
    # Sort key: files with \title{ first (has_title = -1 sorts before 0), then shallowest
    roots: list[tuple[int, int, str]] = []
    for path in all_tex:
        try:
            src = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if r"\documentclass" in src and r"\begin{document}" in src:
            has_title = -1 if r"\title{" in src else 0
            roots.append((has_title, path.count(os.sep), path))

    if roots:
        return min(roots)[2]

    raise FileNotFoundError(
        f"No root .tex file (with \\documentclass + \\begin{{document}}) "
        f"found in {paper_dir}"
    )


def read_latex_from_dir(paper_dir: str) -> str:
    """Read the entry ``.tex`` from *paper_dir*, recursively inlining all
    ``\\input{}`` / ``\\include{}`` references from the filesystem.

    Returns the fully expanded LaTeX source as a single string.
    """
    entry_path = _find_entry_tex(paper_dir)

    def resolve_path(ref: str, current_dir: str) -> Optional[str]:
        candidates = [ref + ".tex", ref] if not ref.endswith(".tex") else [ref]
        for candidate in candidates:
            path = os.path.normpath(os.path.join(current_dir, candidate))
            if os.path.isfile(path):
                return path
        return None

    def expand(src: str, current_dir: str, visited: set[str]) -> str:
        def replacer(m: re.Match) -> str:
            resolved = resolve_path(m.group(2).strip(), current_dir)
            if resolved is None:
                return f"\n% [tex_to_audio: could not find {m.group(2)}]\n"
            norm = os.path.normpath(resolved)
            if norm in visited:
                return ""
            visited.add(norm)
            try:
                content = open(resolved, encoding="utf-8", errors="replace").read()
            except OSError:
                return f"\n% [tex_to_audio: could not read {m.group(2)}]\n"
            result = expand(content, os.path.dirname(resolved), visited)
            visited.discard(norm)
            return result
        return re.sub(r"\\(input|include)\{([^}]+)\}", replacer, src)

    source = open(entry_path, encoding="utf-8", errors="replace").read()
    return expand(source, os.path.dirname(entry_path),
                  visited={os.path.normpath(entry_path)})


def read_latex_from_tar(tar_path: str) -> str:
    """Read and expand LaTeX from inside a ``.tar`` archive without extracting
    to disk.

    Uses the same entry-file priority logic as :func:`_find_entry_tex`.
    Returns the fully expanded LaTeX source as a single string.
    """
    with tarfile.open(tar_path, "r:*") as tf:
        members = {m.name: m for m in tf.getmembers() if m.isfile()}
        members_lower: dict[str, str] = {k.lower(): k for k in members}

        def read_member(member) -> str:
            return tf.extractfile(member).read().decode("utf-8", errors="replace")

        def resolve_member(ref: str, current_dir: str):
            candidates = [ref + ".tex", ref] if not ref.endswith(".tex") else [ref]
            for candidate in candidates:
                search_paths = (
                    [os.path.normpath(os.path.join(current_dir, candidate))]
                    if current_dir else []
                ) + [os.path.normpath(candidate)]
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
                    return f"\n% [tex_to_audio: could not find {m.group(2)}]\n"
                norm = os.path.normpath(member.name)
                if norm in visited:
                    return ""
                visited.add(norm)
                result = expand(read_member(member), os.path.dirname(member.name), visited)
                visited.discard(norm)
                return result
            return re.sub(r"\\(input|include)\{([^}]+)\}", replacer, src)

        # Locate entry .tex using the same priority rules as _find_entry_tex
        tex_members = [m for m in members.values() if m.name.lower().endswith(".tex")]
        mains = [m for m in tex_members if os.path.basename(m.name).lower() == "main.tex"]
        if mains:
            entry = min(mains, key=lambda m: m.name.count("/"))
        else:
            roots = []
            for m in tex_members:
                src = read_member(m)
                if r"\documentclass" in src and r"\begin{document}" in src:
                    has_title = -1 if r"\title{" in src else 0
                    roots.append((has_title, m.name.count("/"), m))
            if not roots:
                raise FileNotFoundError(f"No root .tex found inside {tar_path}")
            entry = min(roots)[2]

        source = read_member(entry)
        return expand(source, os.path.dirname(entry.name),
                      visited={os.path.normpath(entry.name)})


# ---------------------------------------------------------------------------
# Batch-mode helpers
# ---------------------------------------------------------------------------

def _already_converted(stem: str, output_dir: str) -> bool:
    """Return True if *output_dir* already contains an MP3 for *stem*."""
    suffix = f" - {stem}.mp3".lower()
    return any(
        os.path.basename(p).lower().endswith(suffix)
        for p in glob.glob(os.path.join(output_dir, "*.mp3"))
    )


def _find_pending_papers(papers_dir: str, output_dir: str) -> list[tuple[str, str]]:
    """Return ``[(stem, paper_dir)]`` for extracted papers without an MP3 yet."""
    if not os.path.isdir(papers_dir):
        return []
    return [
        (name, os.path.join(papers_dir, name))
        for name in sorted(os.listdir(papers_dir))
        if os.path.isdir(os.path.join(papers_dir, name))
        and not _already_converted(name, output_dir)
    ]


# ---------------------------------------------------------------------------
# LaTeX → spoken text
# ---------------------------------------------------------------------------

def _skip_braced_group(text: str, pos: int) -> int:
    """Advance past a ``{...}`` group starting at *pos*, handling nested braces.

    Returns the index just after the closing ``}``.  If *pos* does not point
    at ``{``, returns *pos* unchanged.
    """
    if pos >= len(text) or text[pos] != "{":
        return pos
    depth = 1
    i = pos + 1
    while i < len(text) and depth:
        depth += (text[i] == "{") - (text[i] == "}")
        i += 1
    return i


def _skip_bracketed_group(text: str, pos: int) -> int:
    """Advance past an optional ``[...]`` group starting at *pos*.

    Returns the index just after the closing ``]``.  If *pos* does not point
    at ``[``, returns *pos* unchanged.
    """
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
    """Remove all occurrences of ``\\command{...}`` from *text*, correctly
    handling arbitrarily nested braces.

    Used to strip ``\\footnote{}``, ``\\marginpar{}``, and similar commands
    whose content should not be read aloud.
    """
    result: list[str] = []
    i = 0
    needle = "\\" + command
    while i < len(text):
        if text[i : i + len(needle)] == needle and (
            i + len(needle) >= len(text) or not text[i + len(needle)].isalpha()
        ):
            i += len(needle)
            # skip optional [...] then required {...}
            i = _skip_bracketed_group(text, i)
            i = _skip_braced_group(text, i)
        else:
            result.append(text[i])
            i += 1
    return "".join(result)


def _drop_command_defs(text: str) -> str:
    r"""Remove ``\newcommand``, ``\renewcommand``, ``\newenvironment``,
    ``\renewenvironment``, and ``\def`` definitions from *text*.

    These are preamble-like constructs that sometimes appear inside the
    document body (via ``\input``) and leak formatting artefacts into the
    transcript.
    """
    result: list[str] = []
    i = 0
    prefixes = ("\\newcommand", "\\renewcommand",
                "\\newenvironment", "\\renewenvironment")
    while i < len(text):
        matched = False
        for pfx in prefixes:
            if text[i : i + len(pfx)] == pfx and (
                i + len(pfx) >= len(text) or not text[i + len(pfx)].isalpha()
            ):
                i += len(pfx)
                # optional * variant
                if i < len(text) and text[i] == "*":
                    i += 1
                # {name}
                i = _skip_braced_group(text, i)
                # optional [argcount]
                i = _skip_bracketed_group(text, i)
                # optional [default]
                i = _skip_bracketed_group(text, i)
                # {body}  (and for environments, {end-body})
                i = _skip_braced_group(text, i)
                i = _skip_braced_group(text, i)
                matched = True
                break
        if not matched:
            # Also handle \def\name{...}
            if text[i : i + 4] == "\\def" and (
                i + 4 < len(text) and not text[i + 4].isalpha()
            ):
                i += 4
                # skip \commandname
                if i < len(text) and text[i] == "\\":
                    i += 1
                    while i < len(text) and text[i].isalpha():
                        i += 1
                # skip parameter text until {
                while i < len(text) and text[i] not in "{\n":
                    i += 1
                i = _skip_braced_group(text, i)
            else:
                result.append(text[i])
                i += 1
    return "".join(result)


def clean_latex(text: str) -> str:
    """Strip LaTeX markup from *text*, returning prose suitable for TTS.

    Processing steps:
    1. Extract only the ``\\begin{document}…\\end{document}`` body.
    2. Remove comments, command definitions, layout commands, figures,
       tables, footnotes, citations, acknowledgements, and other
       non-prose content.
    3. Replace structural commands (``\\section``, ``\\title``, etc.) with
       marker tokens consumed by :func:`_convert_markers_to_speech`.
    """
    # 1. Discard preamble — it contains zero human-readable content
    body = re.search(r"\\begin\{document\}(.*?)\\end\{document\}", text, re.DOTALL)
    if body:
        text = body.group(1)

    # 2. Strip LaTeX comments
    text = re.sub(r"%.*$", "", text, flags=re.MULTILINE)

    # 3. Remove command/environment definitions that leak from \input files
    text = _drop_command_defs(text)

    # 4. Remove \definecolor{...}{...}{...}
    text = re.sub(r"\\definecolor\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", text)

    # 5. Remove \hypersetup{...} (fixes pdfborder artifacts)
    text = _drop_braced_command(text, "hypersetup")

    # 6. Remove tikz inline commands and library setup
    text = _drop_braced_command(text, "tikz")
    text = _drop_braced_command(text, "usetikzlibrary")
    text = _drop_braced_command(text, "pgfplotsset")

    # 7. Remove acknowledgements before marker conversion
    text = re.sub(
        r"\\section\*?\{Acknowledg(?:e?ments?)\}.*?(?=\\section|\Z)",
        "", text, flags=re.DOTALL | re.IGNORECASE,
    )
    text = re.sub(r"\\begin\{acks\}.*?\\end\{acks\}", "", text, flags=re.DOTALL)

    # 8. Remove ICML author/affiliation commands and \twocolumn[...] layout
    for cmd in ("icmlauthor", "icmltitle", "icmltitlerunning",
                "icmlaffiliation", "icmlcorrespondingauthor"):
        text = _drop_braced_command(text, cmd)
    # Strip \twocolumn[...] optional args (contain title/author blocks)
    # but keep body text after the closing ]
    result_parts: list[str] = []
    tc_i = 0
    while tc_i < len(text):
        tc_needle = "\\twocolumn"
        if text[tc_i : tc_i + len(tc_needle)] == tc_needle:
            tc_i += len(tc_needle)
            # skip optional whitespace then [...]
            while tc_i < len(text) and text[tc_i] in " \t\n":
                tc_i += 1
            tc_i = _skip_bracketed_group(text, tc_i)
        else:
            result_parts.append(text[tc_i])
            tc_i += 1
    text = "".join(result_parts)

    # 9. Layout / navigation commands with no spoken content
    text = re.sub(
        r"\\(maketitle|tableofcontents|printbibliography|bibliographystyle|"
        r"bibliography|listoffigures|listoftables|newpage|clearpage|"
        r"cleardoublepage|vspace|hspace|vfill|hfill|noindent|medskip|"
        r"bigskip|smallskip|hypertarget|label|tightlist|pagestyle|"
        r"thispagestyle|fancyhf|lfoot|rfoot|lhead|rhead|cfoot|chead|"
        r"printindex|glsaddall|printglossary|"
        r"itemsep|parsep|topsep|partopsep|labelsep|leftmargin|"
        r"setlength|setcounter|addtocounter|"
        r"icmlsetsymbol|icmlkeywords|printAffiliationsAndNotice|"
        r"DeclareSectionCommand|RedeclareSectionCommand|"
        r"columnwidth|textwidth|linewidth)[^\n]*\n?",
        "",
        text,
    )

    # 9. Inline formatting — strip command, keep inner content
    for cmd in ("textbf", "emph", "textit", "texttt", "text",
                "highlight", "newterm", "term", "ul", "st"):
        text = re.sub(rf"\\{cmd}\{{([^}}]*)\}}", r"\1", text)

    # 10. Structural commands → placeholder marker tokens
    text = re.sub(r"\\title\{([^}]+)\}",           r"TITLE_START \1 TITLE_END",           text)
    text = re.sub(r"\\begin\{abstract\}",           "ABSTRACT_START",                      text)
    text = re.sub(r"\\end\{abstract\}",             "ABSTRACT_END",                        text)
    text = re.sub(r"\\section\*?\{([^}]+)\}",       r"SECTION_START \1 SECTION_END",       text)
    text = re.sub(r"\\subsection\*?\{([^}]+)\}",    r"SUBSECTION_START \1 SUBSECTION_END", text)
    text = re.sub(r"\\subsubsection\*?\{([^}]+)\}", r"SUBSECTION_START \1 SUBSECTION_END", text)
    text = re.sub(r"\\paragraph\*?\{([^}]+)\}",     r"PARA_START \1 PARA_END",             text)

    # 11. List environments — distinguish enumerate vs itemize
    text = re.sub(r"\\begin\{(enumerate|compactenum)\}(\[[^\]]*\])?", "\nENUM_START", text)
    text = re.sub(r"\\end\{(enumerate|compactenum)\}",                "ENUM_END\n",   text)
    text = re.sub(r"\\begin\{(itemize|compactitem|inparaenum)\}(\[[^\]]*\])?", "\nLIST_START", text)
    text = re.sub(r"\\end\{(itemize|compactitem|inparaenum)\}",                "LIST_END\n",   text)
    text = re.sub(r"\\item\s*", "\nITEM ", text)

    # 12. Skip figure, table floats, and ICML author lists entirely
    text = re.sub(
        r"\\begin\{(figure|table|icmlauthorlist)[*]?\}.*?\\end\{\1[*]?\}", "", text, flags=re.DOTALL
    )

    # 13. Other named environments — strip tags, keep body
    text = re.sub(r"\\begin\{example\}", "\nEXAMPLE_START", text)
    text = re.sub(r"\\end\{example\}",   "EXAMPLE_END\n",   text)
    text = re.sub(r"\\begin\{[^}]+\}(\[[^\]]*\])?", "", text)
    text = re.sub(r"\\end\{[^}]+\}",                "", text)

    # 14. Drop footnotes and marginpars (brace-depth-aware)
    text = _drop_braced_command(text, "footnote")
    text = _drop_braced_command(text, "marginpar")

    # 15. Citations, cross-references, hyperlinks
    text = re.sub(r"\\cite[a-z]*\{[^}]*\}",         "",    text)
    text = re.sub(r"\\(ref|eqref|pageref|autoref)\{[^}]*\}", "", text)
    text = re.sub(r"\\href\{[^}]*\}\{([^}]+)\}",     r"\1", text)
    text = re.sub(r"\\url\{[^}]*\}",                 "",    text)

    # 16. Abbreviation and punctuation normalisation
    text = re.sub(r"\\ldots\{\}?", "...",           text)
    text = re.sub(r"e\.g\.~",      "for example, ", text)
    text = re.sub(r"i\.e\.~",      "that is, ",     text)
    text = re.sub(r"e\.g\.",       "for example,",  text)
    text = re.sub(r"i\.e\.",       "that is,",      text)
    text = text.replace("---", ", ")
    text = text.replace("``", '"').replace("''", '"').replace("`", "'")
    text = text.replace("~", " ").replace("\\\\", " ")

    # 17. Convert LaTeX accents to Unicode before stripping remaining commands
    text = _latex_accents_to_unicode(text)

    # 18. Final sweep — remaining commands (keep brace content) then bare braces
    text = re.sub(r"\\[a-zA-Z]+\*?\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\[a-zA-Z]+\*?",             " ",   text)
    text = re.sub(r"[{}]",                        "",    text)
    # Clean up stray bracket groups from tikz/optional args
    text = re.sub(r"\[[^\]]{0,80}\]", "", text)

    return text


_ORDINALS = [
    "", "First", "Second", "Third", "Fourth", "Fifth",
    "Sixth", "Seventh", "Eighth", "Ninth", "Tenth",
]


def _ordinal_word(n: int) -> str:
    """Return a spoken ordinal: 'First' … 'Tenth', then '11th' etc."""
    if 1 <= n < len(_ORDINALS):
        return _ORDINALS[n]
    return f"{n}th"


def _convert_markers_to_speech(text: str) -> str:
    """Replace placeholder tokens inserted by :func:`clean_latex` with
    natural spoken-language phrasing.
    """
    lines: list[str] = []
    in_enum = False
    enum_counter = 0

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            lines.append("")
            continue

        # Title is rendered in header/footer — skip duplicate in body
        if "TITLE_START" in line and "TITLE_END" in line:
            continue

        elif "ABSTRACT_START" in line:
            lines += ["", "Abstract.", ""]
        elif "ABSTRACT_END" in line:
            lines.append("")

        # Check SUBSECTION before SECTION (SUBSECTION contains SECTION as substring)
        elif "SUBSECTION_START" in line and "SUBSECTION_END" in line:
            name = re.sub(r"SUBSECTION_START\s*|\s*SUBSECTION_END", "", line).strip()
            lines += ["", f"{name}.", ""]
        elif "SECTION_START" in line and "SECTION_END" in line:
            name = re.sub(r"SECTION_START\s*|\s*SECTION_END", "", line).strip()
            lines += ["", "", f"{name}.", ""]

        elif "PARA_START" in line and "PARA_END" in line:
            name = re.sub(r"PARA_START\s*|\s*PARA_END", "", line).strip()
            lines += ["", f"{name}.", ""]

        elif "EXAMPLE_START" in line:
            lines += ["", "For example:"]
        elif "EXAMPLE_END" in line:
            lines.append("")

        # List structure
        elif "ENUM_START" in line:
            in_enum = True
            enum_counter = 0
        elif "ENUM_END" in line:
            in_enum = False
            lines.append("")
        elif "LIST_START" in line:
            pass  # itemize lists just flow naturally
        elif "LIST_END" in line:
            lines.append("")
        elif line.startswith("ITEM "):
            content = line[5:].strip()
            if in_enum:
                enum_counter += 1
                lines.append(f"{_ordinal_word(enum_counter)}, {content}")
            else:
                lines.append(content)
        else:
            lines.append(line)
    return "\n".join(lines)


def _finalize_speech(text: str) -> str:
    """Collapse excessive blank lines and stray punctuation-only lines."""
    text  = re.sub(r"\n{3,}", "\n\n", text)
    text  = re.sub(r"[ \t]+",  " ",   text)
    lines = [l for l in text.split("\n") if l.strip() not in (".", ",", ";", ":", "-")]
    return "\n".join(lines).strip()


def build_speech_text(latex: str, source_stem: str = "") -> str:
    """Full LaTeX → TTS-ready text pipeline with header and footer."""
    body = _finalize_speech(_convert_markers_to_speech(clean_latex(latex)))
    meta = extract_full_metadata(latex, source_stem)
    title   = meta["title"]
    date    = meta["date"]
    authors = meta["authors"]
    header = _build_transcript_header(title, date, authors)
    footer = _build_transcript_footer(title, date, authors)
    return header + "\n" + body + footer


def _split_into_chunks(text: str, max_chars: int = CHUNK_MAX_CHARS) -> list[str]:
    """Split *text* into paragraph-aligned chunks of at most *max_chars* each."""
    chunks: list[str]       = []
    current_paras: list[str] = []
    current_len             = 0

    for para in text.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if current_len + len(para) > max_chars and current_paras:
            chunks.append("\n\n".join(current_paras))
            current_paras, current_len = [para], len(para)
        else:
            current_paras.append(para)
            current_len += len(para) + 2  # +2 for the "\n\n" separator

    if current_paras:
        chunks.append("\n\n".join(current_paras))
    return chunks


# ---------------------------------------------------------------------------
# ID3 tagging
# ---------------------------------------------------------------------------

def tag_mp3(
    path: str,
    title: str,
    author: str,
    genre: str = "Audiobook",
    arxiv_id: str = "",
) -> None:
    """Write ID3 tags to an MP3 file.

    Includes title, artist, album, genre, URL, and unarXiv.org branding.
    Silently skips tagging if *mutagen* is not installed.
    """
    try:
        from mutagen.id3 import (
            ID3, TIT2, TPE1, TPE2, TALB, TCON, COMM, WOAF, TPUB,
            ID3NoHeaderError,
        )
    except ImportError:
        print("  (mutagen not installed — skipping ID3 tags)")
        return
    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        tags = ID3()
    tags.add(TIT2(encoding=3, text=title))
    tags.add(TPE1(encoding=3, text=author))
    tags.add(TPE2(encoding=3, text="unarXiv.org"))
    tags.add(TALB(encoding=3, text=title))
    tags.add(TCON(encoding=3, text=genre))
    tags.add(TPUB(encoding=3, text="unarXiv.org"))
    if arxiv_id:
        url = f"https://unarXiv.org/abs/{arxiv_id}"
        tags.add(WOAF(url=url))
        tags.add(COMM(encoding=3, lang="eng", desc="", text=f"Narrated by unarXiv.org — {url}"))
    else:
        tags.add(COMM(encoding=3, lang="eng", desc="", text="Narrated by unarXiv.org"))
    tags.save(path)


# ---------------------------------------------------------------------------
# TTS engine
# ---------------------------------------------------------------------------

def _tts_chunk(text: str, output_path: str, voice: str) -> None:
    """Synthesise *text* to an MP3 file at *output_path*.

    Engine priority:
    1. **edge-tts** (Microsoft, online) — high-quality neural voices, no
       aggressive rate limiting.  Install with ``pip install edge-tts``.
    2. **pyttsx3** (offline) — uses the OS system voices (macOS/Windows).
       Install with ``pip install pyttsx3``.

    edge-tts is tried first; any failure (network error, rate limit, etc.)
    automatically falls back to pyttsx3.  Raises ``RuntimeError`` if neither
    engine is available.
    """
    # --- Primary: edge-tts (Microsoft, online) ---
    try:
        import edge_tts  # noqa: PLC0415
        import asyncio

        async def _synthesise() -> None:
            await edge_tts.Communicate(text, voice).save(output_path)

        asyncio.run(_synthesise())
        return
    except ImportError:
        pass  # not installed — try offline fallback
    except Exception as exc:
        print(f"    edge-tts failed ({exc}), falling back to system voices...")

    # --- Fallback: pyttsx3 (offline, macOS/Windows system voices) ---
    try:
        import pyttsx3  # noqa: PLC0415

        engine = pyttsx3.init()
        # pyttsx3 on macOS produces AIFF; convert to MP3 via ffmpeg
        aiff_path = output_path.replace(".mp3", ".aiff")
        engine.save_to_file(text, aiff_path)
        engine.runAndWait()
        os.system(f'ffmpeg -y -i "{aiff_path}" "{output_path}" 2>/dev/null')
        if os.path.exists(aiff_path):
            os.remove(aiff_path)
        return
    except ImportError:
        pass

    raise RuntimeError(
        "No TTS engine found.\n"
        "Install one:\n"
        "  pip install edge-tts   ← recommended (Microsoft, online)\n"
        "  pip install pyttsx3    ← offline fallback (system voices)"
    )


def generate_audio(
    speech: str,
    latex: str,
    output_path: str,
    voice: str = DEFAULT_VOICE,
    verbose: bool = True,
    source_stem: str = "",
) -> Optional[str]:
    """Generate a tagged MP3 audiobook from *speech* text.

    Args:
        speech:       TTS-ready text (output of :func:`build_speech_text`).
        latex:        Original LaTeX source — used only for metadata extraction.
        output_path:  Destination ``.mp3`` path (may be renamed with duration).
        voice:        edge-tts voice name or a short preset key from
                      :data:`VOICE_PRESETS` (e.g. ``'en'``, ``'en-gb'``).
                      Run ``edge-tts --list-voices`` for all options.
        verbose:      If *True*, print progress to stdout.
        source_stem:  arXiv stem for metadata extraction.

    Returns:
        Final output path on success, ``None`` if ffmpeg concatenation failed.
    """
    resolved_voice = VOICE_PRESETS.get(voice.lower(), voice)
    meta = extract_full_metadata(latex, source_stem)
    title       = meta["title"]
    authors     = meta["authors"]
    first_author = authors[0] if authors else "Unknown"

    if verbose:
        print(f"  Title:  {title}")
        print(f"  Author: {first_author}")
        print(f"  Output: {os.path.basename(output_path)}")

    chunks = _split_into_chunks(speech)
    if verbose:
        print(f"  Generating audio ({len(chunks)} chunk(s), {len(speech):,} chars)...")

    tmp_dir     = tempfile.mkdtemp()
    chunk_paths: list[str] = []
    list_file   = os.path.join(tmp_dir, "list.txt")
    ret         = 1  # default: failure

    try:
        for i, chunk in enumerate(chunks):
            chunk_path = os.path.join(tmp_dir, f"chunk_{i:03d}.mp3")
            if verbose:
                print(f"    chunk {i + 1}/{len(chunks)}...")
            _tts_chunk(chunk, chunk_path, resolved_voice)
            chunk_paths.append(chunk_path)

        with open(list_file, "w") as fh:
            fh.writelines(f"file '{p}'\n" for p in chunk_paths)

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        ret = os.system(
            f'ffmpeg -y -f concat -safe 0 -i "{list_file}" '
            f'-acodec copy "{output_path}" 2>/dev/null'
        )
    finally:
        for p in chunk_paths:
            if os.path.exists(p):
                os.remove(p)
        if os.path.exists(list_file):
            os.remove(list_file)
        try:
            os.rmdir(tmp_dir)
        except OSError:
            pass  # leave non-empty dir for post-mortem inspection

    if ret != 0:
        print("  ERROR: ffmpeg failed — is it installed?")
        return None

    tag_mp3(output_path, title=title, author=first_author)

    # Rename with actual duration now that the MP3 exists
    duration_min = _get_mp3_duration_minutes(output_path)
    date_prefix = _date_prefix_from_metadata(meta["date"])
    final_name = build_output_filename(
        title, first_author, source_stem,
        date_prefix=date_prefix, duration_min=duration_min,
    )
    final_path = os.path.join(os.path.dirname(output_path), final_name)
    if final_path != output_path:
        os.rename(output_path, final_path)

    size_mb = os.path.getsize(final_path) / (1024 * 1024)
    if verbose:
        dur_str = f", {duration_min} min" if duration_min else ""
        print(f"  Done — {os.path.basename(final_path)} ({size_mb:.1f} MB{dur_str})")
    return final_path


# ---------------------------------------------------------------------------
# Batch-mode stages
# ---------------------------------------------------------------------------

def _batch_extract_tars(input_dir: str, papers_dir: str, verbose: bool) -> None:
    """Extract any .tar in *input_dir* not yet present in *papers_dir*."""
    for tar_path in sorted(glob.glob(os.path.join(input_dir, "*.tar"))):
        stem = os.path.splitext(os.path.basename(tar_path))[0]
        if not os.path.isdir(os.path.join(papers_dir, stem)):
            print(f"Extracting {os.path.basename(tar_path)} → papers/{stem}/")
            extract_tar_to_papers(tar_path, papers_dir)
        elif verbose:
            print(f"Already extracted: {stem}")


def _batch_build_transcripts(
    pending: list[tuple[str, str]],
) -> list[tuple[str, str, str, str]]:
    """Write ``tr-transcript.txt`` for every paper in *pending* that lacks one.

    All transcripts are written **before** any audio is generated so that a
    network failure during audio synthesis does not leave some papers without
    a transcript.  Existing transcripts are reused, preserving any manual edits.

    Returns a list of ``(stem, paper_dir, latex, speech)`` tuples for every
    paper ready for audio generation.
    """
    ready: list[tuple[str, str, str, str]] = []

    for stem, paper_dir in pending:
        transcript_path = os.path.join(paper_dir, "tr-transcript.txt")

        if os.path.isfile(transcript_path):
            # Reuse existing transcript — handles re-runs and manual edits
            speech = open(transcript_path, encoding="utf-8").read()
            try:
                latex = read_latex_from_dir(paper_dir)
            except FileNotFoundError:
                latex = ""  # limited metadata, but speech text is already clean
            print(f"  {stem}: transcript reused ({len(speech):,} chars)")
        else:
            try:
                latex = read_latex_from_dir(paper_dir)
            except FileNotFoundError as exc:
                print(f"  SKIP {stem}: {exc}")
                continue
            speech = build_speech_text(latex, source_stem=stem)
            with open(transcript_path, "w", encoding="utf-8") as fh:
                fh.write(speech)
            print(f"  {stem}: transcript written ({len(speech):,} chars)")

        ready.append((stem, paper_dir, latex, speech))

    return ready


def _batch_generate_audio(
    ready: list[tuple[str, str, str, str]],
    output_dir: str,
    voice: str,
    verbose: bool,
) -> None:
    """Generate MP3s for all papers in *ready*, shortest transcript first."""
    ready_sorted = sorted(ready, key=lambda item: len(item[3]))

    print("\nConversion order (shortest → longest):")
    for i, (stem, _, _, speech) in enumerate(ready_sorted, 1):
        print(f"  {i}. {stem} ({len(speech):,} chars)")

    for idx, (stem, paper_dir, latex, speech) in enumerate(ready_sorted):
        if idx > 0:
            print(f"\n  (pausing {INTER_PAPER_PAUSE}s before next paper...)")
            time.sleep(INTER_PAPER_PAUSE)

        print(f"\n→ {stem}")
        meta = extract_full_metadata(latex, stem)
        first_author = meta["authors"][0] if meta["authors"] else "Unknown"
        # Use a temp name; generate_audio will rename with duration
        tmp_name = build_output_filename(meta["title"], first_author, stem,
                                          date_prefix=_date_prefix_from_metadata(meta["date"]))
        out_path = os.path.join(output_dir, tmp_name)
        result = generate_audio(speech, latex, out_path, voice=voice,
                                verbose=verbose, source_stem=stem)
        if result is None:
            print(f"  WARNING: audio generation failed for {stem} — skipping.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))

    parser = argparse.ArgumentParser(
        description="Convert LaTeX .tar archives to tagged MP3 audiobooks.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "input", nargs="?",
        help="Single .tar or .tex file.  Omit for batch mode.",
    )
    parser.add_argument("-o", "--output", default=None,
                        help="Output MP3 path (single-file mode only).")
    parser.add_argument("--input-dir",  default=os.path.join(script_dir, "input"))
    parser.add_argument("--papers-dir", default=os.path.join(script_dir, "papers"))
    parser.add_argument("--output-dir", default=os.path.join(script_dir, "output"))
    parser.add_argument(
        "--voice", default="en",
        help=(
            "edge-tts voice name or preset key: en, en-gb, en-au "
            "(default: en → en-US-JennyNeural).  "
            "Run 'edge-tts --list-voices' for all options."
        ),
    )
    parser.add_argument("-q", "--quiet", action="store_true")

    args    = parser.parse_args()
    verbose = not args.quiet
    voice   = VOICE_PRESETS.get(args.voice.lower(), args.voice)

    # -------------------------------------------------------------------
    # Single-file mode
    # -------------------------------------------------------------------
    if args.input:
        if not os.path.isfile(args.input):
            print(f"ERROR: File not found: {args.input}")
            sys.exit(1)
        stem = os.path.splitext(os.path.basename(args.input))[0]
        ext  = os.path.splitext(args.input)[1].lower()
        print(f"\n→ {os.path.basename(args.input)}")
        latex = (read_latex_from_tar(args.input) if ext == ".tar"
                 else open(args.input, encoding="utf-8").read())
        meta = extract_full_metadata(latex, stem)
        first_author = meta["authors"][0] if meta["authors"] else "Unknown"
        out_path = args.output or os.path.join(
            os.path.dirname(os.path.abspath(args.input)),
            build_output_filename(meta["title"], first_author, stem,
                                  date_prefix=_date_prefix_from_metadata(meta["date"])),
        )
        speech = build_speech_text(latex, source_stem=stem)
        generate_audio(speech, latex, out_path, voice=voice, verbose=verbose,
                       source_stem=stem)
        return

    # -------------------------------------------------------------------
    # Batch mode
    # -------------------------------------------------------------------
    input_dir  = args.input_dir
    papers_dir = args.papers_dir
    output_dir = args.output_dir

    if not os.path.isdir(input_dir):
        print(f"ERROR: input directory not found: {input_dir}")
        print("Create an 'input' folder next to this script and drop your .tar files in it.")
        input("Press Enter to close...")
        sys.exit(1)

    os.makedirs(papers_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    # Stage 1: extract tars
    _batch_extract_tars(input_dir, papers_dir, verbose)

    # Stage 2: build all transcripts before touching the TTS engine
    pending = _find_pending_papers(papers_dir, output_dir)
    if not pending:
        print("Nothing to do — all papers already converted.")
        input("Press Enter to close...")
        return

    print(f"\nFound {len(pending)} paper(s) to convert — building transcripts...")
    ready = _batch_build_transcripts(pending)
    if not ready:
        print("No convertible papers found.")
        input("Press Enter to close...")
        return

    # Stage 3: generate audio
    _batch_generate_audio(ready, output_dir, voice, verbose)

    print(f"\nAll done.  MP3s in: {output_dir}")
    input("Press Enter to close...")


if __name__ == "__main__":
    main()
