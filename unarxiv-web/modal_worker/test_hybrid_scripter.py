"""Tests for hybrid_scripter element extraction and assembly."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from hybrid_scripter.element_extractor import (
    extract_elements,
    get_display_math_inner,
)


def test_extract_figures():
    body = r"""
Some intro text about the model.

\begin{figure}[h]
\centering
\includegraphics[width=0.5\textwidth]{figures/model_arch}
\caption{Architecture of our model showing the encoder-decoder structure.}
\label{fig:arch}
\end{figure}

More text after the figure discussing results.
"""
    modified, elements = extract_elements(body)

    assert len(elements) == 1
    elem = elements[0]
    assert elem.element_type == "figure"
    assert "HYBRID_ELEMENT_FIGURE_001" in modified
    assert "\\includegraphics" not in modified
    assert "figures/model_arch" in elem.figure_refs
    assert "Architecture of our model" in elem.caption
    assert "More text after the figure" in modified
    print("PASS: test_extract_figures")


def test_extract_display_math():
    body = r"""
We define the loss function as:
\begin{equation}
\mathcal{L} = \sum_{i=1}^{N} \ell(f(x_i), y_i)
\label{eq:loss}
\end{equation}
This minimizes the empirical risk.

The gradient is:
\[ \nabla_\theta \mathcal{L} = 0 \]
Which gives us the optimum.
"""
    modified, elements = extract_elements(body)

    math_elements = [e for e in elements if e.element_type == "display_math"]
    assert len(math_elements) == 2

    # Check both placeholders are in the modified text
    assert "HYBRID_ELEMENT_DISPLAY_MATH_001" in modified
    assert "HYBRID_ELEMENT_DISPLAY_MATH_002" in modified

    # Original math should be gone from modified body
    assert "\\begin{equation}" not in modified
    assert "\\nabla_\\theta" not in modified

    # Prose should be preserved
    assert "We define the loss function as:" in modified
    assert "This minimizes the empirical risk." in modified
    assert "Which gives us the optimum." in modified

    print("PASS: test_extract_display_math")


def test_extract_tables():
    body = r"""
Results are shown below.

\begin{table}[h]
\centering
\caption{Performance comparison of models on benchmark tasks.}
\begin{tabular}{lcc}
\hline
Model & Accuracy & F1 \\
\hline
GPT-4 & 89.2 & 87.1 \\
Claude & 91.3 & 89.5 \\
\hline
\end{tabular}
\label{tab:results}
\end{table}

The results confirm our hypothesis.
"""
    modified, elements = extract_elements(body)

    table_elements = [e for e in elements if e.element_type == "table"]
    assert len(table_elements) == 1
    assert "HYBRID_ELEMENT_TABLE_001" in modified
    assert "Performance comparison" in table_elements[0].caption
    assert "The results confirm our hypothesis." in modified
    print("PASS: test_extract_tables")


def test_extract_algorithms():
    body = r"""
Our approach is described in Algorithm 1.

\begin{algorithm}
\caption{Greedy Selection}
\begin{algorithmic}
\STATE Initialize $S \leftarrow \emptyset$
\FOR{$i = 1$ to $n$}
    \STATE $S \leftarrow S \cup \{v_i\}$
\ENDFOR
\RETURN $S$
\end{algorithmic}
\end{algorithm}

This runs in O(n) time.
"""
    modified, elements = extract_elements(body)

    algo_elements = [e for e in elements if e.element_type == "algorithm"]
    assert len(algo_elements) == 1
    assert "HYBRID_ELEMENT_ALGORITHM_001" in modified
    assert "This runs in O(n) time." in modified
    print("PASS: test_extract_algorithms")


def test_get_display_math_inner():
    from hybrid_scripter.element_extractor import ExtractedElement

    # Test equation environment
    elem = ExtractedElement(
        element_id="DISPLAY_MATH_001",
        element_type="display_math",
        raw_latex=r"\begin{equation}x^2 + y^2 = z^2\label{eq:pyth}\end{equation}",
        placeholder="HYBRID_ELEMENT_DISPLAY_MATH_001",
    )
    inner = get_display_math_inner(elem)
    assert "x^2 + y^2 = z^2" in inner
    assert "\\label" not in inner

    # Test \[...\]
    elem2 = ExtractedElement(
        element_id="DISPLAY_MATH_002",
        element_type="display_math",
        raw_latex=r"\[a + b = c\]",
        placeholder="HYBRID_ELEMENT_DISPLAY_MATH_002",
    )
    inner2 = get_display_math_inner(elem2)
    assert inner2 == "a + b = c"

    print("PASS: test_get_display_math_inner")


def test_mixed_extraction():
    """Test extraction with a realistic paper body containing all element types."""
    body = r"""
