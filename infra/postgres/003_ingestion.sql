ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_status_check CHECK (status IN ('scheduled', 'live', 'halftime', 'finished'));

ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_id TEXT;
UPDATE matches SET match_id = id WHERE match_id IS NULL;
ALTER TABLE matches ALTER COLUMN match_id SET NOT NULL;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS kickoff_time TIMESTAMPTZ;
UPDATE matches SET kickoff_time = start_time WHERE kickoff_time IS NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'group';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_match_id ON matches(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_stage ON matches(stage);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_source_external_id ON matches(source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS match_results (
  match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT NOT NULL REFERENCES teams(id),
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status = 'finished'),
  kickoff_time TIMESTAMPTZ NOT NULL,
  stage TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ingestion',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id BIGSERIAL PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  bookmaker TEXT NOT NULL DEFAULT 'consensus',
  home_odds NUMERIC(8, 3) NOT NULL,
  draw_odds NUMERIC(8, 3) NOT NULL,
  away_odds NUMERIC(8, 3) NOT NULL,
  home_implied_prob NUMERIC(8, 5) NOT NULL,
  draw_implied_prob NUMERIC(8, 5) NOT NULL,
  away_implied_prob NUMERIC(8, 5) NOT NULL,
  overround NUMERIC(8, 5) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_match_time ON odds_snapshots(match_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS team_elo_ratings (
  team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  rating NUMERIC(8, 3) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_training_runs (
  model_version TEXT PRIMARY KEY,
  trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  train_rows INTEGER NOT NULL,
  validation_rows INTEGER NOT NULL,
  log_loss NUMERIC(10, 6),
  brier_score NUMERIC(10, 6),
  artifact_path TEXT NOT NULL,
  champion BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB
);
