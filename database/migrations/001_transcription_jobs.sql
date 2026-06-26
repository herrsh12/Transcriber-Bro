-- Run once against your Neon database (after 000_base_schema.sql)
-- before deploying the backend to Render

-- Job tracking table
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id          SERIAL PRIMARY KEY,
  job_id      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  order_id    TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns to files table if they don't already exist
ALTER TABLE files ADD COLUMN IF NOT EXISTS transcription TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
--work on this