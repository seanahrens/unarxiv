"""
math_to_speech.py — Convert LaTeX math expressions to spoken English.

Handles inline math ($...$) by translating common math notation into
natural language that a TTS system can read aloud.

This is intentionally conservative: simple expressions get spoken,
complex ones are dropped (display math is already removed upstream).
"""

from __future__ import annotations

import re


# ---------------------------------------------------------------------------
# Symbol → spoken word mappings
# ---------------------------------------------------------------------------

# Operators and relations
_OPERATORS = {
    "+": " plus ",
    "-": " minus ",
    "\\times": " times ",
    "\\cdot": " times ",
    "\\cdots": "...",
    "\\ldots": "...",
    "\\div": " divided by ",
    "=": " equals ",
    "\\neq": " does not equal ",
    "\\ne": " does not equal ",
    "\\approx": " approximately equals ",
    "\\sim": " approximately ",
    "\\simeq": " is similar to ",
    "\\equiv": " is equivalent to ",
    "\\leq": " less than or equal to ",
    "\\le": " less than or equal to ",
    "\\geq": " greater than or equal to ",
    "\\ge": " greater than or equal to ",
    "<": " less than ",
    ">": " greater than ",
    "\\ll": " much less than ",
    "\\gg": " much greater than ",
    "\\in": " in ",
    "\\notin": " not in ",
    "\\subset": " is a subset of ",
    "\\subseteq": " is a subset of ",
    "\\supset": " is a superset of ",
    "\\cup": " union ",
    "\\cap": " intersection ",
    "\\pm": " plus or minus ",
    "\\mp": " minus or plus ",
    "\\to": " to ",
    "\\rightarrow": " to ",
    "\\leftarrow": " from ",
    "\\Rightarrow": " implies ",
    "\\Leftarrow": " is implied by ",
    "\\iff": " if and only if ",
    "\\forall": " for all ",
    "\\exists": " there exists ",
    "\\neg": " not ",
    "\\land": " and ",
    "\\lor": " or ",
    "\\infty": " infinity ",
    "\\partial": " partial ",
    "\\nabla": " nabla ",
    "\\propto": " is proportional to ",
    "\\perp": " perpendicular to ",
    "\\parallel": " parallel to ",
    "\\mid": " given ",
    "\\|": " norm of ",
    "\\left": "",
    "\\right": "",
    "\\Big": "",
    "\\big": "",
    "\\bigg": "",
    "\\Bigg": "",
}

# Common functions
_FUNCTIONS = {
    "\\sin": "sine",
    "\\cos": "cosine",
    "\\tan": "tangent",
    "\\log": "log",
    "\\ln": "natural log",
    "\\exp": "e to the power of",
    "\\max": "max",
    "\\min": "min",
    "\\sup": "supremum",
    "\\inf": "infimum",
    "\\lim": "limit",
    "\\arg": "arg",
    "\\det": "determinant",
    "\\dim": "dimension",
    "\\mod": "mod",
    "\\gcd": "greatest common divisor",
    "\\Pr": "probability",
}

# Superscript spoken forms for common cases
_SUPERSCRIPT_WORDS = {
    "2": " squared",
    "3": " cubed",
    "T": " transpose",
    "t": " at time t",
    "*": " star",
    "'": " prime",
    "\\prime": " prime",
    "-1": " inverse",
    "n": " to the n",
    "k": " to the k",
    "i": " to the i",
}


def inline_math_to_speech(expr: str) -> str:
    """Convert a single inline math expression to spoken English.

    Called for content between $...$ delimiters.
    Returns spoken text or empty string if too complex.
    """
    expr = expr.strip()

    # Very short expressions (single variable/number) — keep as-is
    if len(expr) <= 3 and re.match(r"^[a-zA-Z0-9]+$", expr):
        return f" {expr} "

    # Check complexity: if it has too many special constructs, skip it
    complexity = _estimate_complexity(expr)
    if complexity > 8:
        return ""  # too complex for spoken form

    return " " + math_to_speech(expr).strip() + " "


