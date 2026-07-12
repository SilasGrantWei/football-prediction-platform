ALTER TABLE matches
ADD COLUMN IF NOT EXISTS full_match_home_score INTEGER,
ADD COLUMN IF NOT EXISTS full_match_away_score INTEGER,
ADD COLUMN IF NOT EXISTS penalty_shootout_home_score INTEGER,
ADD COLUMN IF NOT EXISTS penalty_shootout_away_score INTEGER,
ADD COLUMN IF NOT EXISTS result_decision TEXT
  CHECK (result_decision IN ('regulation', 'extra_time', 'penalties'));
