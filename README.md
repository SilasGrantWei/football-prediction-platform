# Production Sports Intelligence System

World Cup real-time data, prediction, odds, simulation, and backtesting platform.

## Structure

```text
football-prediction-platform/
|-- backend/
|   |-- gateway/app.py
|   |-- ingestion/
|   |   |-- fixtures_engine.py
|   |   |-- fixtures_sync.py
|   |   |-- live_sync.py
|   |   |-- live_scores_sync.py
|   |   |-- odds_sync.py
|   |   `-- results_sync.py
|   |-- realtime/
|   |   |-- ws_hub.py
|   |   `-- ws_server.py
|   |-- ml/
|   |   |-- feature_store.py
|   |   |-- train_pipeline.py
|   |   `-- models/
|   |       |-- elo.py
|   |       |-- poisson_dixon_coles.py
|   |       |-- lgbm.py
|   |       `-- catboost.py
|   |-- simulation/
|   |   |-- monte_carlo.py
|   |   `-- backtest_engine.py
|   |-- api/
|   |   |-- matches.py
|   |   |-- odds.py
|   |   |-- predict.py
|   |   `-- simulate.py
|   |-- db.py
|   |-- espn_worldcup.py
|   |-- scheduler.py
|   `-- Dockerfile
|-- services/api/
|-- services/ai/
|-- apps/web/
|   |-- hooks/useWebSocket.ts
|   `-- components/
|       |-- LiveMatchFeed.tsx
|       |-- OddsComparisonPanel.tsx
|       `-- PredictionChart.tsx
|-- infra/postgres/
`-- docker-compose.yml
```

## Realtime Data

Python gateway:

- `GET /matches`
- `GET /live`
- `GET /odds/{match_id}`
- `GET /predict/{match_id}`
- `GET /simulate/worldcup?iterations=10000`
- `GET /backtest`
- `WS /ws/live`
- `WS /ws/match/{id}`
- `WS /ws/odds`

Node API compatibility:

- `GET /api/matches`
- `GET /api/matches/live`
- `GET /api/odds/{match_id}`
- `POST /api/sync/manual?job=all|fixtures|live|odds|results|train`

Local demo mode also syncs from ESPN automatically:

- current live window: every `LIVE_REFRESH_MS` milliseconds, default `10000`
- full tournament scoreboard/results: every `FULL_SCOREBOARD_REFRESH_MS` milliseconds, default `300000`
- full tournament range: `WORLD_CUP_TOURNAMENT_START=20260611` through `WORLD_CUP_TOURNAMENT_END=20260719`

This matters because the dashboard reads the Node API. If only the browser refreshes but the Node API is still serving an old in-memory snapshot, scores will appear stale. The Node API now refreshes the full ESPN scoreboard on startup and every five minutes, while keeping a faster live-window sync for in-progress matches.

## Scheduler

```text
fixtures_engine: every 10 minutes
live_sync: every 3 seconds
odds_sync: every 30 seconds
results_sync: every 5 minutes
daily_retrain: cron 03:00 UTC
```

## Real Match Detail Sources

The platform uses a layered, no-fabrication data policy:

1. `espn` is the default public structured provider for verified World Cup match detail. It can fill real team stats, rosters, substitutions, cards and goals when ESPN exposes them for a fixture.
2. `api-football` and `sportmonks` are configured as commercial enhancement providers for broader coverage, xG, richer events and official lineup feeds. They require API keys and provider-specific fixture mapping before their fields are used.
3. If a provider does not return a field, the API returns `null` and the UI shows "not connected" / missing-state text. It never invents xG, possession, player names, formations or events.

Relevant environment variables:

```powershell
$env:EXTERNAL_MATCH_DETAILS="true"
$env:MATCH_DETAIL_PROVIDER_PRIORITY="espn,api-football,sportmonks"
$env:API_FOOTBALL_KEY="<optional-api-football-key>"
$env:SPORTMONKS_API_KEY="<optional-sportmonks-key>"
```

ESPN public endpoints can be overridden with:

```powershell
$env:ESPN_WORLD_CUP_SCOREBOARD_URL="https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
$env:ESPN_WORLD_CUP_SUMMARY_URL="https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary"
$env:ESPN_MATCH_PAGE_BASE_URL="https://www.espn.com/soccer/match/_/gameId"
```

## Official Football Truth Layer

The official data layer is the single source of truth for verified match results.
Prediction outputs, live simulations, model probabilities and score bonuses are
not allowed to write into this layer.

Source priority is fixed:

```text
FIFA > UEFA > Kaggle
```

Official source definitions live in `data_sources/official_sources.py`:

- FIFA official source: https://inside.fifa.com/data-centre/matches
- UEFA quasi-official enrichment source
- Kaggle / historical fallback source

Place raw files in one of these locations:

```text
data/official/raw/fifa_matches.csv|json|jsonl|parquet
data/official/raw/uefa_matches.csv|json|jsonl|parquet
data/official/raw/kaggle_matches.csv|json|jsonl|parquet
```

Or configure explicit paths:

