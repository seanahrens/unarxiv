"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAudio } from "@/contexts/AudioContext";
import ProgressTracker from "@/components/ProgressTracker";
import TurnstileWidget from "@/components/TurnstileWidget";
import { fetchPaper, previewPaper, submitPaper, recordVisit, audioUrl, fetchRating, submitRating, deleteRating, requestNarration, checkNarrationRateLimit, formatDuration, type Paper, type Rating } from "@/lib/api";
import { isRead as checkIsRead, markAsRead, markAsUnread } from "@/lib/readStatus";
import { usePlaylist } from "@/contexts/PlaylistContext";
import AudioFileIcon from "@/components/AudioFileIcon";

const BTN_BASE = "inline-flex items-center justify-center gap-1.5 px-3 h-[42px] text-xs font-medium transition-colors border";
function useDownload() {
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(async (url: string, filename: string) => {
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  }, []);

  return { downloading, download };
}

function CopyableId({ id }: { id: string }) {
  const [toast, setToast] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    navigator.clipboard.writeText(id);
    setToast({ x: e.clientX, y: e.clientY });
    setTimeout(() => setToast(null), 1200);
  }, [id]);

  return (
    <>
      <span
        onClick={handleClick}
        className="font-mono cursor-pointer hover:text-stone-700 transition-colors"
        title="Copy arXiv ID"
      >
        {id}
      </span>
      {toast && (
        <span
          className="fixed z-50 px-2.5 py-1 text-xs font-medium text-white bg-stone-800 rounded-lg shadow-lg pointer-events-none animate-fade-out"
          style={{ left: toast.x + 8, top: toast.y - 32 }}
        >
          arXiv ID Copied to Clipboard
        </span>
      )}
    </>
  );
}

function StarIcon({ filled, half }: { filled: boolean; half?: boolean }) {
  if (half) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.5">
        <defs>
          <clipPath id="halfStar">
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
        <polygon
          points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
          fill="none"
          stroke="currentColor"
        />
        <polygon
          points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
          fill="currentColor"
          stroke="currentColor"
          clipPath="url(#halfStar)"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.5">
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
      />
    </svg>
  );
}

function StarRatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`transition-colors ${
            star <= (hover || value) ? "text-amber-400" : "text-stone-300"
          } hover:scale-110 transition-transform`}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" strokeWidth="1.5">
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
              fill={star <= (hover || value) ? "currentColor" : "none"}
              stroke="currentColor"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}


