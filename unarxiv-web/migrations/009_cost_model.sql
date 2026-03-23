-- Migration 009: Cost model training data columns
--
-- Track 1: Store source stats on papers for accurate cost estimation.
-- Track 2: Store actual LLM token counts on narration_versions for ML training;
--          add model_coefficients table for trained linear regression coefficients.

-- Source stats on papers (populated by Modal during narration via webhook)
ALTER TABLE papers ADD COLUMN tar_bytes        INTEGER;
ALTER TABLE papers ADD COLUMN latex_char_count INTEGER;
ALTER TABLE papers ADD COLUMN figure_count     INTEGER;

-- Actual token counts on narration_versions (populated by Modal premium narrations)
ALTER TABLE narration_versions ADD COLUMN actual_input_tokens  INTEGER;
ALTER TABLE narration_versions ADD COLUMN actual_output_tokens INTEGER;
ALTER TABLE narration_versions ADD COLUMN provider_model       TEXT;

-- ML model coefficients (written by evals/cost_model/train.py --deploy)
CREATE TABLE IF NOT EXISTS model_coefficients (
    provider_model         TEXT PRIMARY KEY,  -- e.g. "anthropic:claude-sonnet-4-6"
    input_token_coeffs     TEXT NOT NULL,     -- JSON array: [latex_chars, figures, tar_bytes, script_chars]
    input_token_intercept  REAL NOT NULL,
    output_token_coeffs    TEXT NOT NULL,     -- JSON array: same feature order
    output_token_intercept REAL NOT NULL,
    input_rmse             REAL NOT NULL,     -- ML RMSE on test set (input tokens)
    output_rmse            REAL NOT NULL,     -- ML RMSE on test set (output tokens)
    proxy_input_rmse       REAL NOT NULL,     -- proxy formula RMSE (for comparison)
    proxy_output_rmse      REAL NOT NULL,
    sample_count           INTEGER NOT NULL,  -- number of training samples
    trained_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