def math_to_speech(expr: str) -> str:
    """Convert a LaTeX math expression to spoken English."""
    expr = expr.strip()
    if not expr:
        return ""

    # Pre-process: strip \displaystyle, \textstyle, etc.
    expr = re.sub(r"\\(displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b", "", expr)
    # Strip \left and \right delimiters
    expr = re.sub(r"\\(left|right)[.()\\[\]|]?", "", expr)
    expr = re.sub(r"\\(Big|big|bigg|Bigg)[.()\\[\]|]?", "", expr)

    # Handle fractions: \frac{a}{b} → "a over b"
    expr = _convert_fractions(expr)

    # Handle square roots: \sqrt{x} → "square root of x"
    expr = _convert_sqrt(expr)

    # Handle superscripts: x^{2} → "x squared"
    expr = _convert_superscripts(expr)

    # Handle subscripts: x_{i} → "x sub i"
    expr = _convert_subscripts(expr)

    # Handle summation: \sum → "sum"
    expr = re.sub(r"\\sum\b", " the sum of ", expr)
    expr = re.sub(r"\\prod\b", " the product of ", expr)
    expr = re.sub(r"\\int\b", " the integral of ", expr)

    # Replace operators
    for symbol, spoken in _OPERATORS.items():
        if symbol.startswith("\\"):
            expr = re.sub(re.escape(symbol) + r"(?![a-zA-Z])", spoken, expr)
        else:
            expr = expr.replace(symbol, spoken)

    # Replace functions
    for func, spoken in _FUNCTIONS.items():
        expr = re.sub(re.escape(func) + r"(?![a-zA-Z])", f" {spoken} of ", expr)

    # Clean up remaining LaTeX artifacts
    expr = re.sub(r"\\[a-zA-Z]+", " ", expr)  # remaining commands
    expr = re.sub(r"[{}]", "", expr)           # braces
    expr = re.sub(r"\s+", " ", expr)           # whitespace

    return expr.strip()


def _convert_fractions(expr: str) -> str:
    """Convert \\frac{a}{b} → 'a over b'."""
    # Handle nested fracs by working from innermost out
    for _ in range(5):  # max nesting depth
        m = re.search(r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}", expr)
        if not m:
            break
        numer = m.group(1).strip()
        denom = m.group(2).strip()
        # Simple numeric fractions
        if re.match(r"^\d+$", numer) and re.match(r"^\d+$", denom):
            spoken = f"{numer} over {denom}"
        else:
            spoken = f"{numer} over {denom}"
        expr = expr[:m.start()] + spoken + expr[m.end():]
    return expr


def _convert_sqrt(expr: str) -> str:
    """Convert \\sqrt{x} → 'the square root of x'."""
    for _ in range(5):
        # \sqrt[n]{x} → "the nth root of x"
        m = re.search(r"\\sqrt\[([^\]]+)\]\{([^{}]*)\}", expr)
        if m:
            n = m.group(1).strip()
            content = m.group(2).strip()
            expr = expr[:m.start()] + f"the {n}th root of {content}" + expr[m.end():]
            continue
        # \sqrt{x} → "the square root of x"
        m = re.search(r"\\sqrt\{([^{}]*)\}", expr)
        if m:
            content = m.group(1).strip()
            expr = expr[:m.start()] + f"the square root of {content}" + expr[m.end():]
            continue
        break
    return expr


def _convert_superscripts(expr: str) -> str:
    """Convert x^{2} → 'x squared', x^{n} → 'x to the n'."""
    # Braced superscripts: ^{...}
    for _ in range(5):
        m = re.search(r"\^\{([^{}]*)\}", expr)
        if not m:
            break
        content = m.group(1).strip()
        if content in _SUPERSCRIPT_WORDS:
            spoken = _SUPERSCRIPT_WORDS[content]
        else:
            spoken = f" to the power of {content}"
        expr = expr[:m.start()] + spoken + expr[m.end():]

    # Bare superscripts: ^2, ^T, etc.
    m = re.search(r"\^([a-zA-Z0-9*'])", expr)
    while m:
        char = m.group(1)
        if char in _SUPERSCRIPT_WORDS:
            spoken = _SUPERSCRIPT_WORDS[char]
        else:
            spoken = f" to the {char}"
        expr = expr[:m.start()] + spoken + expr[m.end():]
        m = re.search(r"\^([a-zA-Z0-9*'])", expr)

    return expr


def _convert_subscripts(expr: str) -> str:
    """Convert x_{i} → 'x sub i' for simple subscripts."""
    # Only convert simple subscripts (single char or short)
    # Use 20 passes to handle expressions with many subscripts (e.g. 6+ in one formula)
    for _ in range(20):
        m = re.search(r"_\{([^{}]{1,10})\}", expr)
        if not m:
            break
        content = m.group(1).strip()
        # Skip pure numbers used as footnote markers
        if re.match(r"^\d+$", content) and len(content) <= 2:
            expr = expr[:m.start()] + expr[m.end():]  # just remove
        else:
            expr = expr[:m.start()] + f" sub {content}" + expr[m.end():]

    # Bare subscripts
    m = re.search(r"_([a-zA-Z0-9])", expr)
    while m:
        char = m.group(1)
        expr = expr[:m.start()] + f" sub {char}" + expr[m.end():]
        m = re.search(r"_([a-zA-Z0-9])", expr)

    return expr


def _estimate_complexity(expr: str) -> int:
    """Estimate how complex a math expression is for speaking.

    Returns a score; higher = more complex = less suitable for speech.
    """
    score = 0
    score += len(re.findall(r"\\frac", expr)) * 2
    score += len(re.findall(r"\\sum|\\prod|\\int", expr)) * 2
    score += len(re.findall(r"\\begin\{", expr)) * 3
    score += len(re.findall(r"\^", expr))
    score += len(re.findall(r"_", expr))
    score += max(0, len(expr) - 50) // 20  # length penalty
    return score
