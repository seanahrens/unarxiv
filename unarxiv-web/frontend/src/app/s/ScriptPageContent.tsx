"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchPaper, transcriptUrl, type Paper } from "@/lib/api";

export default function ScriptPageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [paper, setPaper] = useState<Paper | null>(null);
  const [script, setScript] = useState<string | null>(null);
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

        if (!["generating_audio", "complete"].includes(p.status)) {
          setError("Script not available yet");
          setLoading(false);
          return;
        }

        const res = await fetch(transcriptUrl(id));
        if (!res.ok) throw new Error("Script not found");
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
    return <div className="text-center py-20 text-slate-9000">Loading...</div>;
  }

  if (error || !paper) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-3">{error || "Paper not found"}</p>
        <Link href="/" className="text-sm text-slate-9000 hover:text-slate-300 transition-colors">
          &larr; Back to papers
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/p?id=${paper.id}`}
        className="text-sm text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block"
      >
        &larr; Back to paper
      </Link>

      <h1 className="text-xl font-bold text-slate-100 leading-tight mb-1">
        {paper.title || "Untitled"}
      </h1>
      <p className="text-sm text-slate-500 mb-6">Narration Script</p>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <pre className="whitespace-pre-wrap text-sm text-slate-200 leading-relaxed font-sans">
          {script}
        </pre>
      </div>
    </div>
  );
}
