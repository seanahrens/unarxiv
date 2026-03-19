"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useNavigationHistory } from "@/contexts/NavigationHistoryContext";
import NarrationProgress from "@/components/NarrationProgress";
import TurnstileWidget from "@/components/TurnstileWidget";
import { fetchPaper, previewPaper, submitPaper, recordVisit, fetchRating, submitRating, deleteRating, requestNarration, isInProgress, formatPaperDate, type Paper, type Rating } from "@/lib/api";
import { PaperDetailSkeleton } from "@/components/Skeleton";
import { isRead as checkIsRead, markAsRead, markAsUnread } from "@/lib/readStatus";
import { usePlaylist } from "@/contexts/PlaylistContext";
import PaperActionButton from "@/components/PaperActionButton";

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
          data-testid={`rate-narration-star-${star}`}
          className={`transition-all ${
            star <= (hover || value) ? "text-amber-400" : "text-stone-300"
          } hover:scale-110`}
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
    <div data-testid="rating-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
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


function BackButton() {
  const router = useRouter();
  const { previousLabel, hasHistory } = useNavigationHistory();

  const handleBack = () => {
    if (hasHistory) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 transition-colors mb-4 border border-stone-300 rounded-full px-3 py-1"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="2,12 22,2 22,22" /></svg>
      Back to {previousLabel}
    </button>
  );
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
    // Optimistically show progress bar immediately (before any network calls)
    setPaper({ ...paper, status: "queued" });
    try {
      const updated = await requestNarration(paper.id);
      setPaper(updated);
    } catch (e: any) {
      // Revert optimistic update on failure
      setPaper(paper);
      // If the server requires Turnstile verification (currently disabled but kept for future),
      // show the captcha modal; otherwise surface the error directly.
      if ((e.message || "").includes("Turnstile")) {
        setShowCaptchaModal(true);
      } else {
        setNarrationError(e.message || "Failed to request narration");
      }
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
    return <PaperDetailSkeleton />;
  }

  if (error || !paper) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-3">{error || "Paper not found"}</p>
        <BackButton />
      </div>
    );
  }

  const isReady = paper.status === "complete";
  const isFailed = paper.status === "failed";
  const isNotRequested = paper.status === "not_requested";
  const isProcessing = isInProgress(paper.status);
  const authors: string[] = paper.authors || [];

  return (
    <div>
      <BackButton />

      <article className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
          <h1 className="text-2xl font-bold text-stone-900 leading-tight flex-1">
            {paper.title || "Untitled"}
          </h1>
          <PaperActionButton
            paper={paper}
            onRate={() => setShowRatingModal(true)}
            onGenerate={handleRequestNarration}
            generateDisabled={narrationLoading}
            onAddToPlaylist={handleAddToPlaylist}
            onRemoveFromPlaylist={(rect) => removeFromPlaylist(paper.id, rect)}
          />
          {/* Hidden poller for processing state — drives status updates & completion */}
          {isProcessing && !narrationLoading && (
            <div className="hidden">
              <NarrationProgress paperId={paper.id} onComplete={handleComplete} onStatusChange={handleComplete} />
            </div>
          )}
        </div>

        <p className="text-sm text-stone-500 mb-2">
          {authors.length > 0 && (
            <span className="font-semibold text-stone-700">{authors.join(", ")}</span>
          )}
          {authors.length > 0 && paper.published_date && <span> &middot; </span>}
          {paper.published_date && (
            <span>{formatPaperDate(paper.published_date)}</span>
          )}
          <span> &middot; </span>
          <CopyableId id={paper.id} />
        </p>

        {narrationError && (
          <div className="mb-2">
            <span className="text-xs text-red-600">{narrationError}</span>
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
