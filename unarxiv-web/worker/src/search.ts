/**
 * Search query parser and formatters for FTS5 and arXiv API.
 *
 * Supports:
 *   "quoted phrases"    — exact phrase match
 *   -term / -"phrase"   — negation
 *   term1 OR term2      — disjunction
 *   bare words          — AND with prefix matching (default)
 */

export type SearchToken =
  | { type: "phrase"; value: string; negated: boolean }
  | { type: "word"; value: string; negated: boolean }
  | { type: "or" };

/** Tokenize a user search query into structured tokens. */
export function parseSearchQuery(input: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    // Skip whitespace
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }

    // Check for OR keyword (must be uppercase, surrounded by whitespace/boundaries)
    if (
      s[i] === "O" &&
      s[i + 1] === "R" &&
      (i + 2 >= s.length || /\s/.test(s[i + 2])) &&
      (i === 0 || /\s/.test(s[i - 1]))
    ) {
      tokens.push({ type: "or" });
      i += 2;
      continue;
    }

    // Check for negation prefix
    const negated = s[i] === "-";
    if (negated) i++;

    // Quoted phrase
    if (i < s.length && s[i] === '"') {
      i++; // skip opening quote
      const start = i;
      while (i < s.length && s[i] !== '"') i++;
      const phrase = s.slice(start, i).trim();
      if (i < s.length) i++; // skip closing quote
      if (phrase) {
        tokens.push({ type: "phrase", value: phrase, negated });
      }
      continue;
    }

    // Bare word
    const start = i;
    while (i < s.length && !/\s/.test(s[i]) && s[i] !== '"') i++;
    const word = s.slice(start, i);
    if (word) {
      tokens.push({ type: "word", value: word, negated });
    }
  }

  // Clean up: strip leading/trailing OR tokens
  while (tokens.length > 0 && tokens[0].type === "or") tokens.shift();
  while (tokens.length > 0 && tokens[tokens.length - 1].type === "or")
    tokens.pop();

  return tokens;
}

/** Format tokens as an FTS5 MATCH query.
 *  FTS5's NOT is binary — `A NOT B C` means `A NOT (B C)` — so we must
 *  collect all positive terms first, then append negations at the end:
 *    positive_expr NOT (neg1 OR neg2 OR ...)
 */
export function toFtsQuery(tokens: SearchToken[]): string {
  const positive: string[] = [];
  const negative: string[] = [];

  for (const token of tokens) {
    if (token.type === "or") {
      positive.push("OR");
      continue;
    }

    let term: string;
    if (token.type === "phrase") {
      term = `"${token.value}"`;
    } else {
      const clean = token.value.replace(/['"]/g, "");
      if (!clean) continue;
      term = `"${clean}"*`;
    }

    if (token.negated) {
      negative.push(term);
    } else {
      positive.push(term);
    }
  }

  // Clean trailing/leading OR
  while (positive.length > 0 && positive[0] === "OR") positive.shift();
  while (positive.length > 0 && positive[positive.length - 1] === "OR")
    positive.pop();

  let result = positive.join(" ");
  if (negative.length > 0 && result) {
    result += ` NOT (${negative.join(" OR ")})`;
  }

  return result;
}

/** Format tokens as an arXiv API search_query string. */
export function toArxivQuery(tokens: SearchToken[]): string {
  const parts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "or") {
      parts.push("OR");
      continue;
    }

    // Add implicit AND between consecutive non-OR terms
    if (parts.length > 0 && parts[parts.length - 1] !== "OR") {
      if (token.negated) {
        parts.push("ANDNOT");
      } else {
        parts.push("AND");
      }
    } else if (parts.length === 0 && token.negated) {
      // Leading negation — arXiv can't start with ANDNOT, skip it
      continue;
    } else if (parts[parts.length - 1] === "OR" && token.negated) {
      // OR followed by negation doesn't make sense for arXiv, skip the OR
      parts.pop();
      if (parts.length > 0) parts.push("ANDNOT");
      else continue;
    }

    if (token.type === "phrase") {
      parts.push(`all:"${token.value}"`);
    } else {
      const clean = token.value.replace(/['"]/g, "");
      if (!clean) continue;
      parts.push(`all:${clean}`);
    }
  }

  return parts.join(" ");
}