```powershell
$env:FIFA_OFFICIAL_MATCHES_FILE="C:\path\to\fifa_matches.csv"
$env:UEFA_OFFICIAL_MATCHES_FILE="C:\path\to\uefa_matches.csv"
$env:KAGGLE_HISTORY_MATCHES_FILE="C:\path\to\kaggle_matches.csv"
$env:OFFICIAL_MATCHES_JSON="data/official/official_matches.json"
```

Build the official layer and team master data:

```powershell
npm run etl:official
npm run etl:official:teams
```

Outputs:

```text
data/official/official_matches.parquet
data/official/official_matches.json
data/official/official_matches.csv
data/official/team_master.parquet
data/official/team_master.json
data/official/team_master.csv
```

Node API endpoints:

```text
GET /official/status
GET /official/match/{match_id}
GET /api/official/status
GET /api/official/match/{match_id}
```

If `OFFICIAL_MATCHES_JSON` is explicitly configured but missing, the API returns
an unavailable official layer instead of falling back to stale local data.

## Local Run

```powershell
cd C:\Code\CodexRepair\football-prediction-platform
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
npm install
```

Start PostgreSQL locally and set:

```powershell
$env:DATABASE_URL="postgres://football:football@localhost:5432/football_predictions"
$env:ODDS_API_KEY="<optional-the-odds-api-key>"
```

Run the realtime gateway:

```powershell
uvicorn gateway.app:app --app-dir backend --host 0.0.0.0 --port 8000
```

Run ingestion and training scheduler:

```powershell
python backend\scheduler.py
```

Run Node API and web:

```powershell
$env:DEMO_MODE="false"
$env:NEXT_PUBLIC_DATA_WS_URL="ws://localhost:8000"
npm run dev
```

## World Cup Historical Score Enhancer

This module is a post-processing layer for exact-score predictions. It does
not replace the base score model. It rebuilds historical 90-minute World Cup
score outcomes from auditable public data, then uses that historical image for
candidate score calibration, Top 3 filtering, and 3x1 combination ranking.

Download the auditable public source data first:

```powershell
npm run etl:worldcup:download
```

The downloader writes `data/worldcup/raw/source_manifest.json` with source
URLs, byte counts, and SHA256 checksums. `data/worldcup/raw/` should include:

- `fjelstul/matches.csv`
- `fjelstul/goals.csv`
- `fjelstul/tournament_stages.csv`
- `fjelstul/host_countries.csv`
- `martj42/results.csv`
- `martj42/shootouts.csv`

Run the full pipeline:

```powershell
npm run etl:worldcup:download
npm run etl:worldcup:elo
npm run etl:worldcup:reg90
npm run etl:worldcup:priors
npm run backtest:worldcup-enhancer
npm run test:worldcup-enhancer
```

Important rules:

- Score paths only count 90-minute regulation time, including 45+/90+ stoppage time.
- `matches.csv` final scores are not used as the betting score path.
- Extra-time goals are excluded.
- Penalty shootouts are excluded.
- Backtests must use rolling validation. A historical image can only use data before the tested tournament.
- If `artifacts/worldcup_enhancer_report.json` has a `promotion_gate.decision`
  other than `promotion_ready`, the enhancer is only an explanation and
  analysis layer. It must not affect frontend recommendation ranking.

## Docker

```powershell
$env:ODDS_API_KEY="<optional-the-odds-api-key>"
docker compose up --build
```

Services:

- Web: http://localhost:3000/dashboard
- Node API: http://localhost:4000/health
- Realtime Gateway: http://localhost:8000/health
- AI service: http://localhost:8001/health
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Verification

```powershell
python -m py_compile backend\db.py backend\espn_worldcup.py backend\scheduler.py backend\gateway\app.py backend\realtime\ws_hub.py backend\ingestion\fixtures_engine.py backend\ingestion\live_sync.py backend\ingestion\odds_sync.py backend\ml\feature_store.py backend\ml\train_pipeline.py backend\simulation\monte_carlo.py backend\simulation\backtest_engine.py
npm run build
npm run test -w services/api
npm run test:ai
```

Notes:

- Fixtures use ESPN/FIFA World Cup public schedule data and structural tournament backfill.
- Odds use The Odds API when `ODDS_API_KEY` is present; no fake market odds are written when the key is missing.
- Match-detail xG, possession, lineups and player events are shown only when a connected source returns them. Missing fields remain empty instead of being estimated.

## Project Health

- License: MIT, see `LICENSE`.
- Dependencies: see `DEPENDENCIES.md` and ecosystem manifests.
- Security: see `SECURITY.md`.
- Support: see `SUPPORT.md`.
- Contributing: see `CONTRIBUTING.md`.
- Code of conduct: see `CODE_OF_CONDUCT.md`.
- Releases: see `CHANGELOG.md` and `RELEASE_NOTES.md`.
- Citation: see `CITATION.cff`.

## Open Source Release

The repository is prepared for a public MIT-licensed release. Before uploading
to GitHub, create a clean package that excludes local dependencies, virtual
environments, build caches, logs, and secrets:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-oss-package.ps1
```

The generated archive is written next to this folder as
`football-prediction-platform-oss.zip`. Use `docs/OSS_RELEASE_CHECKLIST.md` for
the upload steps and `docs/openai-codex-for-oss-application.md` for the OpenAI
Codex for OSS form draft.
