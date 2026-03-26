"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useNavigationHistory } from "@/contexts/NavigationHistoryContext";
import NarrationProgress from "@/components/NarrationProgress";
import TurnstileWidget from "@/components/TurnstileWidget";
import { fetchPaper, previewPaper, submitPaper, recordVisit, fetchRating, submitRating, deleteRating, requestNarration, formatPaperDate, transcriptUrl, getPaperVersions, type Paper, type Rating, type PaperVersion } from "@/lib/api";
import { VOICE_TIERS, getBestTierFromVersions, getTierFromProvider, type VoiceTier } from "@/lib/voiceTiers";
import { getUpgradedVersions, formatLlmModel, formatLlmProvider } from "@/lib/versionUtils";
import PlusIcons from "@/components/PlusIcons";
import { PaperDetailSkeleton, Skeleton } from "@/components/Skeleton";
import { track } from "@/lib/analytics";
import { isRead as checkIsRead, markAsRead, markAsUnread } from "@/lib/readStatus";
import { usePlaylist } from "@/contexts/PlaylistContext";
import PaperActionButton from "@/components/PaperActionButton";
import UpgradeNarrationModal from "@/components/UpgradeNarrationModal";

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
  currentTier,
  canUpgrade,
  onClose,
  onSaved,
  onCleared,
  onUpgrade,
}: {
  paperId: string;
  existingRating: Rating | null;
  currentTier: VoiceTier | null;
  canUpgrade: boolean;
  onClose: () => void;
  onSaved: (r: Rating) => void;
  onCleared: () => void;
  onUpgrade?: () => void;
}) {
  const [stars, setStars] = useState(existingRating?.stars || 0);
  const [comment, setComment] = useState(existingRating?.comment || "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (stars === 0) {
      setError("Please select a rating");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await submitRating(paperId, stars, comment);
      track("rating_submitted", { arxiv_id: paperId, stars, has_comment: !!comment.trim() });
      onSaved(saved);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message || "Failed to submit rating");
    } finally {
      setSaving(false);
    }
  }, [paperId, stars, comment, onSaved]);

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

  // Post-submit view with optional upgrade prompt
  if (submitted) {
    return (
      <div data-testid="rating-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div
          className="bg-surface rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-bold text-stone-900 mb-2">Thanks for your feedback!</h3>
          <p className="text-sm text-stone-500 mb-4">Your rating helps improve narration quality for everyone.</p>

          {canUpgrade && onUpgrade && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 mb-4">
              <p className="text-sm text-stone-700">
                Want an even better narration?{" "}
                <button
                  type="button"
                  onClick={() => { onClose(); onUpgrade(); }}
                  className="font-medium text-stone-900 underline hover:text-stone-700"
                >
                  Upgrade the voice &amp; script →
                </button>
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              data-testid="done-rating"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="rating-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
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

        {currentTier && (
          <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-3">
            <span>Reviewing</span>
            {currentTier.plusCount > 0 && <PlusIcons count={currentTier.plusCount} size={10} />}
            <span>{currentTier.providerName} narration</span>
          </div>
        )}

        <div className="flex justify-between">
          <div>
            {existingRating && (
              <button
                data-testid="clear-rating"
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
              data-testid="cancel-rating"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
            >
              Cancel
            </button>
            <button
              data-testid="submit-rating"
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
  const searchParams = useSearchParams();
  const { previousLabel, hasHistory } = useNavigationHistory();
  const from = searchParams.get("from");

  const handleBack = () => {
    if (hasHistory) {
      router.back();
    } else if (from && from !== "home") {
      router.push(`/l?id=${from}`);
    } else {
      router.push("/");
    }
  };

  let label = previousLabel;
  if (!hasHistory && from) {
    label = from === "home" ? "Papers" : "Collection";
  }

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 transition-colors mb-4 border border-stone-300 rounded-full px-3 py-1"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="2,12 22,2 22,22" /></svg>
      Back to {label}
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
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [myRating, setMyRating] = useState<Rating | null>(null);
  const [paperVersions, setPaperVersions] = useState<PaperVersion[]>([]);
  const [paperRead, setPaperRead] = useState(false);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [narrationError, setNarrationError] = useState("");
  const [view, setView] = useState<"abstract" | "script">("abstract");
  const [scriptTabs, setScriptTabs] = useState<{ key: string; label: string; text: string; date: string | null; type: "base" | "upgraded"; llmProvider: string | null; llmModel: string | null; createdAt: string | null; charCount: number; scripterMode: string | null }[]>([]);
  const [activeScriptTab, setActiveScriptTab] = useState<string>("base");
  const [scriptLoading, setScriptLoading] = useState(false);
  const scriptsFetched = useRef(false);
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

    const from = searchParams.get("from");
    const viewSource: "search" | "collection" | "direct" =
      from === "home" ? "search" : from ? "collection" : "direct";

    fetchPaper(id)
      .then((p) => {
        setPaper(p);
        recordVisit(id);
        track("paper_viewed", { arxiv_id: id, source: viewSource });
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

    // Fetch narration versions (for voice tier display)
    getPaperVersions(id)
      .then((resp) => setPaperVersions(resp.versions))
      .catch(() => {});

    // Check read status from localStorage
    setPaperRead(checkIsRead(id));

    // Listen for status changes triggered by the PlayerBar's default play button
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { paperId: string };
      if (detail?.paperId === id) {
        fetchPaper(id).then((p) => setPaper(p)).catch(() => {});
      }
    };
    window.addEventListener("paper-status-changed", handler);
    return () => window.removeEventListener("paper-status-changed", handler);
  }, [id]);

  // Lazy-fetch transcripts (base + upgrade versions) when switching to script view
  useEffect(() => {
    if (view !== "script" || scriptsFetched.current || !paper) return;
    if (!["narrated", "narrating"].includes(paper.status)) return;
    scriptsFetched.current = true;
    setScriptLoading(true);

    const fetchTx = async (url: string): Promise<{ text: string; date: string | null } | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const lastMod = res.headers.get("Last-Modified");
        let date: string | null = null;
        if (lastMod) {
          const d = new Date(lastMod);
          if (!isNaN(d.getTime())) {
            date = d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          }
        }
        return { text: await res.text(), date };
      } catch { return null; }
    };

    (async () => {
      const tabs: typeof scriptTabs = [];

      // Helper: average of non-null goal scores (0.0–1.0 scale)
      const avgScore = (v: PaperVersion): number | null => {
        const scores = [v.score_fidelity, v.score_citations, v.score_header, v.score_figures, v.score_tts].filter((s): s is number => s != null);
        if (scores.length === 0) return null;
        return scores.reduce((a, b) => a + b, 0) / scores.length;
      };

      // Fetch versions first so we can show tabs based on actual data
      let allVersions: PaperVersion[] = [];
      try {
        const resp = await getPaperVersions(paper.id);
        allVersions = resp.versions;
      } catch {}

      // Base (regex-only) tab: use narration_tier="base" version if it exists,
      // otherwise fall back to the legacy transcript path (papers narrated via
      // cron or before the versions system have their script at the default URL).
      const baseVersion = allVersions.find(v => v.narration_tier === "base");
      if (baseVersion) {
        const base = await fetchTx(transcriptUrl(paper.id, baseVersion.id));
        if (base) tabs.push({ key: "base", label: "Programmatic Script", text: base.text, date: base.date, type: "base", llmProvider: null, llmModel: null, createdAt: baseVersion.created_at, charCount: base.text.length, scripterMode: baseVersion.scripter_mode ?? "regex" });
      } else {
        // No base version row — try legacy transcript path (default URL uses
        // best_version_id, so only use it when best_version_id is absent or
        // points to a base-tier version, otherwise we'd show the upgrade script)
        const hasBestUpgrade = paper.best_version_id && allVersions.some(v => v.id === paper.best_version_id && v.narration_tier !== "base");
        if (!hasBestUpgrade) {
          const base = await fetchTx(transcriptUrl(paper.id));
          if (base) tabs.push({ key: "base", label: "Programmatic Script", text: base.text, date: base.date, type: "base", llmProvider: null, llmModel: null, createdAt: null, charCount: base.text.length, scripterMode: null });
        }
      }

      // Upgrade version transcripts (non-base tiers)
      const upgraded = getUpgradedVersions(allVersions);
      for (const v of upgraded) {
        const tx = await fetchTx(transcriptUrl(paper.id, v.id));
        if (tx) {
          const avg = avgScore(v);
          const scoreLabel = avg != null ? ` (${(avg * 10).toFixed(1)})` : "";
          tabs.push({ key: `v${v.id}`, label: `AI Script${scoreLabel}`, text: tx.text, date: tx.date, type: "upgraded", llmProvider: v.llm_provider, llmModel: v.llm_model, createdAt: v.created_at, charCount: tx.text.length, scripterMode: v.scripter_mode });
        }
      }

      // Sort tabs by completion datetime (base first via epoch 0, then by createdAt)
      tabs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt + "Z").getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt + "Z").getTime() : 0;
        return dateA - dateB;
      });
      setScriptTabs(tabs);
      // Default to last (most recent) AI tab if available
      const aiTabs = tabs.filter(t => t.type === "upgraded");
      const lastAi = aiTabs[aiTabs.length - 1];
      setActiveScriptTab(lastAi?.key ?? tabs[0]?.key ?? "base");
      setScriptLoading(false);
    })();
  }, [view, paper]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback((updatedPaper: Paper) => {
    setPaper(updatedPaper);
  }, []);

  const handleRequestNarration = useCallback(async (rect?: DOMRect) => {
    if (!paper) return;
    setNarrationLoading(true);
    setNarrationError("");
    // Optimistically show progress bar immediately (before any network calls)
    setPaper({ ...paper, status: "narrating", eta_seconds: 55 });
    track("narration_requested", { arxiv_id: paper.id, is_retry: paper.status === "failed" });
    // Add to playlist with fly animation
    if (!isInPlaylist(paper.id)) {
      addToPlaylist(paper.id, rect);
    }
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
  }, [paper, isInPlaylist, addToPlaylist]);

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
        <p data-testid="paper-error" className="text-red-600 mb-3">{error || "Paper not found"}</p>
        <BackButton />
      </div>
    );
  }

  const isReady = paper.status === "narrated";
  const isFailed = paper.status === "failed";
  const isNotRequested = paper.status === "unnarrated";
  const isProcessing = paper.status === "narrating";
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
            onToggleScript={() => setView(view === "abstract" ? "script" : "abstract")}
            currentView={view}
            onPaperUpdated={(updatedPaper) => setPaper(updatedPaper)}
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

      </article>

      {isFailed && (
        <div className="max-w-md bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-medium text-red-800">Narration failed</p>
          <p className="text-sm text-red-600 mt-1">
            {(() => {
              switch (paper.error_category) {
                case "rate_limit": return "Rate limited \u2014 will retry automatically";
                case "source_download": return "Could not download paper source from arXiv";
                case "image_processing": return "Error processing paper figures";
                case "llm": return "Script generation error";
                case "tts": return "Audio generation error";
                case "upload": return "Upload error";
                case "timeout": return "Processing timed out";
                case "parsing": return "Error parsing paper source";
                default: return paper.error_message || "An unexpected error occurred";
              }
            })()}
            {(paper.retry_count > 0) && (
              <span className="ml-1 text-red-400">(attempt {paper.retry_count + 1} of 3)</span>
            )}
          </p>
        </div>
      )}

      {/* Content area — switches between abstract+PDF and script */}
      {view === "abstract" ? (
        <>
          {paper.abstract && (
            <p className="text-base text-stone-600 leading-relaxed mt-4">
              <span className="font-black text-stone-900 uppercase tracking-wide text-sm">Abstract</span>{" "}
              {paper.abstract}
            </p>
          )}

          {/* PDF viewer — hidden on mobile */}
          <div className="hidden md:block mt-10 border border-stone-300 rounded-xl overflow-hidden">
            <iframe
              src={`https://arxiv.org/pdf/${paper.id}#zoom=page-width`}
              className="w-full bg-surface"
              style={{ height: "1245px" }}
              title={`PDF: ${paper.title}`}
            />
          </div>
        </>
      ) : (
        <div className="mt-4">
          {scriptLoading ? (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
              <Skeleton className="mb-2" width="100%" height="12px" />
              <Skeleton className="mb-2" width="95%" height="12px" />
              <Skeleton className="mb-2" width="88%" height="12px" />
              <Skeleton className="mb-2" width="92%" height="12px" />
              <Skeleton className="mb-2" width="80%" height="12px" />
              <Skeleton width="60%" height="12px" />
            </div>
          ) : (() => {
            const active = scriptTabs.find(t => t.key === activeScriptTab) ?? scriptTabs[0];
            return (
              <>
                {/* Tabs */}
                {scriptTabs.length > 1 && (
                  <div className="flex gap-1 mb-2 border-b border-stone-200">
                    {scriptTabs.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveScriptTab(tab.key)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                          activeScriptTab === tab.key
                            ? "border-stone-700 text-stone-800"
                            : "border-transparent text-stone-400 hover:text-stone-600"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
                  {/* Metadata inside the container */}
                  {active && (
                    <div className="mb-4 pb-4 border-b border-stone-200">
                      <p className="text-xs text-stone-400">
                        {(() => {
                          const parts: string[] = [];
                          // Scripter type as the first metadata item
                          const mode = active.scripterMode
                            ?? (active.type === "upgraded" ? "llm" : "regex");
                          const scripterLabel: Record<string, string> = {
                            regex: "Regex Scripter",
                            hybrid: "Hybrid Scripter",
                            llm: "LLM Scripter",
                          };
                          parts.push(scripterLabel[mode] ?? mode);
                          if (active.type === "upgraded") {
                            const provider = formatLlmProvider(active.llmProvider);
                            const model = formatLlmModel(active.llmModel);
                            parts.push(provider ? `${provider} / ${model}` : model);
                          }
                          const dateStr = active.createdAt || active.date;
                          if (dateStr) {
                            const d = active.createdAt ? new Date(dateStr + "Z") : new Date(dateStr);
                            if (!isNaN(d.getTime())) {
                              parts.push(d.toLocaleString("en-US", {
                                year: "numeric", month: "short", day: "numeric",
                                hour: "numeric", minute: "2-digit",
                              }));
                            }
                          }
                          const charK = active.charCount < 1000 ? `${active.charCount}` : `${(active.charCount / 1000).toFixed(1)}K`;
                          parts.push(`${charK} chars`);
                          return parts.join(" \u00B7 ");
                        })()}
                      </p>
                      {/* Itemized scores */}
                      {active.type === "upgraded" && (() => {
                        const vId = parseInt(active.key.slice(1));
                        const v = paperVersions.find(ver => ver.id === vId);
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
                    {active?.text ?? "Script not available."}
                  </pre>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {showRatingModal && (() => {
        const currentTier = getBestTierFromVersions(paperVersions);
        const canUpgrade = currentTier.rank < VOICE_TIERS.plus3.rank; // can still upgrade if not at top tier
        return (
          <RatingModal
            paperId={paper.id}
            existingRating={myRating}
            currentTier={currentTier}
            canUpgrade={canUpgrade}
            onClose={() => setShowRatingModal(false)}
            onSaved={(r) => setMyRating(r)}
            onCleared={() => setMyRating(null)}
            onUpgrade={() => setShowUpgradeModal(true)}
          />
        );
      })()}

      {showUpgradeModal && (
        <UpgradeNarrationModal
          paper={paper}
          onClose={() => setShowUpgradeModal(false)}
          onSuccess={(updatedPaper) => setPaper(updatedPaper)}
        />
      )}

      {showCaptchaModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCaptchaModal(false)}>
          <div
            className="bg-surface rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
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
