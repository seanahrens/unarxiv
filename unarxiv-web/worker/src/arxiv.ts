/**
 * ArXiv URL parsing and metadata scraping.
 */
import { parseSearchQuery, toArxivQuery } from "./search";

/** Extract an arXiv ID, supporting both new format (YYMM.NNNNN) and old format (category/YYMMNNN).
 *  Strips any version suffix (e.g. v1, v12). */
export function parseArxivId(input: string): string | null {
  const trimmed = input.trim();
  // New format: 2103.12345 or 2103.12345v2
  const newFmt = trimmed.match(/(\d{4}\.\d{4,5})(v\d+)?/);
  if (newFmt) return newFmt[1];
  // Old format: astro-ph/9903245 or hep-th/0601234v1
  const oldFmt = trimmed.match(/([a-z-]+\/\d{7})(v\d+)?/i);
  if (oldFmt) return oldFmt[1];
  return null;
}

/** Build the canonical arXiv abstract page URL. */
export function arxivAbsUrl(id: string): string {
  return `https://arxiv.org/abs/${id}`;
}

/** Build the TeX source download URL. */
export function arxivSrcUrl(id: string): string {
  return `https://arxiv.org/src/${id}`;
}

/** Build the PDF download URL. */
export function arxivPdfUrl(id: string): string {
  return `https://arxiv.org/pdf/${id}`;
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
 * Fetch metadata for a single paper from the arXiv Atom API.
 * Throws if the paper is not found.
 */
export async function scrapeArxivMetadata(arxivId: string): Promise<ArxivMetadata> {
  const apiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}&max_results=1`;

  const response = await fetch(apiUrl, {
    headers: { "User-Agent": "unarXiv/1.0 (research paper narration tool)" },
  });

  if (!response.ok) {
    throw new Error(`arXiv API error (${response.status})`);
  }

  const xml = await response.text();

  // Check if the API returned an entry
  if (!xml.includes("<entry>")) {
    throw new Error(`Paper not found on arXiv: ${arxivId}`);
  }

  const entry = xml.split("<entry>")[1] || "";

  // Title
  const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch
    ? decodeXmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim()
    : "Untitled";

  // Check for "not found" placeholder entries
  if (title.toLowerCase().startsWith("error")) {
    throw new Error(`Paper not found on arXiv: ${arxivId}`);
  }

  // Authors
  const authors: string[] = [];
  const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
  for (const m of authorMatches) {
    authors.push(decodeXmlEntities(m[1]).trim());
  }

  // Abstract (called <summary> in Atom)
  const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
  const abstract = summaryMatch
    ? decodeXmlEntities(summaryMatch[1]).replace(/\s+/g, " ").trim()
    : "";

  // Published date → YYYY-MM-DD
  const pubMatch = entry.match(/<published>(\d{4}-\d{2}-\d{2})/);
  const published_date = pubMatch ? pubMatch[1] : "";

  return {
    id: arxivId,
    arxiv_url: arxivAbsUrl(arxivId),
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

// ─── ArXiv API Search ────────────────────────────────────────────────────────

export interface ArxivSearchResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string;
  arxiv_url: string;
}

export interface ArxivSearchResponse {
  papers: ArxivSearchResult[];
  total: number;
}

/**
 * Search the arXiv API (Atom feed) for papers matching a query.
 * Returns parsed results and total count.
 */
export async function searchArxiv(
  query: string,
  start: number,
  maxResults: number
): Promise<ArxivSearchResponse> {
  const params = new URLSearchParams({
    search_query: toArxivQuery(parseSearchQuery(query)),
    start: String(start),
    max_results: String(maxResults),
    sortBy: "relevance",
    sortOrder: "descending",
  });

  const res = await fetch(`https://export.arxiv.org/api/query?${params}`, {
    headers: { "User-Agent": "unarXiv/1.0 (research paper narration tool)" },
  });

  if (!res.ok) {
    throw new Error(`arXiv API error: ${res.status}`);
  }

  const xml = await res.text();

  // Parse total results
  const totalMatch = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;

  // Parse entries
  const papers: ArxivSearchResult[] = [];
  const entries = xml.split(/<entry>/);
  // First chunk is the feed header, skip it
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];

    // Extract arXiv ID from <id> URL
    const idMatch = entry.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
    if (!idMatch) continue;
    // Strip version suffix (e.g. "2401.12345v1" → "2401.12345")
    const rawId = idMatch[1];
    const id = rawId.replace(/v\d+$/, "");

    // Title
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch
      ? decodeXmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim()
      : "Untitled";

    // Authors
    const authors: string[] = [];
    const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
    for (const m of authorMatches) {
      authors.push(decodeXmlEntities(m[1]).trim());
    }

    // Abstract (called <summary> in Atom)
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const abstract = summaryMatch
      ? decodeXmlEntities(summaryMatch[1]).replace(/\s+/g, " ").trim()
      : "";

    // Published date → YYYY-MM-DD
    const pubMatch = entry.match(/<published>(\d{4}-\d{2}-\d{2})/);
    const published_date = pubMatch ? pubMatch[1] : "";

    papers.push({
      id,
      title,
      authors,
      abstract,
      published_date,
      arxiv_url: `https://arxiv.org/abs/${id}`,
    });
  }

  return { papers, total };
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
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
