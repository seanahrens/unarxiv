"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  verifyAdminPassword,
  fetchAdminStats,
  API_BASE,
  fetchPapersForCurate,
  deletePaperApi,
  reprocessPaperApi,
  clearUpgradeVersionsApi,
  fetchPaperRatings,
  clearPaperRatings,
  formatDurationShort,
  isInProgress,
  fetchAdminLists,
  deleteListAdmin,
  requestUpgradeNarration,
  type Contributor,
  type PaperWithRating,
  type AdminRating,
  type AdminList,
} from "@/lib/api";
import { getStoredKeys } from "@/lib/upgradeKeys";
import AudioFileIcon from "@/components/AudioFileIcon";
import FileIcon from "@/components/FileIcon";

import { Skeleton } from "@/components/Skeleton";
import PlusIcons from "@/components/PlusIcons";
import { VOICE_TIERS, getTierFromProvider } from "@/lib/voiceTiers";

const PAGE_SIZE = 30;

type SortKey = "created_at" | "title" | "rating" | "status" | "duration";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "narrated" | "narrating" | "failed" | "unnarrated";

function statusColor(status: string) {
  if (status === "narrated") return "bg-emerald-500";
  if (status === "failed") return "bg-red-500";
  if (status === "unnarrated") return "bg-stone-300";
  return "bg-purple-400";
}

function durationLabel(paper: PaperWithRating): string | null {
  if (isInProgress(paper.status)) {
    if (paper.eta_seconds != null && paper.eta_seconds > 0) {
      if (paper.eta_seconds < 60) return `~${Math.round(paper.eta_seconds / 5) * 5}s`;
      return `~${Math.floor(paper.eta_seconds / 60)}m`;
    }
    return "...";
  }
  if (paper.duration_seconds) return formatDurationShort(paper.duration_seconds);
  return null;
}

function timeAgo(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const days = Math.floor(diff / 86400000);
  if (days >= 365) return `${Math.floor(days / 365)}y`;
  if (days > 0) return `${days}d`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs > 0) return `${hrs}h`;
  return `${Math.max(1, Math.floor(diff / 60000))}m`;
}

function ratingPillClasses(avg: number | null): string {
  if (avg == null) return "";
  if (avg <= 1.5) return "bg-red-100 text-red-700 border-red-200";
  if (avg <= 2.5) return "bg-orange-100 text-orange-700 border-orange-200";
  if (avg <= 3.5) return "bg-amber-50 text-amber-700 border-amber-200";
  if (avg <= 4.2) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-300";
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="inline ml-0.5">
      {dir === "asc" ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
    </svg>
  );
}

