-- Run first on a fresh Neon database (SQL Editor or psql)

CREATE TABLE IF NOT EXISTS files (
  id                SERIAL PRIMARY KEY,
  filename          TEXT NOT NULL,
  originalfilepath  TEXT NOT NULL,
  transcription     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,
  order_id    TEXT NOT NULL UNIQUE,
  amount      NUMERIC(10, 2) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'INR',
  file_name   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'created',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
