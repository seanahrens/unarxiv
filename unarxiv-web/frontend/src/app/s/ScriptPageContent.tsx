"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchPaper, transcriptUrl, getPaperVersions, type Paper, type PaperVersion } from "@/lib/api";
import { getUpgradedVersions, formatLlmModel, formatLlmProvider } from "@/lib/versionUtils";
import { ScriptPageSkeleton } from "@/components/Skeleton";

interface TranscriptData {
  text: string;
  date: string | null; // formatted date+time in user's local timezone
  scriptType: "base" | "upgraded";
  versionId: number | null;
  llmProvider: string | null;
  llmModel: string | null;
  createdAt: string | null; // raw created_at from version
  charCount: number; // character count of the transcript text
}

export default function ScriptPageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [paper, setPaper] = useState<Paper | null>(null);
  const [versions, setVersions] = useState<PaperVersion[]>([]);
  const [transcripts, setTranscripts] = useState<Map<string, TranscriptData>>(new Map());
  const [activeTab, setActiveTab] = useState<string>("base");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTranscript = useCallback(async (paperId: string, versionId?: number): Promise<TranscriptData | null> => {
    try {
      const res = await fetch(transcriptUrl(paperId, versionId));
      if (!res.ok) return null;
      const lastMod = res.headers.get("Last-Modified");
      let date: string | null = null;
      if (lastMod) {
        const d = new Date(lastMod);
        if (!isNaN(d.getTime())) {
          date = d.toLocaleString("en-US", {
            year: "numeric", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit",
          });
        }
      }
      const text = await res.text();
      // Strip the deterministic header block (title / authors / date) from the
      // displayed transcript — the page already shows this as UI chrome, so
      // rendering it again from the raw text looks like a double header.
      // Header format (from script_builder.py _build_header):
      //   Title.\n\n[By Authors.\n\n][Published on Date.\n\n]
      const stripped = text.replace(
        /^[^\n]+\.\n\n(?:By [^\n]+\.\n\n)?(?:Published on [^\n]+\.\n\n)?/,
        ""
      );
      const finalText = stripped || text;
      return { text: finalText, date, scriptType: versionId ? "upgraded" : "base", versionId: versionId ?? null, llmProvider: null, llmModel: null, createdAt: null, charCount: finalText.length };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setError("No paper ID provided");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const p = await fetchPaper(id);
        setPaper(p);

        if (!["narrating", "narrated"].includes(p.status)) {
          setError("Script not available yet");
          setLoading(false);
          return;
        }

        // Fetch versions to find which transcripts exist
        const versionsResp = await getPaperVersions(id).catch(() => null);
        const allVersions = versionsResp?.versions ?? [];
        setVersions(allVersions);

        // Fetch base transcript
        const txMap = new Map<string, TranscriptData>();
        const baseTranscript = await fetchTranscript(id);
        if (baseTranscript) {
          txMap.set("base", baseTranscript);
        }

        // Fetch premium version transcripts
        const premiumVersions = getUpgradedVersions(allVersions);

        for (const v of premiumVersions) {
          const tx = await fetchTranscript(id, v.id);
          if (tx) {
            txMap.set(`v${v.id}`, {
              ...tx,
              scriptType: "upgraded",
              llmProvider: v.llm_provider,
              llmModel: v.llm_model,
              createdAt: v.created_at,
            });
          }
        }

        // Sort entries by createdAt (base first via epoch 0, then by date)
        const sorted = new Map(
          [...txMap.entries()].sort(([, a], [, b]) => {
            const dateA = a.createdAt ? new Date(a.createdAt + "Z").getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt + "Z").getTime() : 0;
            return dateA - dateB;
          })
        );
        setTranscripts(sorted);

        // Default to most recent AI transcript
        const aiKeys = [...sorted.entries()].filter(([, t]) => t.scriptType === "upgraded").map(([k]) => k);
        if (aiKeys.length > 0) {
          setActiveTab(aiKeys[aiKeys.length - 1]);
        } else {
          setActiveTab("base");
        }
      } catch (e: any) {
        setError(e.message || "Failed to load script");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, fetchTranscript]);

  if (loading) return <ScriptPageSkeleton />;

  if (error || !paper) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-3">{error || "Paper not found"}</p>
        <Link href={`/p?id=${id}`} className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
          &larr; Back to paper
        </Link>
      </div>
    );
  }

  const activeTranscript = transcripts.get(activeTab);
  const tabKeys = Array.from(transcripts.keys());
  const hasTabs = tabKeys.length > 1;

  // Compute average of non-null goal scores for a version (0.0–1.0 scale, displayed as x10)
  const avgScore = (v: PaperVersion): number | null => {
    const scores = [v.score_fidelity, v.score_citations, v.score_header, v.score_figures, v.score_tts].filter((s): s is number => s != null);
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  // Format char count: e.g. 1400 -> "1.4K", 52300 -> "52.3K"
  const formatCharCount = (n: number): string => {
    if (n < 1000) return `${n}`;
    return `${(n / 1000).toFixed(1)}K`;
  };

  // Build tab label — show avg score (out of 10)
  const tabLabel = (key: string): string => {
    if (key === "base") return "Programmatic Script";
    const vId = parseInt(key.slice(1));
    const v = versions.find(ver => ver.id === vId);
    if (!v) return "AI Script";
    const avg = avgScore(v);
    if (avg != null) return `AI Script (${(avg * 10).toFixed(1)})`;
    return "AI Script";
  };

  return (
    <div>
      <Link
        href={`/p?id=${id}`}
        className="text-sm text-stone-400 hover:text-stone-600 transition-colors mb-4 inline-block"
      >
        &larr; Back to paper
      </Link>

      <h1 className="text-xl font-bold text-stone-900 leading-tight mb-1">
        {paper.title || "Untitled"}
      </h1>

      {/* Tabs for switching between script versions */}
      {hasTabs && (
        <div className="flex gap-1 mb-3 border-b border-stone-200">
          {tabKeys.map(key => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? "border-stone-700 text-stone-800"
                  : "border-transparent text-stone-400 hover:text-stone-600"
              }`}
            >
              {tabLabel(key)}
            </button>
          ))}
        </div>
      )}

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
        {/* Metadata inside the container */}
        {activeTranscript && (
          <div className="mb-4 pb-4 border-b border-stone-200">
            <p className="text-sm text-stone-400 mb-1">
              {activeTranscript.scriptType === "upgraded" ? "AI-Generated" : "Programmatically-Generated"} Narration Script
            </p>
            <p className="text-xs text-stone-400">
              {(() => {
                const parts: string[] = [];
                if (activeTranscript.scriptType === "upgraded") {
                  const provider = formatLlmProvider(activeTranscript.llmProvider);
                  const model = formatLlmModel(activeTranscript.llmModel);
                  parts.push(provider ? `${provider} / ${model}` : model);
                } else {
                  parts.push("Regex Parser");
                }
                // Use created_at from version if available, otherwise fall back to Last-Modified header date
                const dateStr = activeTranscript.createdAt || activeTranscript.date;
                if (dateStr) {
                  const d = activeTranscript.createdAt ? new Date(dateStr + "Z") : new Date(dateStr);
                  if (!isNaN(d.getTime())) {
                    parts.push(d.toLocaleString("en-US", {
                      year: "numeric", month: "short", day: "numeric",
                      hour: "numeric", minute: "2-digit",
                    }));
                  }
                }
                parts.push(`${formatCharCount(activeTranscript.charCount)} chars`);
                return parts.join(" \u00B7 ");
              })()}
            </p>
            {/* Itemized scores */}
            {activeTranscript.scriptType === "upgraded" && activeTranscript.versionId && (() => {
              const v = versions.find(ver => ver.id === activeTranscript.versionId);
              if (!v) return null;
              const scoreItems: { label: string; value: number | null }[] = [
                { label: "Fidelity", value: v.score_fidelity },
                { label: "Citations", value: v.score_citations },
                { label: "Headers", value: v.score_header },
                { label: "Figures", value: v.score_figures },
                { label: "TTS", value: v.score_tts },
              ];
              const hasAny = scoreItems.some(s => s.value != null);
              if (!hasAny) return null;
              return (
                <p className="text-xs text-stone-400 mt-1">
                  {scoreItems.filter(s => s.value != null).map(s => `${s.label}: ${(s.value! * 10).toFixed(1)}`).join(" · ")}
                </p>
              );
            })()}
          </div>
        )}

        <pre className="whitespace-pre-wrap text-sm text-stone-800 leading-relaxed font-sans">
          {activeTranscript?.text ?? "No transcript available."}
        </pre>
      </div>
    </div>
  );
}