function RatingsModal({
  paperId,
  paperTitle,
  password,
  onClose,
}: {
  paperId: string;
  paperTitle: string;
  password: string;
  onClose: () => void;
}) {
  const [ratings, setRatings] = useState<AdminRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaperRatings(paperId, password)
      .then(setRatings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [paperId, password]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-stone-900 mb-1">Ratings</h3>
        <p className="text-sm text-stone-500 mb-4 truncate">{paperTitle}</p>

        {loading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton width="80px" height="14px" />
                <div className="flex-1">
                  <Skeleton className="mb-1" width="100%" height="14px" />
                  <Skeleton width="60px" height="10px" />
                </div>
              </div>
            ))}
          </div>
        ) : ratings.length === 0 ? (
          <div className="text-center py-8 text-stone-400 text-sm">No ratings yet</div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-3">
            {ratings.map((r, i) => (
              <div key={i} className="flex gap-3 border-b border-stone-100 pb-3 last:border-0">
                <div className="shrink-0 flex gap-0.5 text-amber-400 pt-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" strokeWidth="1.5">
                      <polygon
                        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                        fill={s <= r.stars ? "currentColor" : "none"}
                        stroke="currentColor"
                      />
                    </svg>
                  ))}
                  {r.voice_tier && (() => {
                    const tier = VOICE_TIERS[r.voice_tier] ?? getTierFromProvider(r.voice_tier);
                    return (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-stone-500">
                        {tier && <PlusIcons count={tier.plusCount} size={9} className="text-stone-600" gap="gap-px" />}
                        <span>{tier?.providerName ?? r.voice_tier}</span>
                      </span>
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  {r.comment ? (
                    <p className="text-sm text-stone-700">{r.comment}</p>
                  ) : (
                    <p className="text-sm text-stone-400 italic">No comment</p>
                  )}
                  <p className="text-xs text-stone-400 mt-1">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4 pt-3 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface NarrationVersionWithScore {
  id: number;
  paper_id: string;
  narration_tier: string;
  quality_rank: number;
  tts_provider: string | null;
  tts_model: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  audio_r2_key: string | null;
  transcript_r2_key: string | null;
  duration_seconds: number | null;
  actual_cost: number | null;
  created_at: string;
  scored_by: string | null;
  score_fidelity: number | null;
  score_citations: number | null;
  score_header: number | null;
  score_figures: number | null;
  score_tts: number | null;
  score_overall: number | null;
  notes: string | null;
  scored_at: string | null;
}

function ScorePill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-stone-300">—</span>;
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.8
      ? "bg-emerald-100 text-emerald-800"
      : value >= 0.5
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-700";
  return (
    <span className={`inline-block px-1 rounded text-xs font-mono ${cls}`}>{pct}</span>
  );
}

function ScriptsModal({
  paperId,
  paperTitle,
  password,
  onClose,
}: {
  paperId: string;
  paperTitle: string;
  password: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<NarrationVersionWithScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/papers/${paperId}/versions`, {
      headers: { "X-Admin-Password": password },
    })
      .then((r) => r.json())
      .then((d: { versions: NarrationVersionWithScore[] }) => setVersions(d.versions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [paperId, password]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-xl w-full max-w-3xl mx-4 p-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-stone-900 mb-1">Script Versions</h3>
        <p className="text-sm text-stone-500 mb-4 truncate">{paperTitle}</p>

        {loading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} width="100%" height="32px" />
            ))}
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8 text-stone-400 text-sm">No versions yet</div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-100 text-left text-stone-400 uppercase tracking-wider">
                  <th className="px-2 py-1.5">Tier</th>
                  <th className="px-2 py-1.5">LLM</th>
                  <th className="px-2 py-1.5">TTS</th>
                  <th className="px-2 py-1.5 text-center">Fid</th>
                  <th className="px-2 py-1.5 text-center">Cit</th>
                  <th className="px-2 py-1.5 text-center">Hdr</th>
                  <th className="px-2 py-1.5 text-center">Fig</th>
                  <th className="px-2 py-1.5 text-center">TTS</th>
                  <th className="px-2 py-1.5 text-center">Overall</th>
                  <th className="px-2 py-1.5 text-right">Created</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-stone-50 hover:bg-stone-50">
                    <td className="px-2 py-1.5 font-mono text-stone-600">{v.narration_tier}</td>
                    <td className="px-2 py-1.5 text-stone-500 max-w-[80px] truncate" title={v.llm_model ?? ""}>
                      {v.llm_provider ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-stone-500 max-w-[80px] truncate" title={v.tts_model ?? ""}>
                      {v.tts_provider ?? "edge-tts"}
                    </td>
                    <td className="px-2 py-1.5 text-center"><ScorePill value={v.score_fidelity} /></td>
                    <td className="px-2 py-1.5 text-center"><ScorePill value={v.score_citations} /></td>
                    <td className="px-2 py-1.5 text-center"><ScorePill value={v.score_header} /></td>
                    <td className="px-2 py-1.5 text-center"><ScorePill value={v.score_figures} /></td>
                    <td className="px-2 py-1.5 text-center"><ScorePill value={v.score_tts} /></td>
                    <td className="px-2 py-1.5 text-center font-semibold"><ScorePill value={v.score_overall} /></td>
                    <td className="px-2 py-1.5 text-right text-stone-400 whitespace-nowrap">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-1.5">
                      {v.transcript_r2_key && (
                        <a
                          href={`/s?id=${paperId}&version=${v.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="View script"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-3 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quality Insights Panel ───────────────────────────────────────────────────

interface ScoreDailyRow {
  period: string;       // commit hash (7-char) or YYYY-MM-DD date fallback
  period_start: string; // ISO timestamp for ordering
  narration_tier: string;
  scripter_mode: string; // 'regex' | 'llm' | 'hybrid'
  avg_overall: number | null;
  avg_fidelity: number | null;
  avg_citations: number | null;
  avg_header: number | null;
  avg_figures: number | null;
  avg_tts: number | null;
  count: number;
}

interface ScoreSummaryRow {
  narration_tier: string;
  scripter_mode: string;
  avg_overall: number | null;
  avg_7d: number | null;
  avg_prior_7d: number | null;
  count_7d: number;
  total_count: number;
  avg_fidelity: number | null;
  avg_citations: number | null;
  avg_header: number | null;
  avg_figures: number | null;
  avg_tts: number | null;
  avg_cost: number | null;
  avg_latency_ms: number | null;
}

interface ScoreCurrentRow {
  narration_tier: string;
  scripter_mode: string;
  period: string;
  avg_overall: number | null;
  avg_fidelity: number | null;
  avg_citations: number | null;
  avg_header: number | null;
  avg_figures: number | null;
  avg_tts: number | null;
  count: number;
  avg_cost: number | null;
  avg_latency_ms: number | null;
}

interface ScoreStats {
  daily: ScoreDailyRow[];
  summary: ScoreSummaryRow[];
  current: ScoreCurrentRow[];
}

function trendLabel(current: number | null, prior: number | null): { symbol: string; delta: string; color: string } | null {
  if (current == null || prior == null) return null;
  const diff = current - prior;
  const pp = Math.round(diff * 100);
  if (Math.abs(pp) < 1) return { symbol: "→", delta: "~0pp", color: "text-stone-400" };
  if (pp > 0) return { symbol: "↑", delta: `+${pp}pp`, color: "text-emerald-600" };
  return { symbol: "↓", delta: `${pp}pp`, color: "text-red-500" };
}

function scoreColor(v: number | null): string {
  if (v == null) return "bg-stone-100";
  if (v >= 0.8) return "bg-emerald-400";
  if (v >= 0.5) return "bg-amber-400";
  return "bg-red-400";
}

/** Format a period key for x-axis display.
 * If it's a 7-char hex commit hash, show as-is.
 * If it's a YYYY-MM-DD date, show MM-DD. */
function fmtPeriod(p: string): string {
  if (!p) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p.slice(5); // date → MM-DD
  return p.slice(0, 7); // commit hash → first 7 chars
}

/** SVG trend chart — avg_overall per parser version/commit per tier */
function ScoreTrendChart({ daily }: { daily: ScoreDailyRow[] }) {
  const W = 600;
  const H = 110;
  const PAD = { top: 10, right: 8, bottom: 22, left: 28 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  // Build ordered period list, sorted by period_start (chronological)
  const periodOrder = Array.from(
    new Map(daily.map((r) => [r.period, r.period_start])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1])).map(([p]) => p);

  // Group rows by scripter_mode, keyed by period
  const seriesMap: Record<string, Map<string, number | null>> = {
    regex: new Map(),
    llm: new Map(),
    hybrid: new Map(),
  };
  for (const r of daily) {
    const key = r.scripter_mode || (r.narration_tier === "base" ? "regex" : "llm");
    if (!seriesMap[key]) seriesMap[key] = new Map();
    const existing = seriesMap[key].get(r.period);
    if (existing == null) {
      seriesMap[key].set(r.period, r.avg_overall);
    } else if (r.avg_overall != null) {
      seriesMap[key].set(r.period, ((existing ?? 0) + r.avg_overall) / 2);
    }
  }

  const periodToX = (period: string) => {
    const idx = periodOrder.indexOf(period);
    if (periodOrder.length <= 1) return PAD.left + cW / 2;
    return PAD.left + (idx / (periodOrder.length - 1)) * cW;
  };
  // Y-axis range: 50%–100% for better resolution on actual score changes
  const Y_MIN = 0.5;
  const Y_MAX = 1.0;
  const scoreToY = (score: number) => PAD.top + ((Y_MAX - Math.max(score, Y_MIN)) / (Y_MAX - Y_MIN)) * cH;

  const renderSeries = (key: string, stroke: string, fill: string) => {
    const points: { x: number; y: number; period: string }[] = [];
    for (const period of periodOrder) {
      const v = seriesMap[key].get(period);
      if (v != null) points.push({ x: periodToX(period), y: scoreToY(v), period });
    }
    if (points.length === 0) return null;
    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <g key={key}>
        {points.length >= 2 && (
          <polyline points={polylinePoints} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        )}
        {points.map((p) => (
          <circle key={p.period} cx={p.x} cy={p.y} r="3" fill={fill} stroke="white" strokeWidth="1">
            <title>{p.period}</title>
          </circle>
        ))}
      </g>
    );
  };

  // Grid lines within the 50–100% range
  const gridLines = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  // X-axis labels: first, last, and any in between if space allows (max 5)
  const firstPeriod = periodOrder[0];
  const lastPeriod = periodOrder[periodOrder.length - 1];

  // Check which series have actual scored (non-null) data points
  const hasRegex = Array.from(seriesMap.regex.values()).some((v) => v != null);
  const hasLlm = Array.from(seriesMap.llm.values()).some((v) => v != null);
  const hasHybrid = Array.from(seriesMap.hybrid.values()).some((v) => v != null);
  // hasAnyPeriods: true if there are any periods at all (including unscored future commits)
  const hasAnyPeriods = periodOrder.length > 0;

  if (!hasAnyPeriods) {
    return (
      <div className="flex items-center justify-center h-20 text-xs text-stone-300">
        No scored data yet
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Grid lines */}
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} y1={scoreToY(v)}
              x2={PAD.left + cW} y2={scoreToY(v)}
              stroke="#d6d3d1" strokeWidth="1"
            />
            <text x={PAD.left - 4} y={scoreToY(v) + 4} textAnchor="end" fontSize="8" fill="#a8a29e">
              {Math.round(v * 100)}
            </text>
          </g>
        ))}
        {/* Y=50% baseline */}
        <line x1={PAD.left} y1={scoreToY(Y_MIN)} x2={PAD.left + cW} y2={scoreToY(Y_MIN)} stroke="#a8a29e" strokeWidth="1" />
        {/* Series */}
        {hasRegex && renderSeries("regex", "#ef4444", "#ef4444")}
        {hasLlm && renderSeries("llm", "#3b82f6", "#3b82f6")}
        {hasHybrid && renderSeries("hybrid", "#8b5cf6", "#8b5cf6")}
        {/* X-axis labels */}
        {firstPeriod && (
          <text x={periodToX(firstPeriod)} y={H - 4} textAnchor="middle" fontSize="8" fill="#a8a29e">
            {fmtPeriod(firstPeriod)}
          </text>
        )}
        {lastPeriod && lastPeriod !== firstPeriod && (
          <text x={periodToX(lastPeriod)} y={H - 4} textAnchor="middle" fontSize="8" fill="#a8a29e">
            {fmtPeriod(lastPeriod)}
          </text>
        )}
        {periodOrder.slice(1, -1).map((p) => (
          <text key={p} x={periodToX(p)} y={H - 4} textAnchor="middle" fontSize="8" fill="#a8a29e">
            {fmtPeriod(p)}
          </text>
        ))}
      </svg>
      {/* Legend */}
      <div className="flex gap-4 justify-end mt-1">
        {hasRegex && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#ef4444" }}>
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: "#ef4444" }} />
            Regex
          </span>
        )}
        {hasLlm && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#3b82f6" }}>
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: "#3b82f6" }} />
            LLM
          </span>
        )}
        {hasHybrid && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#8b5cf6" }}>
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: "#8b5cf6" }} />
            Hybrid
          </span>
        )}
      </div>
    </div>
  );
}

