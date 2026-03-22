-- Seed data for local development
-- Run: cd worker && npm run db:seed
--
-- Provides a handful of papers in various statuses so you can test
-- the full UI without hitting production or running narration.

-- A narrated paper with audio metadata.
-- The db:seed script copies fixtures/silence.mp3 into local R2 so audio playback works.
INSERT OR IGNORE INTO papers (id, arxiv_url, title, authors, abstract, published_date, status, audio_r2_key, audio_size_bytes, duration_seconds, script_char_count, created_at, completed_at)
VALUES (
  '2301.07041',
  'https://arxiv.org/abs/2301.07041',
  'Mastering Diverse Domains through World Models',
  '["Danijar Hafner","Jurgis Pasukonis","Jimmy Ba","Timothy Lillicrap"]',
  'General intelligence requires solving tasks across many domains. Existing reinforcement learning algorithms specialize to individual domains. We present DreamerV3, the first algorithm to collect diamonds in Minecraft from scratch without human data or curricula.',
  '2023-01-18',
  'narrated',
  'audio/2301.07041.mp3',
  15728640,
  1847,
  50000,
  datetime('now', '-7 days'),
  datetime('now', '-7 days')
);

-- Free-tier narration version for the narrated paper (base quality, no premium upgrade)
INSERT OR IGNORE INTO narration_versions (paper_id, version_type, quality_rank, script_type, tts_provider, tts_model, audio_r2_key, duration_seconds)
VALUES ('2301.07041', 'free', 0, 'free', 'openai', 'tts-1', 'audio/2301.07041.mp3', 1847);

-- A paper currently being narrated
INSERT OR IGNORE INTO papers (id, arxiv_url, title, authors, abstract, published_date, status, eta_seconds, created_at)
VALUES (
  '2303.08774',
  'https://arxiv.org/abs/2303.08774',
  'GPT-4 Technical Report',
  '["OpenAI"]',
  'We report the development of GPT-4, a large-scale, multimodal model which can accept image and text inputs and produce text outputs.',
  '2023-03-15',
  'narrating',
  120,
  datetime('now', '-1 hour')
);

-- An unnarrated paper
INSERT OR IGNORE INTO papers (id, arxiv_url, title, authors, abstract, published_date, status, created_at)
VALUES (
  '1706.03762',
  'https://arxiv.org/abs/1706.03762',
  'Attention Is All You Need',
  '["Ashish Vaswani","Noam Shazeer","Niki Parmar","Jakob Uszkoreit","Llion Jones","Aidan N. Gomez"]',
  'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.',
  '2017-06-12',
  'unnarrated',
  datetime('now', '-2 days')
);

-- A failed paper
INSERT OR IGNORE INTO papers (id, arxiv_url, title, authors, abstract, published_date, status, error_message, created_at)
VALUES (
  '2302.00672',
  'https://arxiv.org/abs/2302.00672',
  'Toolformer: Language Models Can Teach Themselves to Use Tools',
  '["Timo Schick","Jane Dwivedi-Yu","Roberto Dessi","Roberta Raileanu"]',
  'Language models exhibit remarkable abilities to solve new tasks from just a few examples or textual instructions. We show that LMs can teach themselves to use external tools via simple APIs.',
  '2023-02-09',
  'failed',
  'LaTeX source not available for this paper',
  datetime('now', '-3 days')
);

-- Some page visits so popularity ranking works
INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES ('2301.07041', '127.0.0.1');
INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES ('2301.07041', '127.0.0.2');
INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES ('2301.07041', '127.0.0.3');
INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES ('1706.03762', '127.0.0.1');
INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES ('1706.03762', '127.0.0.2');
INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES ('2303.08774', '127.0.0.1');

-- A sample rating
INSERT OR IGNORE INTO ratings (paper_id, rater_ip, stars, comment)
VALUES ('2301.07041', '127.0.0.1', 4, 'Great narration quality');

-- A sample collection
INSERT OR IGNORE INTO lists (id, owner_token, name, description)
VALUES ('test', 'deadbeefdeadbeefdeadbeefdeadbeef', 'ML Classics', 'Classic machine learning papers');

INSERT OR IGNORE INTO list_items (list_id, paper_id, position)
VALUES ('test', '1706.03762', 0);
INSERT OR IGNORE INTO list_items (list_id, paper_id, position)
VALUES ('test', '2301.07041', 1);
