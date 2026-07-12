CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  fifa_rating NUMERIC(5, 2) NOT NULL,
  recent_form NUMERIC(5, 2) NOT NULL,
  attack_avg NUMERIC(5, 2) NOT NULL,
  defense_avg NUMERIC(5, 2) NOT NULL,
  xga NUMERIC(5, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  match_id TEXT UNIQUE,
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'seed',
  competition TEXT NOT NULL,
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT NOT NULL REFERENCES teams(id),
  home_score INTEGER NOT NULL DEFAULT 0,
  away_score INTEGER NOT NULL DEFAULT 0,
  full_match_home_score INTEGER,
  full_match_away_score INTEGER,
  penalty_shootout_home_score INTEGER,
  penalty_shootout_away_score INTEGER,
  result_decision TEXT CHECK (result_decision IN ('regulation', 'extra_time', 'penalties')),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'live', 'halftime', 'finished')),
  start_time TIMESTAMPTZ NOT NULL,
  kickoff_time TIMESTAMPTZ,
  stage TEXT NOT NULL DEFAULT 'group' CHECK (stage IN ('group', 'r32', 'r16', 'qf', 'sf', 'third_place', 'final')),
  minute INTEGER NOT NULL DEFAULT 0,
  winner_team_id TEXT REFERENCES teams(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition);
CREATE INDEX IF NOT EXISTS idx_matches_stage ON matches(stage);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_source_external_id ON matches(source, external_id) WHERE external_id IS NOT NULL;

UPDATE matches SET match_id = id WHERE match_id IS NULL;
UPDATE matches SET kickoff_time = start_time WHERE kickoff_time IS NULL;

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS winner_team_id TEXT REFERENCES teams(id);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  minute INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('goal', 'yellow_card', 'red_card')),
  team_id TEXT NOT NULL REFERENCES teams(id),
  player TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_match_minute ON events(match_id, minute);

CREATE TABLE IF NOT EXISTS predictions (
  match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  home_win_prob NUMERIC(7, 4) NOT NULL,
  draw_prob NUMERIC(7, 4) NOT NULL,
  away_win_prob NUMERIC(7, 4) NOT NULL,
  top_scores JSONB NOT NULL,
  score_probability_matrix JSONB,
  game_style TEXT NOT NULL CHECK (game_style IN ('defensive', 'balanced', 'open')),
  upset_risk TEXT NOT NULL CHECK (upset_risk IN ('low', 'medium', 'high')),
  expected_home_goals NUMERIC(5, 2) NOT NULL,
  expected_away_goals NUMERIC(5, 2) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version TEXT NOT NULL DEFAULT 'poisson-multifactor-v2'
);

ALTER TABLE predictions
ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'poisson-multifactor-v2';

ALTER TABLE predictions
ADD COLUMN IF NOT EXISTS score_probability_matrix JSONB;

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
