export interface Env {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
  MODAL_FUNCTION_URL: string;
  MODAL_PREMIUM_FUNCTION_URL?: string;
  MODAL_WEBHOOK_SECRET: string;
  DAILY_GLOBAL_LIMIT: string;
  PER_IP_DAILY_LIMIT: string;
  PAPER_SUBMISSION_DAILY_LIMIT: string;
  ADMIN_PASSWORD: string;
  ENCRYPTION_KEY: string; // AES-256-GCM key material for encrypting user API keys
  HF_LIST_ID?: string;
}

export interface NarrationVersion {
  id: number;
  paper_id: string;
  narration_tier: "base" | "plus1" | "plus2" | "plus3";
  quality_rank: number;
  tts_provider: string | null;
  tts_model: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  audio_r2_key: string | null;
  transcript_r2_key: string | null;
  duration_seconds: number | null;
  actual_cost: number | null;
  llm_cost: number | null;
  tts_cost: number | null;
  // Track 2: actual token counts for ML cost model training
  actual_input_tokens: number | null;
  actual_output_tokens: number | null;
  provider_model: string | null; // e.g. "anthropic:claude-sonnet-4-6"
  created_at: string;
}

export interface Paper {
  id: string;
  arxiv_url: string;
  title: string;
  authors: string; // JSON array
  abstract: string;
  published_date: string;
  status: PaperStatus;
  error_message: string | null;
  progress_detail: string | null;
  eta_seconds: number | null;
  audio_r2_key: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
  submitted_by_ip: string | null;
  submitted_by_token: string | null;
  submitted_by_country: string | null;
  submitted_by_city: string | null;
  rating_count: number;
  rating_sum: number;
  bayesian_avg: number | null;
  has_low_rating: boolean;
  best_version_id: number | null;
  script_char_count: number | null;
  // Track 1: source stats for cost estimation (populated on first narration)
  tar_bytes: number | null;
  latex_char_count: number | null;
  figure_count: number | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export type PaperStatus = "unnarrated" | "narrating" | "narrated" | "failed";

export interface PaperResponse {
  id: string;
  arxiv_url: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string;
  status: PaperStatus;
  error_message: string | null;
  progress_detail: string | null;
  eta_seconds: number | null;
  audio_url: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
  best_version_id: number | null;
  created_at: string;
  completed_at: string | null;
}

// --- Lists ---

export interface List {
  id: string;
  owner_token: string;
  name: string;
  description: string;
  publicly_listed: number; // 0 or 1
  creator_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListItem {
  id: number;
  list_id: string;
  paper_id: string;
  position: number;
  added_at: string;
}

export interface ListResponse {
  id: string;
  name: string;
  description: string;
  publicly_listed: boolean;
  created_at: string;
  updated_at: string;
  paper_count: number;
}

export function paperToResponse(paper: Paper, apiOrigin: string): PaperResponse {
  return {
    id: paper.id,
    arxiv_url: paper.arxiv_url,
    title: paper.title,
    authors: JSON.parse(paper.authors),
    abstract: paper.abstract,
    published_date: paper.published_date,
    status: paper.status,
    error_message: paper.error_message,
    progress_detail: paper.progress_detail,
    eta_seconds: paper.eta_seconds,
    audio_url: paper.audio_r2_key ? `${apiOrigin}/api/papers/${paper.id}/audio` : null,
    audio_size_bytes: paper.audio_size_bytes,
    duration_seconds: paper.duration_seconds,
    best_version_id: paper.best_version_id,
    created_at: paper.created_at,
    completed_at: paper.completed_at,
  };
}
