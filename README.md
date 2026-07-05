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
