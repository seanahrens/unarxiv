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
      return { text: stripped || text, date, scriptType: versionId ? "upgraded" : "base", versionId: versionId ?? null, llmProvider: null, llmModel: null, createdAt: null };
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

        setTranscripts(txMap);

        // Default to highest quality transcript
        if (premiumVersions.length > 0 && txMap.has(`v${premiumVersions[0].id}`)) {
          setActiveTab(`v${premiumVersions[0].id}`);
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

  // Build tab label
  const tabLabel = (key: string): string => {
    if (key === "base") return "Programmatic Script";
    const vId = parseInt(key.slice(1));
    const v = versions.find(ver => ver.id === vId);
    if (!v) return "AI Script";
    return `AI Script (${formatLlmModel(v.llm_model)})`;
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

      {/* Metadata line: script type + provenance details */}
      {activeTranscript && (
        <div className="mb-3">
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
              return parts.join(" \u00B7 ");
            })()}
          </p>
        </div>
      )}

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
        <pre className="whitespace-pre-wrap text-sm text-stone-800 leading-relaxed font-sans">
          {activeTranscript?.text ?? "No transcript available."}
        </pre>
      </div>
    </div>
  );
}
