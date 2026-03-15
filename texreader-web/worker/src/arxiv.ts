/**
 * ArXiv URL parsing and metadata scraping.
 */

/** Extract an arXiv ID (YYMM.NNNNN), stripping any version suffix (e.g. v1, v12). */
export function parseArxivId(input: string): string | null {
  const m = input.trim().match(/(\d{4}\.\d{4,5})(v\d+)?/);
  return m ? m[1] : null; // m[1] is the base ID without version suffix
}

/** Build the canonical arXiv abstract page URL. */
export function arxivAbsUrl(id: string): string {
  return `https://arxiv.org/abs/${id}`;
}

/** Build the TeX source download URL. */
export function arxivSrcUrl(id: string): string {
  return `https://arxiv.org/src/${id}`;
}

export interface ArxivMetadata {
  id: string;
  arxiv_url: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string;
  tex_source_url: string;
}

/**
 * Scrape metadata from an arXiv abstract page.
 * Throws if the page can't be fetched or TeX source isn't available.
 */
export async function scrapeArxivMetadata(arxivId: string): Promise<ArxivMetadata> {
  const absUrl = arxivAbsUrl(arxivId);

  const response = await fetch(absUrl, {
    headers: { "User-Agent": "TexReader/1.0 (research paper narration tool)" },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Paper not found on arXiv: ${arxivId}`);
    }
    throw new Error(`Failed to fetch arXiv page (${response.status})`);
  }

  const html = await response.text();

  // Parse title
  const titleMatch = html.match(/<h1 class="title mathjax">(?:<span[^>]*>Title:<\/span>\s*)?([\s\S]*?)<\/h1>/i);
  const title = titleMatch
    ? stripHtml(titleMatch[1]).trim()
    : "Untitled";

  // Parse authors
  const authorsBlockMatch = html.match(/<div class="authors">([\s\S]*?)<\/div>/i);
  let authors: string[] = [];
  if (authorsBlockMatch) {
    const authorLinks = authorsBlockMatch[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of authorLinks) {
      const name = stripHtml(m[1]).trim();
      if (name) authors.push(name);
    }
  }

  // Parse abstract
  const abstractMatch = html.match(
    /<blockquote class="abstract mathjax">\s*(?:<span[^>]*>Abstract:<\/span>\s*)?([\s\S]*?)<\/blockquote>/i
  );
  const abstract = abstractMatch
    ? stripHtml(abstractMatch[1]).trim()
    : "";

  // Parse date — extract first submission date as ISO (YYYY-MM-DD)
  const dateMatch = html.match(/<div class="dateline">([\s\S]*?)<\/div>/i);
  const rawDate = dateMatch ? stripHtml(dateMatch[1]).replace(/[\[\]]/g, "").trim() : "";
  const published_date = parseSubmissionDate(rawDate);

  // Check for TeX source availability
  // Look for the "Other formats" / source link
  const hasTexSource =
    html.includes(`/src/${arxivId}`) ||
    html.includes("/format/") ||
    html.includes("Download source");

  if (!hasTexSource) {
    // Double-check with a HEAD request to the src URL
    const srcCheck = await fetch(arxivSrcUrl(arxivId), {
      method: "HEAD",
      headers: { "User-Agent": "TexReader/1.0" },
    });
    if (!srcCheck.ok) {
      throw new Error(
        "This paper doesn't have LaTeX source available. Only papers with TeX source can be narrated."
      );
    }
  }

  return {
    id: arxivId,
    arxiv_url: absUrl,
    title,
    authors,
    abstract,
    published_date,
    tex_source_url: arxivSrcUrl(arxivId),
  };
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Parse arXiv dateline like "Submitted on 27 Mar 2024 (v1), ..." into "2024-03-27". */
function parseSubmissionDate(raw: string): string {
  const m = raw.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/);
  if (!m) return raw;
  const day = m[1].padStart(2, "0");
  const month = MONTHS[m[2]];
  return `${m[3]}-${month}-${day}`;
}

function stripHtml(html: string): string {
  return cleanLatex(
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
  );
}

/** Strip LaTeX commands/markup from text, leaving readable plain text. */
function cleanLatex(text: string): string {
  return text
    // Remove $...$ math delimiters but keep content
    .replace(/\$([^$]*)\$/g, "$1")
    // \textit{...}, \textbf{...}, \emph{...}, \text{...}, \mathrm{...}, etc.
    .replace(/\\(?:textit|textbf|textsc|textrm|textsf|texttt|emph|text|mathrm|mathbf|mathit|mathcal|mathbb)\{([^}]*)\}/g, "$1")
    // \href{url}{text} → text
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1")
    // \url{...} → the URL
    .replace(/\\url\{([^}]*)\}/g, "$1")
    // \cite{...}, \ref{...}, \label{...} → remove entirely
    .replace(/\\(?:cite|ref|label|eqref|cref|Cref)\{[^}]*\}/g, "")
    // Common LaTeX symbols
    .replace(/\\pm\b/g, "±")
    .replace(/\\times\b/g, "×")
    .replace(/\\approx\b/g, "≈")
    .replace(/\\leq?\b/g, "≤")
    .replace(/\\geq?\b/g, "≥")
    .replace(/\\neq\b/g, "≠")
    .replace(/\\infty\b/g, "∞")
    .replace(/\\alpha\b/g, "α")
    .replace(/\\beta\b/g, "β")
    .replace(/\\gamma\b/g, "γ")
    .replace(/\\delta\b/g, "δ")
    .replace(/\\epsilon\b/g, "ε")
    .replace(/\\lambda\b/g, "λ")
    .replace(/\\mu\b/g, "μ")
    .replace(/\\pi\b/g, "π")
    .replace(/\\sigma\b/g, "σ")
    .replace(/\\theta\b/g, "θ")
    .replace(/\\omega\b/g, "ω")
    .replace(/\\ldots\b/g, "…")
    .replace(/\\cdots?\b/g, "…")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\\$/g, "$")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    // \foo{content} → content (catch remaining commands with braced args)
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1")
    // Remaining backslash commands with no args: \foo → remove
    .replace(/\\[a-zA-Z]+\b/g, "")
    // TeX-style quotes: `` ... '' → "..."
    .replace(/``/g, "\u201C")
    .replace(/''/g, "\u201D")
    .replace(/`/g, "\u2018")
    // Clean up braces left over
    .replace(/[{}]/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}