\begin{abstract}
We propose a novel method for image classification.
\end{abstract}

\section{Introduction}
Deep learning has been successful. The architecture is shown in Figure~\ref{fig:arch}.

\begin{figure}[t]
\includegraphics[width=\linewidth]{figs/arch}
\caption{Model architecture.}
\end{figure}

\section{Method}
The loss is defined as:
\begin{align}
L &= \sum_i \ell_i \\
\ell_i &= -\log p(y_i | x_i)
\end{align}

\begin{table}[h]
\caption{Results on ImageNet.}
\begin{tabular}{lc}
Model & Top-1 \\
Ours & 82.3 \\
\end{tabular}
\end{table}

\section{Conclusion}
Our method achieves state-of-the-art results.
"""
    modified, elements = extract_elements(body)

    # Count by type
    types = {}
    for e in elements:
        types[e.element_type] = types.get(e.element_type, 0) + 1

    assert types.get("figure", 0) == 1
    assert types.get("table", 0) == 1
    assert types.get("display_math", 0) == 1

    # All prose should be preserved
    assert "We propose a novel method" in modified
    assert "Deep learning has been successful" in modified
    assert "Our method achieves state-of-the-art" in modified

    # All placeholders should be in the modified body
    assert "HYBRID_ELEMENT_FIGURE_001" in modified
    assert "HYBRID_ELEMENT_TABLE_001" in modified
    assert "HYBRID_ELEMENT_DISPLAY_MATH_001" in modified

    print("PASS: test_mixed_extraction")


def test_dollar_display_math():
    body = r"""
The result is:
$$E = mc^2$$
which is Einstein's equation.
"""
    modified, elements = extract_elements(body)
    assert len(elements) == 1
    assert elements[0].element_type == "display_math"
    assert "HYBRID_ELEMENT_DISPLAY_MATH_001" in modified
    assert "which is Einstein's equation." in modified
    print("PASS: test_dollar_display_math")


def test_placeholders_survive_regex_pipeline():
    """Verify that HYBRID_ELEMENT placeholders survive the regex processing pipeline."""
    from regex_scripter.latex_parser import (
        _strip_non_prose,
        _convert_structure_to_speech,
        _normalize_paragraphs,
        _strip_citations,
        _convert_greek_letters,
        _handle_math,
        _strip_formatting_tags,
        _normalize_text,
    )
    from regex_scripter.script_builder import finalize_body

    # Simulate a body with placeholders already inserted
    body = r"""
\section{Introduction}
Deep learning has been very successful in many tasks.

HYBRID_ELEMENT_FIGURE_001

As shown above, the model architecture uses attention.

\section{Method}
The loss function is:

HYBRID_ELEMENT_DISPLAY_MATH_001

We minimize this using gradient descent.

HYBRID_ELEMENT_TABLE_001

The results confirm our hypothesis.
"""
    # Run through the full regex pipeline
    body = _strip_non_prose(body)
    body = _convert_structure_to_speech(body)
    body = _normalize_paragraphs(body)
    body = _strip_citations(body)
    body = _convert_greek_letters(body)
    body = _handle_math(body)
    body = _strip_formatting_tags(body)
    body = _normalize_text(body)
    body = finalize_body(body)

    # Check all placeholders survived
    assert "HYBRID_ELEMENT_FIGURE_001" in body, f"FIGURE placeholder lost! Body:\n{body[:500]}"
    assert "HYBRID_ELEMENT_DISPLAY_MATH_001" in body, f"MATH placeholder lost! Body:\n{body[:500]}"
    assert "HYBRID_ELEMENT_TABLE_001" in body, f"TABLE placeholder lost! Body:\n{body[:500]}"

    # Check prose survived
    assert "Deep learning" in body
    assert "gradient descent" in body

    print("PASS: test_placeholders_survive_regex_pipeline")


if __name__ == "__main__":
    test_extract_figures()
    test_extract_display_math()
    test_extract_tables()
    test_extract_algorithms()
    test_get_display_math_inner()
    test_mixed_extraction()
    test_dollar_display_math()
    test_placeholders_survive_regex_pipeline()
    print("\nAll tests passed!")
