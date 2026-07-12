ALTER TABLE matches
ADD COLUMN IF NOT EXISTS winner_team_id TEXT REFERENCES teams(id);

UPDATE matches
SET home_score = 2,
    away_score = 2,
    minute = 90,
    winner_team_id = 'belgium',
    updated_at = NOW()
WHERE id = 'match-001'
  AND home_team_id = 'belgium'
  AND away_team_id = 'senegal'
  AND status = 'finished';
