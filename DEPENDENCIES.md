# Dependencies

This project uses standard ecosystem manifests and lockfiles as the source of
truth for dependencies.

## Manifest sources

| Ecosystem | Manifest | Lockfile | Purpose |
|---|---|---|---|
| Node.js workspace | `package.json` | `package-lock.json` | Root scripts and workspace dependencies |
| Node.js API service | `services/api/package.json` | `package-lock.json` | Express API, WebSocket service, tests, TypeScript build |
| Node.js web app | `apps/web/package.json` | `package-lock.json` | Next.js dashboard, React UI, charting |
| Python realtime backend | `backend/requirements.txt` | None yet | FastAPI gateway, ingestion, ML, simulation |
| Python AI service | `services/ai/requirements.txt` | None yet | FastAPI prediction API and tests |
| Python ML extras | `services/ai/requirements-ml.txt` | None yet | Optional heavier ML training engines |

## Direct Node runtime dependencies

| Package | Version range | Purpose |
|---|---:|---|
| `cors` | `^2.8.5` | API CORS middleware |
| `express` | `^4.19.2` | Node API server |
| `pg` | `^8.12.0` | PostgreSQL client |
| `redis` | `^4.7.0` | Redis integration |
| `ws` | `^8.18.0` | WebSocket transport |
| `zod` | `^3.23.8` | Runtime schema validation |
| `clsx` | `^2.1.1` | UI class composition |
| `lucide-react` | `^0.468.0` | Icons |
| `next` | `16.2.10` | Web application framework |
| `react` | `18.3.1` | UI runtime |
| `react-dom` | `18.3.1` | React DOM renderer |
| `recharts` | `^2.15.0` | Charts |

## Direct Python runtime dependencies

| Package | Version range | Purpose |
|---|---:|---|
| `apscheduler` | `3.10.4` | Scheduled ingestion and training jobs |
| `psycopg[binary]` | `3.2.3` | PostgreSQL client |
| `fastapi` | `0.115.6` | Python HTTP APIs |
| `uvicorn[standard]` | `0.34.0` | ASGI server |
| `httpx` | `0.28.1` | HTTP provider clients |
| `numpy` | `2.2.6` / `>=1.26.0` | Numerical operations |
| `pandas` | `2.3.0` / `>=2.2.0` | Data frames and training data |
| `scikit-learn` | `1.7.0` / `>=1.4.0` | ML model support |
| `mlflow` | `2.22.1` | ML experiment and model tracking |
| `lightgbm` | `4.6.0` / `>=4.3.0` | Gradient boosting model |
| `catboost` | `1.2.8` | Gradient boosting model |
| `pydantic` | `2.10.5` | API schemas |
| `pytest` | `8.3.4` | Python tests |
| `torch` | `>=2.3.0` | Optional neural model support |
| `xgboost` | `>=2.0.0` | Optional gradient boosting model |
| `joblib` | `>=1.3.0` | Model artifact serialization |

## External services and APIs

| Service | Required | Authentication | Purpose |
|---|---|---|---|
| ESPN public endpoints | No key | None | Public structured match and scoreboard data |
| The Odds API | Optional | `ODDS_API_KEY` | Market odds ingestion |
| API-Football | Optional | `API_FOOTBALL_KEY` | Commercial match-detail enrichment |
| SportMonks | Optional | `SPORTMONKS_API_KEY` | Commercial match-detail enrichment |
| PostgreSQL | Local or hosted | `DATABASE_URL` | Persistent platform data |
| Redis | Optional local service | `REDIS_URL` | Realtime/cache integration |

## Review notes

- No third-party source trees are intentionally vendored in this repository.
- `node_modules`, Python virtual environments, build output, logs, and local caches are excluded from release packages.
- Dependency licenses and vulnerability state should be reviewed with GitHub Dependency Graph after the public repository is created.
- If a future release vendors code or distributes binaries, add or update `THIRD_PARTY_NOTICES.md`.

