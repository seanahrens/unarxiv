"""
latex_accents.py — Convert LaTeX accent commands and special characters
to their Unicode equivalents.

Also provides Greek letter → English name mappings for TTS.
"""

from __future__ import annotations

import re


# ---------------------------------------------------------------------------
# Accent maps
# ---------------------------------------------------------------------------

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
    "H": {"o": "ő", "u": "ű", "O": "Ő", "U": "Ű"},
    ".": {"z": "ż", "Z": "Ż", "c": "ċ", "g": "ġ", "I": "İ"},
    "d": {"a": "ạ", "e": "ẹ", "i": "ị", "o": "ọ", "u": "ụ"},
    "r": {"a": "å", "A": "Å", "u": "ů", "U": "Ů"},
    "u": {"a": "ă", "g": "ğ", "A": "Ă", "G": "Ğ", "u": "ŭ"},
    "v": {
        "c": "č", "s": "š", "z": "ž", "r": "ř", "n": "ň", "e": "ě",
        "C": "Č", "S": "Š", "Z": "Ž", "R": "Ř", "N": "Ň", "E": "Ě",
        "d": "ď", "t": "ť", "D": "Ď", "T": "Ť",
    },
    "k": {"a": "ą", "e": "ę", "A": "Ą", "E": "Ę"},
}

_SPECIAL_CHARS: dict[str, str] = {
    "aa": "å", "AA": "Å",
    "ae": "æ", "AE": "Æ",
    "oe": "œ", "OE": "Œ",
    "ss": "ß",
    "o": "ø", "O": "Ø",
    "l": "ł", "L": "Ł",
    "i": "ı",
    "j": "ȷ",
}


# ---------------------------------------------------------------------------
# Greek letters → English names for TTS
# ---------------------------------------------------------------------------

GREEK_TO_ENGLISH: dict[str, str] = {
    r"\alpha": "alpha", r"\beta": "beta", r"\gamma": "gamma",
    r"\delta": "delta", r"\epsilon": "epsilon", r"\varepsilon": "epsilon",
    r"\zeta": "zeta", r"\eta": "eta", r"\theta": "theta", r"\vartheta": "theta",
    r"\iota": "iota", r"\kappa": "kappa", r"\lambda": "lambda",
    r"\mu": "mu", r"\nu": "nu", r"\xi": "xi", r"\pi": "pi", r"\varpi": "pi",
    r"\rho": "rho", r"\varrho": "rho", r"\sigma": "sigma", r"\varsigma": "sigma",
    r"\tau": "tau", r"\upsilon": "upsilon", r"\phi": "phi", r"\varphi": "phi",
    r"\chi": "chi", r"\psi": "psi", r"\omega": "omega",
    r"\Gamma": "Gamma", r"\Delta": "Delta", r"\Theta": "Theta",
    r"\Lambda": "Lambda", r"\Xi": "Xi", r"\Pi": "Pi",
    r"\Sigma": "Sigma", r"\Upsilon": "Upsilon", r"\Phi": "Phi",
    r"\Psi": "Psi", r"\Omega": "Omega",
}


# ---------------------------------------------------------------------------
# Main conversion function
# ---------------------------------------------------------------------------

def latex_accents_to_unicode(text: str) -> str:
    """Convert LaTeX accent commands to their Unicode equivalents.

    Handles both braced (\\'{e}) and unbraced (\\'e) forms,
    plus special character commands (\\aa, \\ae, \\ss, etc.).
    """
    # 1. Special character commands
    for cmd, char in sorted(_SPECIAL_CHARS.items(), key=lambda x: -len(x[0])):
        text = re.sub(rf"\\{cmd}\{{\}}", char, text)
        text = re.sub(rf"\\{cmd}(?=[^a-zA-Z]|$)", char, text)

    # 2. Accent commands with braces: \'{e}, \^{o}, etc.
    def _replace_braced(m: re.Match) -> str:
        cmd, base = m.group(1), m.group(2)
        if cmd in _ACCENT_MAP and base in _ACCENT_MAP[cmd]:
            return _ACCENT_MAP[cmd][base]
        return base

    text = re.sub(r"""\\(['\"`^~.=])\{(\w)\}""", _replace_braced, text)
    text = re.sub(r"\\([cHdrukvk])\{(\w)\}", _replace_braced, text)

    # 3. Accent commands without braces: \'e, \^o, etc.
    def _replace_bare(m: re.Match) -> str:
        cmd, base = m.group(1), m.group(2)
        if cmd in _ACCENT_MAP and base in _ACCENT_MAP[cmd]:
            return _ACCENT_MAP[cmd][base]
        return base

    text = re.sub(r"""\\(['\"`^~.=])(\w)""", _replace_bare, text)
    text = re.sub(r"\\([cHdrukvk])([a-zA-Z])(?!\w)", _replace_bare, text)

    return text
