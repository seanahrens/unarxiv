-- Add voice_tier column to ratings table
-- Records which voice quality tier was the best available when the review was written
-- Values: 'elevenlabs' (+++), 'openai' (++), 'free' (+), 'base', or NULL (legacy ratings)
ALTER TABLE ratings ADD COLUMN voice_tier TEXT;
