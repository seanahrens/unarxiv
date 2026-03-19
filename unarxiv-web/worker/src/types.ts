export interface Env {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
  MODAL_FUNCTION_URL: string;
  MODAL_WEBHOOK_SECRET: string;
  DAILY_GLOBAL_LIMIT: string;
  PER_IP_DAILY_LIMIT: string;
  PAPER_SUBMISSION_DAILY_LIMIT: string;
  QUEUE_BATCH_SIZE: string;
  ADMIN_PASSWORD: string;
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
  created_at: string;
  completed_at: string | null;
}

export type PaperStatus =
  | "not_requested"
  | "queued"
  | "preparing"
  | "generating_audio"
  | "complete"
  | "failed";

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
  audio_url: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
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
    audio_url: paper.status === "complete" ? `${apiOrigin}/api/papers/${paper.id}/audio` : null,
    audio_size_bytes: paper.audio_size_bytes,
    duration_seconds: paper.duration_seconds,
    created_at: paper.created_at,
    completed_at: paper.completed_at,
  };
}
