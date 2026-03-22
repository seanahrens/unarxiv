"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchPaper, transcriptUrl, getPaperVersions, type Paper, type PaperVersion } from "@/lib/api";
import { getTierFromProvider } from "@/lib/voiceTiers";
import { ScriptPageSkeleton } from "@/components/Skeleton";

interface TranscriptData {
  text: string;
  date: string | null; // formatted date+time in user's local timezone
  scriptType: "free" | "premium";
  versionId: number | null;
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
      return { text, date, scriptType: versionId ? "premium" : "free", versionId: versionId ?? null };
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
        const premiumVersions = allVersions
          .filter(v => v.version_type === "premium" || (v.quality_rank > 0))
          .sort((a, b) => b.quality_rank - a.quality_rank);

        for (const v of premiumVersions) {
          const tx = await fetchTranscript(id, v.id);
          if (tx) {
            tx.scriptType = "premium";
            const tier = getTierFromProvider(v.tts_provider);
            txMap.set(`v${v.id}`, { ...tx, scriptType: "premium" });
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

      {/* Metadata line: script type + date, top right above script */}
      {activeTranscript && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-stone-400">
            {activeTranscript.scriptType === "premium" ? "AI-Generated" : "Programmatically-Generated"} Narration Script
          </p>
          {activeTranscript.date && (
            <p className="text-xs text-stone-400">
              {activeTranscript.date}
            </p>
          )}
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