const GOAL_TOOLTIPS: Record<string, string> = {
  Fidelity: "Content completeness — does the script include all main body prose without truncation or paraphrasing?",
  Citations: "Artifact cleanliness — are citation brackets, LaTeX commands, and formatting artifacts removed?",
  "Header/Footer": "Structural compliance — correct header/footer, no duplicate title blocks, clean section transitions.",
  Figures: "Figure & table descriptions — are visual elements described with specific data points and comparisons? (LLM only)",
  TTS: "TTS readability — does the script read naturally aloud with proper math verbalization and no unpronounceable sequences?",
};

/** Horizontal bar rows for each goal, one column per scripter mode */
function GoalBreakdown({ current }: { current: ScoreCurrentRow[] }) {
  const regex = current.find((r) => r.scripter_mode === "regex");
  const llm = current.find((r) => r.scripter_mode === "llm");
  const hybrid = current.find((r) => r.scripter_mode === "hybrid");
  const modes = [
    { data: regex, label: "Regex", color: "text-red-400" },
    { data: hybrid, label: "Hybrid", color: "text-violet-400" },
    { data: llm, label: "LLM", color: "text-blue-400" },
  ].filter((m) => m.data);

  const goals: { label: string; key: keyof ScoreCurrentRow }[] = [
    { label: "Overall", key: "avg_overall" },
    { label: "Fidelity", key: "avg_fidelity" },
    { label: "Citations", key: "avg_citations" },
    { label: "Header/Footer", key: "avg_header" },
    { label: "Figures", key: "avg_figures" },
    { label: "TTS", key: "avg_tts" },
  ];

  const Bar = ({ value, isOverall }: { value: number | null; isOverall?: boolean }) => {
    if (value == null) return (
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-xs text-stone-300 w-7 text-right font-mono">—</span>
        <div className="flex-1" />
      </div>
    );
    const pct = Math.round(value * 100);
    const barColor = isOverall ? "bg-stone-400" : value >= 0.8 ? "bg-emerald-400" : value >= 0.5 ? "bg-amber-400" : "bg-red-400";
    return (
      <div className="flex items-center gap-1.5 flex-1">
        <span className={`text-xs w-7 text-right font-mono ${isOverall ? "text-stone-300 font-semibold" : "text-stone-500"}`}>{pct}%</span>
        <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4">
      {/* Column headers with period/commit info */}
      <div className="flex mb-1">
        <div className="w-28 shrink-0" />
        {modes.map((m) => (
          <div key={m.label} className="flex-1 text-center">
            <div className={`text-xs ${m.color}`}>{m.label}</div>
            <div className="text-[10px] text-stone-400 font-mono">
              {m.data!.period ? fmtPeriod(m.data!.period) : ""}
              {m.data!.count ? ` (${m.data!.count}p)` : ""}
            </div>
          </div>
        ))}
      </div>
      {goals.map(({ label, key }) => (
        <div key={String(key)} className="flex items-center gap-2 py-1">
          <div className="w-28 shrink-0 text-xs text-stone-400" title={GOAL_TOOLTIPS[label] ?? ""}>
            <span className={label === "Overall" ? "font-medium text-stone-300" : "cursor-help border-b border-dashed border-stone-300"}>{label}</span>
          </div>
          {modes.map((m) => (
            <Bar key={m.label} value={m.data![key] as number | null} isOverall={key === "avg_overall"} />
          ))}
        </div>
      ))}
      {/* Cost & Latency row */}
      <div className="flex items-center gap-2 py-1.5 mt-1 border-t border-stone-100">
        <div className="w-28 shrink-0 text-xs text-stone-400">Avg Cost</div>
        {modes.map((m) => (
          <div key={m.label} className="flex-1 text-xs text-stone-500 text-center font-mono">
            {m.data!.avg_cost != null ? `$${m.data!.avg_cost.toFixed(4)}` : "—"}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 py-1">
        <div className="w-28 shrink-0 text-xs text-stone-400">Avg Latency</div>
        {modes.map((m) => (
          <div key={m.label} className="flex-1 text-xs text-stone-500 text-center font-mono">
            {m.data!.avg_latency_ms != null ? `${(m.data!.avg_latency_ms / 1000).toFixed(1)}s` : "—"}
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityInsightsPanel({
  stats,
  expanded,
  onToggle,
}: {
  stats: ScoreStats;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Current period stats (most recent commit, up to 10 papers) per scripter_mode
  const regex = stats.current.find((r) => r.scripter_mode === "regex");
  const llm = stats.current.find((r) => r.scripter_mode === "llm");
  const hybrid = stats.current.find((r) => r.scripter_mode === "hybrid");
  const modeRows = [regex, hybrid, llm].filter(Boolean) as ScoreCurrentRow[];
  const totalEvals = stats.current.reduce((s, r) => s + r.count, 0);

  // Compute trend by comparing last two periods in daily for each mode
  function getModeTrend(mode: string): ReturnType<typeof trendLabel> {
    const rows = stats.daily.filter((r) => r.scripter_mode === mode);
    const byPeriod = new Map<string, { sum: number; n: number; start: string }>();
    for (const r of rows) {
      if (r.avg_overall == null) continue;
      const entry = byPeriod.get(r.period);
      if (!entry) byPeriod.set(r.period, { sum: r.avg_overall, n: 1, start: r.period_start });
      else { entry.sum += r.avg_overall; entry.n += 1; }
    }
    const periods = Array.from(byPeriod.entries())
      .sort((a, b) => a[1].start.localeCompare(b[1].start));
    if (periods.length < 2) return null;
    const latest = periods[periods.length - 1][1];
    const prior = periods[periods.length - 2][1];
    return trendLabel(latest.sum / latest.n, prior.sum / prior.n);
  }

  const MODE_COLORS: Record<string, string> = { regex: "text-red-500", llm: "text-blue-500", hybrid: "text-violet-500" };
  const MODE_LABELS: Record<string, string> = { regex: "Regex", llm: "LLM", hybrid: "Hybrid" };
  const MODE_BG: Record<string, string> = { regex: "bg-red-50", llm: "bg-blue-50", hybrid: "bg-violet-50" };
  const MODE_LABEL_COLOR: Record<string, string> = { regex: "text-red-600", llm: "text-blue-700", hybrid: "text-violet-700" };
  const MODE_VALUE_COLOR: Record<string, string> = { regex: "text-red-800", llm: "text-blue-800", hybrid: "text-violet-800" };

  const TierPill = ({ row }: { row: ScoreCurrentRow }) => {
    const mode = row.scripter_mode || (row.narration_tier === "base" ? "regex" : "llm");
    const trend = getModeTrend(mode);
    const pct = row.avg_overall != null ? Math.round(row.avg_overall * 100) : null;
    const color = MODE_COLORS[mode] ?? "text-stone-500";
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
        {MODE_LABELS[mode] ?? mode}
        {pct != null && <span className="font-mono">{pct}%</span>}
        {trend && <span className={trend.color}>{trend.symbol}</span>}
      </span>
    );
  };

  return (
    <div className="mb-4 rounded-xl border border-stone-100 bg-surface overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
      >
        <span className="flex items-center gap-3">
          <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">Quality Insights</span>
          <span className="flex items-center gap-2.5">
            {modeRows.map((r) => <TierPill key={r.scripter_mode} row={r} />)}
            {totalEvals > 0 && (
              <span className="text-xs text-stone-300">{totalEvals} eval{totalEvals !== 1 ? "s" : ""}</span>
            )}
          </span>
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-stone-300 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-50">
          {/* Summary pills */}
          {modeRows.length > 0 && (
            <div className="flex gap-4 pt-3 pb-2 flex-wrap">
              {modeRows.map((r) => {
                const mode = r.scripter_mode || (r.narration_tier === "base" ? "regex" : "llm");
                const trend = getModeTrend(mode);
                const pct = r.avg_overall != null ? Math.round(r.avg_overall * 100) : null;
                return (
                  <div key={mode} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${MODE_BG[mode] ?? "bg-stone-50"}`}>
                    <span className={`text-xs font-semibold ${MODE_LABEL_COLOR[mode] ?? "text-stone-600"}`}>
                      {MODE_LABELS[mode] ?? mode}
                    </span>
                    {pct != null && (
                      <span className={`text-sm font-bold font-mono ${MODE_VALUE_COLOR[mode] ?? "text-stone-800"}`}>
                        {pct}%
                      </span>
                    )}
                    {trend && (
                      <span className={`text-xs ${trend.color}`}>{trend.symbol} {trend.delta}</span>
                    )}
                    <span className="text-xs text-stone-300">{r.count}ev</span>
                    {r.avg_cost != null && (
                      <span className="text-xs text-stone-300 font-mono">${r.avg_cost.toFixed(3)}</span>
                    )}
                    {r.avg_latency_ms != null && (
                      <span className="text-xs text-stone-300 font-mono">{(r.avg_latency_ms / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Trend chart */}
          <ScoreTrendChart daily={stats.daily} />

          {/* Goal breakdown */}
          {stats.current.length > 0 && <GoalBreakdown current={stats.current} />}
        </div>
      )}
    </div>
  );
}

const externalLinks = [
  {
    label: "Modal Apps",
    url: "https://modal.com/apps/seanahrens/main/deployed/unarxiv-worker",
    description: "Narration worker logs & invocations",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    label: "Modal Secrets",
    url: "https://modal.com/seanahrens/main/secrets/unarxiv-secrets",
    description: "R2 keys, Anthropic key, callback secret",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M18 6l2 2" /><path d="M15 9l2 2" />
      </svg>
    ),
  },
  {
    label: "Workers API",
    url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/workers/services/view/unarxiv-api",
    description: "API worker settings & analytics",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
        <path d="M7 8l3 3-3 3" /><path d="M13 14h4" />
      </svg>
    ),
  },
  {
    label: "Worker Secrets",
    url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/workers/services/view/unarxiv-api/production/settings/bindings",
    description: "MODAL_WEBHOOK_SECRET, ADMIN_PASSWORD, ENCRYPTION_KEY",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    label: "D1 Database",
    url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/workers/d1/databases/d1936353-a389-4f38-a109-79db70cc44ef",
    description: "Tables & query explorer",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    label: "R2 Storage",
    url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/r2/overview",
    description: "Audio files bucket — API tokens at /r2/api-tokens",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: "Pages",
    url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/pages",
    description: "Frontend deployments & domains",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    label: "Turnstile",
    url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/turnstile",
    description: "Bot protection & analytics",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    label: "PostHog Analytics",
    url: "https://us.posthog.com/project/350363/home",
    description: "User behavior, sessions & funnels",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
      </svg>
    ),
  },
  {
    label: "DNS",
    url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/aixdemocracy.fyi/dns/records",
    description: "DNS records for papers.aixdemocracy.fyi",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
        <circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
  },
];

export default function AdminPage() {
  // Auth state
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authError, setAuthError] = useState("");

  // Dashboard state
  const [contributors, setContributors] = useState<Contributor[]>([]);

  // Collections state
  const [collections, setCollections] = useState<AdminList[]>([]);
  const [deletingLists, setDeletingLists] = useState<Set<string>>(new Set());
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Curate state
  const [papers, setPapers] = useState<PaperWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [yourPaperIds, setYourPaperIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [ratingsModal, setRatingsModal] = useState<{ paperId: string; title: string } | null>(null);
  const [scriptsModal, setScriptsModal] = useState<{ paperId: string; title: string } | null>(null);
  const [scoreStats, setScoreStats] = useState<ScoreStats | null>(null);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [reprocessMenuOpen, setReprocessMenuOpen] = useState(false);
  const reprocessMenuRef = useRef<HTMLDivElement>(null);
  const [actionError, setActionError] = useState("");

  // Filter & sort state
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLowRated, setShowLowRated] = useState(false);
  const [showYours, setShowYours] = useState(false);
  const [showUpgraded, setShowUpgraded] = useState(false);

  // Auth: check session
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_password");
    if (saved) {
      verifyAdminPassword(saved)
        .then((valid) => {
          if (valid) {
            setPassword(saved);
            setAuthenticated(true);
          } else {
            sessionStorage.removeItem("admin_password");
          }
        })
        .catch(() => {})
        .finally(() => setCheckingSession(false));
    } else {
      setCheckingSession(false);
    }
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setVerifying(true);
    setAuthError("");
    try {
      const valid = await verifyAdminPassword(password);
      if (valid) {
        sessionStorage.setItem("admin_password", password);
        setAuthenticated(true);
      } else {
        setAuthError("Invalid password");
      }
    } catch {
      setAuthError("Could not verify password");
    } finally {
      setVerifying(false);
    }
  }, [password]);

  // Load data after auth + poll every 15s
  useEffect(() => {
    if (!authenticated) return;
    const pw = sessionStorage.getItem("admin_password");
    if (!pw) return;

    const loadPapers = () => {
      fetchPapersForCurate(pw)
        .then((data) => setPapers(data))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    };

    loadPapers();

    fetchAdminStats(pw)
      .then((data) => {
        setContributors(data.contributors);
        setYourPaperIds(new Set(data.your_paper_ids));
      })
      .catch(console.error);

    fetchAdminLists(pw)
      .then(setCollections)
      .catch(console.error);

    fetch(`${API_BASE}/api/admin/score-stats`, { headers: { "X-Admin-Password": pw } })
      .then((r) => r.json())
      .then((d: ScoreStats) => setScoreStats(d))
      .catch(console.error);

    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(loadPapers, 5000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVisibility = () => { document.hidden ? stop() : start(); };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [authenticated]);

  // Close reprocess menu on outside click
  useEffect(() => {
    if (!reprocessMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (reprocessMenuRef.current && !reprocessMenuRef.current.contains(e.target as Node)) {
        setReprocessMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [reprocessMenuOpen]);

  // Filtered → sorted → paginated
  const filtered = useMemo(() => {
    let list = papers;
    if (statusFilter === "narrated") list = list.filter((p) => p.status === "narrated");
    else if (statusFilter === "failed") list = list.filter((p) => p.status === "failed");
    else if (statusFilter === "unnarrated") list = list.filter((p) => p.status === "unnarrated");
    else if (statusFilter === "narrating") list = list.filter((p) => p.status === "narrating");
    if (showLowRated) list = list.filter((p) => p.has_low_rating);
    if (showYours) list = list.filter((p) => yourPaperIds.has(p.id));
    if (showUpgraded) list = list.filter((p) => p.best_narration_tier && p.best_narration_tier !== "base");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.title?.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    return list;
  }, [papers, statusFilter, showLowRated, showYours, showUpgraded, searchQuery, yourPaperIds]);

  const STATUS_ORDER: Record<string, number> = {
    failed: 0,
    narrating: 1,
    narrated: 2,
    unnarrated: 3,
  };

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return dir * (a.title || "").localeCompare(b.title || "");
        case "rating":
          return dir * ((a.avg_rating ?? -1) - (b.avg_rating ?? -1));
        case "status":
          return dir * ((STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3))
            || -((a.created_at || "").localeCompare(b.created_at || ""));
        case "duration":
          return dir * ((a.duration_seconds ?? 0) - (b.duration_seconds ?? 0));
        case "created_at":
        default:
          return dir * ((a.created_at || "").localeCompare(b.created_at || ""));
      }
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = useMemo(() => sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE), [sorted, safePage]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [statusFilter, searchQuery, showLowRated, showYours, showUpgraded, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "created_at" || key === "duration" ? "desc" : "asc"); }
  };

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === paginated.length && paginated.every((p) => prev.has(p.id))
        ? new Set()
        : new Set(paginated.map((p) => p.id))
    );
  }, [paginated]);

  const handleBulkDelete = useCallback(async () => {
    if (!password || selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} paper${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setActionError("");
    const ids = [...selected];
    setDeleting(new Set(ids));
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await deletePaperApi(id, password);
        setPapers((prev) => prev.filter((p) => p.id !== id));
      } catch { failed.push(id); }
    }
    setSelected(new Set(failed));
    setDeleting(new Set());
    if (failed.length > 0) setActionError(`Failed to delete ${failed.length} paper(s)`);
  }, [password, selected]);

  const handleBulkReprocess = useCallback(async (mode: "full" | "script_only" | "narration_only" = "full") => {
    if (!password || selected.size === 0) return;
    setActionError("");
    const ids = [...selected];
    setProcessing(new Set(ids));
    setReprocessMenuOpen(false);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const updated = await reprocessPaperApi(id, password, false, mode);
        setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      } catch { failed.push(id); }
    }
    setSelected(new Set());
    setProcessing(new Set());
    if (failed.length > 0) setActionError(`Failed to reprocess ${failed.length} paper(s)`);
  }, [password, selected]);

  const handleBulkUpgrade = useCallback(async (tier: "plus1" | "plus2" | "plus3") => {
    if (selected.size === 0) return;
    const keys = getStoredKeys();
    // Determine which LLM provider key is available
    const llmProvider = keys.openai ? "openai" : keys.google ? "google" : null;
    if (!llmProvider) {
      setActionError("No API keys stored — add keys via the upgrade modal on any paper first");
      return;
    }
    // Check TTS key availability for plus2/plus3
    if (tier === "plus2" && !keys.openai) {
      setActionError("No OpenAI API key stored — needed for 2Plus");
      return;
    }
    if (tier === "plus3" && !keys.elevenlabs) {
      setActionError("No ElevenLabs API key stored — needed for 3Plus");
      return;
    }
    setActionError("");
    const ids = [...selected];
    setProcessing(new Set(ids));
    setReprocessMenuOpen(false);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const updated = await requestUpgradeNarration(id, {
          option_id: tier,
          encrypted_keys: keys as Partial<Record<string, string>>,
          llm_provider: llmProvider,
        });
        setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      } catch { failed.push(id); }
    }
    setSelected(new Set());
    setProcessing(new Set());
    if (failed.length > 0) setActionError(`Failed to upgrade ${failed.length} paper(s)`);
  }, [selected]);

  const handleBulkClearUpgrade = useCallback(async () => {
    if (!password || selected.size === 0) return;
    if (!confirm(`Clear upgrade narrations for ${selected.size} paper${selected.size > 1 ? "s" : ""}? This deletes upgraded audio, scripts, and R2 files.`)) return;
    setActionError("");
    const ids = [...selected];
    setProcessing(new Set(ids));
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await clearUpgradeVersionsApi(id, password);
        setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, best_version_id: null } : p)));
      } catch { failed.push(id); }
    }
    setSelected(new Set());
    setProcessing(new Set());
    if (failed.length > 0) setActionError(`Failed to clear upgrade for ${failed.length} paper(s)`);
  }, [password, selected]);

  const handleBulkClearReviews = useCallback(async () => {
    if (!password || selected.size === 0) return;
    if (!confirm(`Clear all reviews for ${selected.size} paper${selected.size > 1 ? "s" : ""}?`)) return;
    setActionError("");
    const ids = [...selected];
    try {
      await clearPaperRatings(ids, password);
      setPapers((prev) => prev.map((p) =>
        ids.includes(p.id) ? { ...p, rating_count: 0, avg_rating: null, has_low_rating: false } : p
      ));
    } catch { setActionError("Failed to clear reviews"); }
  }, [password, selected]);

  // --- Login screen ---
  if (checkingSession) {
    return (
      <div className="max-w-sm mx-auto mt-20 space-y-4">
        <Skeleton width="120px" height="24px" />
        <Skeleton className="rounded-lg" width="100%" height="42px" />
        <Skeleton className="rounded-lg" width="100%" height="42px" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <h1 className="text-xl font-bold text-stone-900 mb-4">Admin Access</h1>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg mb-3
                       focus:outline-none focus:ring-2 focus:ring-stone-400"
            autoFocus
          />
          {authError && <p data-testid="admin-auth-error" className="text-sm text-red-600 mb-3">{authError}</p>}
          <button
            data-testid="admin-continue"
            type="submit"
            disabled={verifying}
            className="w-full px-4 py-2.5 bg-stone-900 hover:bg-stone-700 text-white
                       text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {verifying ? "Verifying..." : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  // --- Authenticated dashboard ---
  const statusFilters: { key: StatusFilter; label: string; dotColor: string }[] = [
    { key: "all", label: "All", dotColor: "" },
    { key: "unnarrated", label: "New", dotColor: "bg-stone-300" },
    { key: "narrating", label: "Active", dotColor: "bg-purple-400" },
    { key: "narrated", label: "Done", dotColor: "bg-emerald-500" },
    { key: "failed", label: "Failed", dotColor: "bg-red-500" },
  ];

  const allPageSelected = paginated.length > 0 && paginated.every((p) => selected.has(p.id));

  return (
    <div data-testid="admin-dashboard">
      <div className="flex items-center justify-between mb-4">
        <div>
          <a href="/" className="text-sm text-stone-400 hover:text-stone-600 transition-colors mb-2 inline-block">
            &larr; Back to papers
          </a>
          <h1 className="text-2xl font-bold text-stone-900">Admin</h1>
        </div>
        <span className="text-sm text-stone-400">{filtered.length} of {papers.length} papers</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Quality Insights panel — shown when score data exists */}
      {scoreStats && (scoreStats.daily.length > 0 || scoreStats.current.length > 0) && (
        <QualityInsightsPanel
          stats={scoreStats}
          expanded={showQualityPanel}
          onToggle={() => setShowQualityPanel((v) => !v)}
        />
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-stone-200 overflow-hidden">
          {statusFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                statusFilter === f.key
                  ? "bg-stone-800 text-white"
                  : "bg-surface text-stone-500 hover:bg-stone-50"
              } ${f.key !== "all" ? "border-l border-stone-200" : ""}`}
            >
              {f.dotColor && <span className={`inline-block w-2 h-2 rounded-full ${f.dotColor} ${statusFilter === f.key ? "opacity-80" : ""}`} />}
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search title or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-surface
                     focus:outline-none focus:ring-1 focus:ring-stone-400 w-48"
        />
        <button
          onClick={() => setShowLowRated((v) => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            showLowRated ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-surface border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
          </svg>
          Low rated
        </button>
        <button
          onClick={() => setShowYours((v) => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            showYours ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-surface border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Yours
        </button>
        <button
          onClick={() => setShowUpgraded((v) => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            showUpgraded ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-surface border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Upgraded
        </button>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
          <span className="text-xs text-stone-600 font-medium">{selected.size} selected</span>
          <div className="relative" ref={reprocessMenuRef}>
            <div className="inline-flex rounded-lg border border-amber-200 overflow-hidden">
              <button
                onClick={() => handleBulkReprocess("full")}
                disabled={deleting.size > 0 || processing.size > 0}
                className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-40"
              >
                {processing.size > 0 ? "Processing..." : "Base"}
              </button>
              <button
                onClick={() => setReprocessMenuOpen((v) => !v)}
                disabled={deleting.size > 0 || processing.size > 0}
                className="px-1.5 py-1 text-xs text-amber-700 bg-amber-50 border-l border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-40"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {reprocessMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-surface border border-stone-200 rounded-lg shadow-lg z-10 min-w-[200px]">
                <button onClick={() => handleBulkReprocess("full")} className="w-full text-left px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 rounded-t-lg">
                  Base <span className="text-stone-400">(new script)</span>
                </button>
                <button onClick={() => handleBulkUpgrade("plus1")} className="w-full text-left px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 border-t border-stone-100">
                  1Plus <span className="text-stone-400">(new script)</span>
                </button>
                <button onClick={() => handleBulkUpgrade("plus2")} className="w-full text-left px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 border-t border-stone-100">
                  2Plus
                </button>
                <button onClick={() => handleBulkUpgrade("plus3")} className="w-full text-left px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 border-t border-stone-100">
                  3Plus
                </button>
                <button onClick={() => { setReprocessMenuOpen(false); handleBulkClearUpgrade(); }} className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-b-lg border-t border-stone-100">
                  Clear Upgrades
                </button>
              </div>
            )}
          </div>
          <button onClick={handleBulkClearReviews} disabled={deleting.size > 0 || processing.size > 0} className="px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-40">
            Clear Reviews
          </button>
          <button onClick={handleBulkDelete} disabled={deleting.size > 0 || processing.size > 0} className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40">
            {deleting.size > 0 ? "Deleting..." : "Delete"}
          </button>
          <button onClick={() => setSelected(new Set())} className="px-2.5 py-1 text-xs text-stone-400 hover:text-stone-600 transition-colors">
            Clear
          </button>
          {actionError && <span className="ml-2 text-xs text-red-600">{actionError}</span>}
        </div>
      )}

      {/* Papers table */}
      {loading ? (
        <div className="bg-surface border border-stone-200 rounded-lg overflow-hidden p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="rounded" width="14px" height="14px" />
              <Skeleton className="rounded-full" width="10px" height="10px" />
              <Skeleton className="flex-1" height="14px" />
              <Skeleton width="40px" height="14px" />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-stone-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left">
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="w-3.5 h-3.5 accent-stone-800" />
                </th>
                <th className="px-2 py-2 w-6">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2" className="opacity-60">
                    <circle cx="12" cy="12" r="6" />
                  </svg>
                </th>
                <th className="px-1 py-2 w-7 text-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" className="inline opacity-60">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </th>
                <th className="px-1 py-2 w-10 text-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" className="inline opacity-60">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </th>
                <th className="px-2 py-2 cursor-pointer select-none" onClick={() => handleSort("title")}>
                  <span className="inline-flex items-center gap-1 text-stone-400">
                    <span className="text-xs">Title</span>
                    <SortArrow active={sortKey === "title"} dir={sortDir} />
                  </span>
                </th>
                <th className="px-2 py-2 w-16 cursor-pointer select-none text-center" onClick={() => handleSort("rating")}>
                  <span className="inline-flex items-center gap-1 text-stone-400 justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <SortArrow active={sortKey === "rating"} dir={sortDir} />
                  </span>
                </th>
                <th className="px-2 py-2 w-10 cursor-pointer select-none text-center" onClick={() => handleSort("duration")}>
                  <span className="inline-flex items-center gap-0.5 text-stone-400 justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
                      <path d="M4 4h16v16H4z" rx="2" />
                      <path d="M8 8h8M8 12h6" />
                    </svg>
                    <SortArrow active={sortKey === "duration"} dir={sortDir} />
                  </span>
                </th>
                <th className="px-2 py-2 w-8 text-center text-stone-400">Hist</th>
                <th className="px-2 py-2 w-8 cursor-pointer select-none text-center" onClick={() => handleSort("created_at")}>
                  <span className="inline-flex items-center gap-0.5 text-stone-400 justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    <SortArrow active={sortKey === "created_at"} dir={sortDir} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-stone-400 text-sm">No papers match filters</td>
                </tr>
              ) : paginated.map((paper) => (
                <tr
                  key={paper.id}
                  className={`border-b border-stone-50 hover:bg-stone-50 transition-colors ${
                    selected.has(paper.id) ? "bg-stone-50" : ""
                  } ${deleting.has(paper.id) || processing.has(paper.id) ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-1.5">
                    <input type="checkbox" checked={selected.has(paper.id)} onChange={() => toggleSelect(paper.id)} className="w-3.5 h-3.5 accent-stone-800" />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor(paper.status)}`} title={paper.status} />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <span className="text-stone-400">
                      {paper.status === "narrated" ? <AudioFileIcon size={18} /> : paper.status === "narrating" ? <span className="inline-block scan-erase"><AudioFileIcon size={18} /></span> : <FileIcon size={18} />}
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {durationLabel(paper) && (
                      <span className="text-2xs font-mono text-stone-400">
                        {durationLabel(paper)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 max-w-0">
                    <a href={`/p?id=${paper.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-stone-800 hover:text-stone-600 transition-colors no-underline truncate block" title={`${paper.id} — ${paper.title}`}>
                      {paper.title || "Untitled"}
                    </a>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {paper.rating_count > 0 ? (
                      <button
                        onClick={() => setRatingsModal({ paperId: paper.id, title: paper.title })}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80 ${ratingPillClasses(paper.avg_rating)}`}
                        title={`${paper.rating_count} rating${paper.rating_count > 1 ? "s" : ""}`}
                      >
                        {paper.avg_rating != null ? paper.avg_rating.toFixed(1) : "—"}
                      </button>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {(paper.status === "narrated" || paper.status === "narrating") ? (
                      <a href={`/s?id=${paper.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 transition-colors inline-block" title="View script">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </a>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline opacity-20">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {(paper.status === "narrated" || paper.status === "narrating") && (
                      <button
                        onClick={() => setScriptsModal({ paperId: paper.id, title: paper.title })}
                        className="text-stone-400 hover:text-stone-600 transition-colors"
                        title="View script versions"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 3h18v4H3z" /><path d="M3 10h18v4H3z" /><path d="M3 17h18v4H3z" />
                        </svg>
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="text-xs text-stone-400 font-mono" title={paper.created_at ? new Date(paper.created_at).toLocaleString() : ""}>
                      {paper.created_at ? timeAgo(paper.created_at) : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-100 bg-stone-50">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="px-2.5 py-1 text-xs font-medium text-stone-600 bg-surface border border-stone-200 rounded-md hover:bg-stone-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                Prev
              </button>
              <span className="text-xs text-stone-500">Page {safePage + 1} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} className="px-2.5 py-1 text-xs font-medium text-stone-600 bg-surface border border-stone-200 rounded-md hover:bg-stone-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collections table */}
      {collections.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-8 mb-3">
            <h2 className="text-xs font-medium text-stone-400 uppercase tracking-wider">
              Collections ({collections.length})
            </h2>
            {selectedLists.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-600 font-medium">{selectedLists.size} selected</span>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${selectedLists.size} collection${selectedLists.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
                    setActionError("");
                    const ids = [...selectedLists];
                    setDeletingLists(new Set(ids));
                    const failed: string[] = [];
                    for (const id of ids) {
                      try { await deleteListAdmin(id, password); setCollections((prev) => prev.filter((c) => c.id !== id)); }
                      catch { failed.push(id); }
                    }
                    setSelectedLists(new Set(failed));
                    setDeletingLists(new Set());
                    if (failed.length > 0) setActionError(`Failed to delete ${failed.length} collection(s)`);
                  }}
                  disabled={deletingLists.size > 0}
                  className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
                >
                  {deletingLists.size > 0 ? "Deleting..." : "Delete"}
                </button>
                <button onClick={() => setSelectedLists(new Set())} className="px-2.5 py-1 text-xs text-stone-400 hover:text-stone-600 transition-colors">
                  Clear
                </button>
              </div>
            )}
          </div>
          <div className="bg-surface border border-stone-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs text-stone-400">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={collections.length > 0 && collections.every((c) => selectedLists.has(c.id))}
                      onChange={() => setSelectedLists((prev) =>
                        prev.size === collections.length ? new Set() : new Set(collections.map((c) => c.id))
                      )}
                      className="w-3.5 h-3.5 accent-stone-800"
                    />
                  </th>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Papers</th>
                  <th className="px-2 py-2 w-8 text-center">Token</th>
                  <th className="px-2 py-2 text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((col) => (
                  <tr
                    key={col.id}
                    className={`border-b border-stone-50 hover:bg-stone-50 transition-colors ${
                      selectedLists.has(col.id) ? "bg-stone-50" : ""
                    } ${deletingLists.has(col.id) ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedLists.has(col.id)}
                        onChange={() => setSelectedLists((prev) => {
                          const next = new Set(prev);
                          if (next.has(col.id)) next.delete(col.id); else next.add(col.id);
                          return next;
                        })}
                        className="w-3.5 h-3.5 accent-stone-800"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <a href={`/l?id=${col.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-blue-600 hover:text-blue-800 no-underline">
                        {col.id}
                      </a>
                    </td>
                    <td className="px-2 py-1.5 text-stone-800 max-w-[200px] truncate">{col.name || "Untitled"}</td>
                    <td className="px-2 py-1.5 text-stone-500 max-w-[200px] truncate text-xs">{col.description || "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-stone-700">{col.paper_count}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => {
                          const shareUrl = `${window.location.origin}/l?id=${col.id}&token=${col.owner_token}`;
                          navigator.clipboard.writeText(shareUrl);
                          setCopiedToken(col.id);
                          setTimeout(() => setCopiedToken((v) => v === col.id ? null : v), 1500);
                        }}
                        className="text-stone-300 hover:text-stone-600 transition-colors"
                        title="Copy ownership share link"
                      >
                        {copiedToken === col.id ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-xs text-stone-400 font-mono" title={col.created_at ? new Date(col.created_at).toLocaleString() : ""}>
                        {col.created_at ? timeAgo(col.created_at) : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* External dashboards */}
      <h2 className="text-xs font-medium text-stone-400 uppercase tracking-wider mt-8 mb-4">
        External Dashboards
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {externalLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center text-center bg-surface rounded-xl border border-stone-200
                       p-5 hover:border-stone-300 hover:shadow-md transition-all no-underline"
          >
            <div className="text-stone-400 mb-3">{link.icon}</div>
            <h3 className="text-sm font-semibold text-stone-900">{link.label}</h3>
            <p className="text-xs text-stone-400 mt-1">{link.description}</p>
          </a>
        ))}
      </div>

      {/* Contributors */}
      {contributors.length > 0 && (
        <>
          <h2 className="text-xs font-medium text-stone-400 uppercase tracking-wider mt-8 mb-4">
            Top Contributors
          </h2>
          <div className="bg-surface border border-stone-200 rounded-lg overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs text-stone-400 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5 text-right">Papers</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((c, i) => (
                  <tr key={i} className={`border-b border-stone-50 ${c.is_you ? "bg-emerald-50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-stone-900">
                      {c.name}
                      {c.is_you && <span className="ml-2 text-xs text-emerald-600 font-normal">(you)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-stone-500">{c.location}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-stone-700">{c.paper_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ratingsModal && password && (
        <RatingsModal
          paperId={ratingsModal.paperId}
          paperTitle={ratingsModal.title}
          password={password}
          onClose={() => setRatingsModal(null)}
        />
      )}

      {scriptsModal && password && (
        <ScriptsModal
          paperId={scriptsModal.paperId}
          paperTitle={scriptsModal.title}
          password={password}
          onClose={() => setScriptsModal(null)}
        />
      )}
    </div>
  );
}
