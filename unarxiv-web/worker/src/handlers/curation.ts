import type { Env } from "../types";
import { getPaper, insertPaper, claimPaperForNarration, addListItems } from "../db";
import { scrapeArxivMetadata } from "../arxiv";
import { dispatchToModal } from "./narration";

interface HFPaperEntry {
  paper: { id: string; title: string; upvotes: number };
}

/**
 * Cron job (hourly): fetch top HuggingFace community papers, add the highest-ranked
 * one not already in the DB, queue it for narration, and add it to the HF list.
 * Candidate priority: top-25 monthly → top-25 weekly → top-25 daily (by upvotes).
 */
export async function curateHuggingFaceTopPapers(env: Env): Promise<void> {
  const baseUrl = "https://api.unarxiv.org";

  async function fetchPeriod(period: string): Promise<HFPaperEntry[]> {
    const res = await fetch(`https://huggingface.co/api/daily_papers?period=${period}&limit=50`);
    if (!res.ok) return [];
    const data: HFPaperEntry[] = await res.json();
    return data.sort((a, b) => b.paper.upvotes - a.paper.upvotes).slice(0, 25);
  }

  try {
    const [monthly, weekly, daily] = await Promise.all([
      fetchPeriod("monthly"),
      fetchPeriod("weekly"),
      fetchPeriod("daily"),
    ]);

    // Build deduplicated candidate list: monthly → weekly → daily
    const seen = new Set<string>();
    const candidates: HFPaperEntry[] = [];
    for (const entry of [...monthly, ...weekly, ...daily]) {
      if (!seen.has(entry.paper.id)) {
        seen.add(entry.paper.id);
        candidates.push(entry);
      }
    }

    // Find the first candidate not already in the DB
    for (const entry of candidates) {
      const arxivId = entry.paper.id;
      const existing = await getPaper(env.DB, arxivId);
      if (existing) continue;

      // Scrape metadata from arXiv and insert
      let metadata;
      try {
        metadata = await scrapeArxivMetadata(arxivId);
      } catch (e: any) {
        console.error(`[hf-curate] Failed to scrape ${arxivId}: ${e.message}`);
        continue;
      }

      await insertPaper(env.DB, {
        id: metadata.id,
        arxiv_url: metadata.arxiv_url,
        title: metadata.title,
        authors: metadata.authors,
        abstract: metadata.abstract,
        published_date: metadata.published_date,
        submitted_by_ip: "cron",
      });

      // Claim for narration and dispatch to Modal
      const claimed = await claimPaperForNarration(env.DB, arxivId);
      if (claimed) {
        const paper = await getPaper(env.DB, arxivId);
        if (paper) {
          void dispatchToModal(env, paper, baseUrl).catch((e: any) =>
            console.error(`[hf-curate] Modal dispatch failed for ${arxivId}: ${e.message}`)
          );
        }
      }

      // Add to the HF Top Papers list
      if (env.HF_LIST_ID) {
        try {
          await addListItems(env.DB, env.HF_LIST_ID, [arxivId]);
        } catch (e: any) {
          console.error(`[hf-curate] Failed to add ${arxivId} to list: ${e.message}`);
        }
      }

      console.log(`[hf-curate] Added ${arxivId} "${entry.paper.title}" (${entry.paper.upvotes} upvotes)`);
      return; // Only add 1 paper per run
    }

    console.log("[hf-curate] All candidates already in unarxiv — nothing to add.");
  } catch (e: any) {
    console.error("[hf-curate] Error:", e.message);
  }
}
