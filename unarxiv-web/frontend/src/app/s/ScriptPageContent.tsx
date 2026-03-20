"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchPaper, transcriptUrl, type Paper } from "@/lib/api";
import { ScriptPageSkeleton } from "@/components/Skeleton";

export default function ScriptPageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [paper, setPaper] = useState<Paper | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [scriptDate, setScriptDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const res = await fetch(transcriptUrl(id));
        if (!res.ok) throw new Error("Script not found");
        const lastMod = res.headers.get("Last-Modified");
        if (lastMod) {
          const d = new Date(lastMod);
          if (!isNaN(d.getTime())) {
            setScriptDate(d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
          }
        }
        const text = await res.text();
        setScript(text);
      } catch (e: any) {
        setError(e.message || "Failed to load script");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <ScriptPageSkeleton />;
  }

  if (error || !paper) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-3">{error || "Paper not found"}</p>
        <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
          &larr; Back to admin
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-stone-400 hover:text-stone-600 transition-colors mb-4 inline-block"
      >
        &larr; Back to admin
      </Link>

      <h1 className="text-xl font-bold text-stone-900 leading-tight mb-1">
        {paper.title || "Untitled"}
      </h1>
      <p className="text-sm text-stone-400 mb-6">Narration Script</p>

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
        <pre className="whitespace-pre-wrap text-sm text-stone-800 leading-relaxed font-sans">
          {script}
        </pre>
      </div>
      {scriptDate && (
        <p className="text-xs text-stone-400 mt-2 text-right">Script written on {scriptDate}</p>
      )}
    </div>
  );
}