function RatingModal({
  paperId,
  existingRating,
  onClose,
  onSaved,
  onCleared,
}: {
  paperId: string;
  existingRating: Rating | null;
  onClose: () => void;
  onSaved: (r: Rating) => void;
  onCleared: () => void;
}) {
  const [stars, setStars] = useState(existingRating?.stars || 0);
  const [comment, setComment] = useState(existingRating?.comment || "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    if (stars === 0) {
      setError("Please select a rating");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await submitRating(paperId, stars, comment);
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to submit rating");
    } finally {
      setSaving(false);
    }
  }, [paperId, stars, comment, onSaved, onClose]);

  const handleClear = useCallback(async () => {
    setClearing(true);
    setError("");
    try {
      await deleteRating(paperId);
      onCleared();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to clear rating");
    } finally {
      setClearing(false);
    }
  }, [paperId, onCleared, onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-stone-900 mb-4">Rate Narration Quality</h3>

        <div className="mb-4">
          <label className="text-sm text-stone-600 mb-2 block">How was the narration quality?</label>
          <StarRatingInput value={stars} onChange={setStars} />
        </div>

        <div className="mb-4">
          <label className="text-sm text-stone-600 mb-2 block">Comments (optional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any feedback on pronunciation, pacing, or transcript quality..."
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
            rows={3}
          />
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex justify-between">
          <div>
            {existingRating && (
              <button
                onClick={handleClear}
                disabled={clearing || saving}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "Clear Rating"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || clearing || stars === 0}
              className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg
                         hover:bg-stone-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : existingRating ? "Update Rating" : "Submit Rating"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayButtonWithMenu({
  paper,
  onRate,
  inPlaylist,
  onAddToPlaylist,
  onRemoveFromPlaylist,
}: {
  paper: Paper;
  onRate: () => void;
  inPlaylist: boolean;
  onAddToPlaylist: (rect?: DOMRect) => void;
  onRemoveFromPlaylist: (rect?: DOMRect) => void;
}) {
  const { state, actions } = useAudio();
  const { downloading, download } = useDownload();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isGloballyActive = state.paperId === paper.id;
  const isPlaying = isGloballyActive && state.isPlaying;
  const isReady = paper.status === "complete";

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handlePlay = () => {
    if (isGloballyActive) {
      actions.togglePlay();
    } else {
      actions.loadPaper(paper.id, paper.title, audioUrl(paper.id));
    }
  };

  const pdfFilename = `${paper.published_date?.slice(0, 4) || ""} - ${paper.title} - ${paper.authors?.[0] || "Unknown"} - unarXiv.org - ${paper.id}.pdf`;
  const mp3Filename = `${paper.published_date?.slice(0, 4) || ""} - ${paper.title} - ${paper.authors?.[0] || "Unknown"} - unarXiv.org - ${paper.id}.mp3`;

  return (
    <div className="relative inline-flex w-full md:w-auto shrink-0" ref={menuRef}>
      <button
        onClick={handlePlay}
        className={`${BTN_BASE} min-w-[140px] flex-1 md:flex-initial gap-2 text-white bg-stone-900 border-stone-900 hover:bg-stone-700`}
        style={{ borderRadius: "0.75rem 0 0 0.75rem" }}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="7,3 21,12 7,21" />
          </svg>
        )}
        <span>{isPlaying ? "Pause" : "Play"}</span>
        {paper.duration_seconds && (
          <span className="opacity-70">{formatDuration(paper.duration_seconds)}</span>
        )}
      </button>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className={`${BTN_BASE} px-1.5 text-white bg-stone-900 border-stone-900 hover:bg-stone-700 border-l border-l-stone-700`}
        style={{ borderRadius: "0 0.75rem 0.75rem 0", marginLeft: "-1px" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-stone-300 rounded-xl shadow-lg z-50 min-w-[180px] py-1">
          <button
            onClick={() => {
              const rect = menuRef.current?.getBoundingClientRect();
              if (inPlaylist) onRemoveFromPlaylist(rect); else onAddToPlaylist(rect);
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors"
          >
            {inPlaylist ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {inPlaylist ? "Remove from Playlist" : "Add to Playlist"}
          </button>
          {isReady && (<><div className="border-t border-stone-200 mx-3" />
            <button
              onClick={() => { onRate(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Rate Narration
            </button></>
          )}
          {isReady && (<><div className="border-t border-stone-200 mx-3" />
            <button
              onClick={() => { download(audioUrl(paper.id), mp3Filename); setMenuOpen(false); }}
              disabled={downloading}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 010 7.07" />
              </svg>
              Download Audio
            </button></>
          )}
          <div className="border-t border-stone-200 mx-3" />
          <button
            onClick={() => { download(`https://arxiv.org/pdf/${paper.id}`, pdfFilename); setMenuOpen(false); }}
            disabled={downloading}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Download PDF
          </button>
          <div className="border-t border-stone-200 mx-3" />
          <a
            href={paper.arxiv_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors no-underline"
          >
            <svg width="14" height="14" viewBox="0 0 74.492 100.25" fill="currentColor">
              <path d="M586.72,255.616a3.377,3.377,0,0,1,.448.031,5.917,5.917,0,0,1,3.581,2.79c.454,1.116.314,2.023-1.315,4.141L563.168,293.6l-8.558-10.047,29.348-26.616a4.406,4.406,0,0,1,2.762-1.321m0-1.5a5.766,5.766,0,0,0-3.69,1.643l-.041.032-.038.035L553.6,282.442l-1.077.977.943,1.107,8.558,10.047,1.145,1.344,1.141-1.348,26.267-31.022.022-.027.022-.028c1.574-2.046,2.327-3.622,1.516-5.619a7.309,7.309,0,0,0-4.779-3.714,5.083,5.083,0,0,0-.64-.043Z" transform="translate(-526.086 -245.559)" />
              <path d="M553.423,284.593l8.977,10.558L597.911,337.9c.873,1.093,1.419,2.186,1.047,3.418a4.092,4.092,0,0,1-2.721,2.837,3.557,3.557,0,0,1-1.045.159,4,4,0,0,1-2.687-1.124L548.01,300.808c-3.5-3.5-2.971-8.151.436-11.558l4.977-4.657m.124-2.17L552.4,283.5l-4.976,4.656c-4.192,4.191-4.372,9.816-.473,13.714l44.521,42.4a5.485,5.485,0,0,0,3.722,1.538,5.1,5.1,0,0,0,1.483-.224,5.59,5.59,0,0,0,3.719-3.838,5.176,5.176,0,0,0-1.31-4.788l-35.53-42.767-8.988-10.571-1.019-1.2Z" transform="translate(-526.086 -245.559)" />
              <path d="M562.4,295.151l9.556,11.5,5.761-5.356a7.926,7.926,0,0,0,.041-11.743l-43.7-41.923s-1.671-2.029-3.437-2.071a4.49,4.49,0,0,0-4.23,2.718c-.688,1.651-.194,2.809,1.315,4.97l29.306,35.565Z" transform="translate(-526.086 -245.559)" />
              <path d="M553.7,306.223l-17.116,21.024c-1.255,1.337-2.032,3.683-1.331,5.367a4.587,4.587,0,0,0,4.287,2.841,4.087,4.087,0,0,0,3.082-1.523l20.328-18.9Z" transform="translate(-526.086 -245.559)" />
            </svg>
            View on arXiv
          </a>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

export default function PaperPageContent({ paperId: propId }: { paperId?: string } = {}) {
  const searchParams = useSearchParams();
  const id = propId || searchParams.get("id") || "";
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [myRating, setMyRating] = useState<Rating | null>(null);
  const [paperRead, setPaperRead] = useState(false);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [narrationError, setNarrationError] = useState("");
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const { addToPlaylist, removeFromPlaylist, isInPlaylist } = usePlaylist();
  const handleAddToPlaylist = (rect?: DOMRect) => {
    if (paperRead) {
      if (!confirm("You've already listened to this. Are you sure you want to add it to your playlist? We will unmark it as read.")) return;
      markAsUnread(id);
      setPaperRead(false);
    }
    addToPlaylist(id, rect || undefined);
  };

  useEffect(() => {
    if (!id) {
      setError("No paper ID provided");
      setLoading(false);
      return;
    }

    fetchPaper(id)
      .then((p) => {
        setPaper(p);
        recordVisit(id);
        setLoading(false);
      })
      .catch(async () => {
        // Paper not in DB — try to auto-import from arXiv
        try {
          const arxivUrl = `https://arxiv.org/abs/${id}`;
          const meta = await previewPaper(arxivUrl);
          const paper = await submitPaper(meta.arxiv_url, meta);
          setPaper(paper);
          recordVisit(paper.id);
        } catch (e: any) {
          setError(e.message || "Paper not found");
        }
        setLoading(false);
      });

    // Fetch existing rating for this user
    fetchRating(id)
      .then((r) => setMyRating(r))
      .catch(() => {});

    // Check read status from localStorage
    setPaperRead(checkIsRead(id));
  }, [id]);

  const handleComplete = useCallback((updatedPaper: Paper) => {
    setPaper(updatedPaper);
  }, []);

  const handleRequestNarration = useCallback(async () => {
    if (!paper) return;
    setNarrationLoading(true);
    setNarrationError("");
    try {
      const { captcha_required } = await checkNarrationRateLimit();
      if (captcha_required) {
        setShowCaptchaModal(true);
        setNarrationLoading(false);
        return;
      }
      const updated = await requestNarration(paper.id);
      setPaper(updated);
    } catch (e: any) {
      setNarrationError(e.message || "Failed to request narration");
    } finally {
      setNarrationLoading(false);
    }
  }, [paper]);

  const handleCaptchaVerify = useCallback(async (token: string) => {
    if (!paper) return;
    setShowCaptchaModal(false);
    setNarrationLoading(true);
    setNarrationError("");
    try {
      const updated = await requestNarration(paper.id, token);
      setPaper(updated);
    } catch (e: any) {
      setNarrationError(e.message || "Failed to request narration");
    } finally {
      setNarrationLoading(false);
    }
  }, [paper]);

  if (loading) {
    return <div className="text-center py-20 text-stone-500">Loading...</div>;
  }

  if (error || !paper) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-3">{error || "Paper not found"}</p>
        <Link href="/" className="text-sm text-stone-600 hover:text-stone-800 transition-colors">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="inline -mt-px"><polygon points="2,12 22,2 22,22" /></svg> BACK TO PAPERS
        </Link>
      </div>
    );
  }

  const isReady = paper.status === "complete";
  const isFailed = paper.status === "failed";
  const isNotRequested = paper.status === "not_requested";
  const isProcessing = !isReady && !isFailed && !isNotRequested;
  const authors: string[] = paper.authors || [];

  return (
    <div>
      <Link
        href="/"
        className="text-sm text-stone-500 hover:text-stone-700 transition-colors mb-4 inline-block"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="inline -mt-px"><polygon points="2,12 22,2 22,22" /></svg> BACK TO PAPERS
      </Link>

      <article className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
          <h1 className="text-2xl font-bold text-stone-900 leading-tight flex-1">
            {paper.title || "Untitled"}
          </h1>
          {isReady ? (
            <PlayButtonWithMenu
              paper={paper}
              onRate={() => setShowRatingModal(true)}
              inPlaylist={isInPlaylist(paper.id)}
              onAddToPlaylist={handleAddToPlaylist}
              onRemoveFromPlaylist={(rect) => removeFromPlaylist(paper.id, rect)}
            />
          ) : isNotRequested ? (
            <button
              onClick={handleRequestNarration}
              disabled={narrationLoading}
              className="inline-flex items-center justify-center gap-1.5 px-3 h-[42px] text-xs font-medium
                         text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700
                         rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {narrationLoading ? "Starting..." : "Generate Audio Narration"}
            </button>
          ) : null}
        </div>

        <p className="text-sm text-stone-500 mb-2">
          {authors.length > 0 && (
            <span className="font-semibold text-stone-700">{authors.join(", ")}</span>
          )}
          {authors.length > 0 && paper.published_date && <span> &middot; </span>}
          {paper.published_date && (
            <span>{formatDate(paper.published_date)}</span>
          )}
          <span> &middot; </span>
          <CopyableId id={paper.id} />
        </p>

        {narrationError && (
          <div className="mb-2">
            <span className="text-xs text-red-600">{narrationError}</span>
          </div>
        )}

        {isProcessing && (
          <div className="w-full mb-2">
            <ProgressTracker paperId={paper.id} onComplete={handleComplete} onStatusChange={handleComplete} />
          </div>
        )}

        {paper.abstract && (
          <p className="text-base text-stone-600 leading-relaxed">
            <span className="font-black text-stone-900 uppercase tracking-wide text-sm">Abstract</span>{" "}
            {paper.abstract}
          </p>
        )}
      </article>

      {isFailed && (
        <div className="max-w-md bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-medium text-red-800">Narration failed</p>
          {paper.error_message && (
            <p className="text-sm text-red-600 mt-1">{paper.error_message}</p>
          )}
        </div>
      )}

      {/* PDF viewer — hidden on mobile */}
      <div className="hidden md:block mt-10 border border-stone-300 rounded-xl overflow-hidden">
        <iframe
          src={`https://arxiv.org/pdf/${paper.id}#zoom=page-width`}
          className="w-full bg-white"
          style={{ height: "1245px" }}
          title={`PDF: ${paper.title}`}
        />
      </div>

      {showRatingModal && (
        <RatingModal
          paperId={paper.id}
          existingRating={myRating}
          onClose={() => setShowRatingModal(false)}
          onSaved={(r) => setMyRating(r)}
          onCleared={() => setMyRating(null)}
        />
      )}

      {showCaptchaModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCaptchaModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-stone-900 mb-2">Verification Required</h3>
            <p className="text-sm text-stone-600 mb-5">
              Please complete the verification to continue.
            </p>
            <TurnstileWidget onVerify={handleCaptchaVerify} />
          </div>
        </div>
      )}
    </div>
  );
}
