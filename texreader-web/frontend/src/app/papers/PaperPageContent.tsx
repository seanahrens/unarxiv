"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import ProgressTracker from "@/components/ProgressTracker";
import TurnstileWidget from "@/components/TurnstileWidget";
import { fetchPaper, recordVisit, audioUrl, transcriptUrl, fetchRating, submitRating, deleteRating, requestNarration, checkNarrationRateLimit, type Paper, type Rating } from "@/lib/api";
import { isRead as checkIsRead, markAsRead, markAsUnread } from "@/lib/readStatus";

function DownloadButton({ url, filename, label }: { url: string; filename: string; label: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
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
  }, [url, filename]);

  const colorClass = label.includes("MP3")
    ? "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100"
    : label.includes("Transcript")
    ? "text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100"
    : "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100";

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={`inline-flex items-center justify-center gap-1.5 px-3 h-[42px] text-xs font-medium
                 rounded-xl transition-colors disabled:opacity-50 border cursor-pointer ${colorClass}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {downloading ? "..." : label}
    </button>
  );
}

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [id]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center text-stone-400 hover:text-stone-600 transition-colors ml-1"
      title="Copy arXiv ID"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
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

function DisplayStars({ rating }: { rating: number }) {
  return (
    <div className="inline-flex gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon key={star} filled={star <= rating} />
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
        <h3 className="text-lg font-bold text-stone-900 mb-4">Rate Narration</h3>

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
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

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
    return <div className="text-center py-20 text-stone-400">Loading...</div>;
  }

  if (error || !paper) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-3">{error || "Paper not found"}</p>
        <a href="/" className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
          &larr; Back to papers
        </a>
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
      <a
        href="/"
        className="text-sm text-stone-400 hover:text-stone-600 transition-colors mb-4 inline-block"
      >
        &larr; Back to papers
      </a>

      <article className="mb-8">
        <h1 className="text-2xl font-bold text-stone-900 leading-tight mb-3">
          {paper.title || "Untitled"}
        </h1>

        {authors.length > 0 && (
          <p className="text-stone-500 mb-3">{authors.join(", ")}</p>
        )}

        <div className="flex items-center gap-2 text-sm text-stone-400 mb-5">
          {paper.published_date && (
            <span>{formatDate(paper.published_date)}</span>
          )}
          <span>&middot;</span>
          <span className="font-mono">{paper.id}</span>
          <CopyIdButton id={paper.id} />
        </div>

        {/* Buttons + compact player on same row */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a
            href={paper.arxiv_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 h-[42px] text-xs font-medium
                       text-stone-600 bg-stone-100 border border-stone-200 hover:bg-stone-200
                       rounded-xl transition-colors no-underline"
          >
            arXiv
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <DownloadButton
            url={`https://arxiv.org/pdf/${paper.id}`}
            filename={`${paper.published_date?.slice(0, 4) || ""} - ${paper.title} - ${paper.authors?.[0] || "Unknown"} - unarXiv.org - ${paper.id}.pdf`}
            label="PDF"
          />
          {isNotRequested && (
            <button
              onClick={handleRequestNarration}
              disabled={narrationLoading}
              className="inline-flex items-center justify-center gap-1.5 px-3 h-[42px] text-xs font-medium
                         text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700
                         rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {narrationLoading ? "Starting..." : "Generate Audio Narration"}
            </button>
          )}
          {narrationError && (
            <span className="text-xs text-red-600">{narrationError}</span>
          )}
          {isReady && (
            <DownloadButton
              url={audioUrl(paper.id)}
              filename={`${paper.published_date?.slice(0, 4) || ""} - ${paper.title} - ${paper.authors?.[0] || "Unknown"} - unarXiv.org - ${paper.id}.mp3`}
              label="MP3"
            />
          )}
          {(isReady || paper.status === "generating_audio") && (
            <DownloadButton
              url={transcriptUrl(paper.id)}
              filename={`${paper.published_date?.slice(0, 4) || ""} - ${paper.title} - ${paper.authors?.[0] || "Unknown"} - unarXiv.org - ${paper.id}.txt`}
              label="Transcript"
            />
          )}
          {isReady && (
            <button
              onClick={() => setShowRatingModal(true)}
              className={`inline-flex items-center justify-center gap-1.5 px-3 h-[42px] w-[155px] text-xs font-medium
                         rounded-xl transition-colors border cursor-pointer ${
                           myRating
                             ? "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
                             : "text-stone-600 bg-stone-50 border-stone-200 hover:bg-stone-100"
                         }`}
            >
              {myRating ? (
                <DisplayStars rating={myRating.stars} />
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Rate Narration
                </>
              )}
            </button>
          )}
          {isReady && (
            <button
              onClick={() => {
                if (paperRead) {
                  markAsUnread(paper.id);
                  setPaperRead(false);
                } else {
                  markAsRead(paper.id);
                  setPaperRead(true);
                }
              }}
              className={`inline-flex items-center justify-center gap-1.5 px-3 h-[42px] w-[130px] text-xs font-medium
                         rounded-xl transition-colors border cursor-pointer ${
                           paperRead
                             ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                             : "text-stone-600 bg-stone-50 border-stone-200 hover:bg-stone-100"
                         }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {paperRead ? "Read" : "Mark as Read"}
            </button>
          )}
          {isReady && (
            <div className="flex-1 min-w-[280px]">
              <AudioPlayer src={audioUrl(paper.id)} title={paper.title} paperId={paper.id} variant="compact" />
            </div>
          )}
          {isProcessing && (
            <div className="flex-1 min-w-[280px]">
              <ProgressTracker paperId={paper.id} onComplete={handleComplete} />
            </div>
          )}
        </div>

        {/* Generate narration button for not_requested papers — inline with other buttons */}

        {paper.abstract && (
          <p className="text-sm text-stone-600 leading-relaxed">
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

      {/* PDF viewer — always visible */}
      <div className="mt-10 border border-stone-200 rounded-xl overflow-hidden">
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
            <p className="text-sm text-stone-500 mb-5">
              Please complete the verification to continue.
            </p>
            <TurnstileWidget onVerify={handleCaptchaVerify} />
          </div>
        </div>
      )}
    </div>
  );
}
