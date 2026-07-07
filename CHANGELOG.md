# Changelog

All notable changes to this project will be documented in this file.

## 0.1.1 - 2026-07-07

### Added

- Official football truth layer with FIFA/UEFA/Kaggle source priority, generated official match outputs, and API endpoints.
- World Cup historical exact-score enhancer with ETL scripts, rolling backtest, score-prior artifacts, and tests.
- Frontend views for parlay ranking, backend retry state, and World Cup score enhancement diagnostics.
- Additional API services for official match lookup, exact-score Poisson ranking, failure-cluster analysis, and match display policies.

### Changed

- Expanded README setup notes for official data, World Cup ETL, and no-fabrication score rules.
- Updated package metadata and release hygiene for the new data pipeline.

### Security

- Added `*.tsbuildinfo` to ignored/generated artifacts and excluded it from release packaging.
- Documented public data source provenance in third-party notices.

## 0.1.0 - 2026-07-05

Initial open-source release preparation.

### Added

- Next.js dashboard for live match, analytics, simulation, and match-detail views.
- Node API service for matches, odds, synchronization, analytics, and simulation routes.
- Python realtime gateway, ingestion jobs, simulation engine, and ML training pipeline.
- FastAPI AI service with rule fallback, Poisson, Elo, and gradient-model integration.
- PostgreSQL schema, seed data, Docker Compose setup, and local startup scripts.
- Test coverage for API services, prediction services, match-detail providers, and AI service contracts.
- Open-source project files: MIT license, contribution guide, security policy, CI workflow, release checklist, and Codex for OSS application draft.

### Security

- Added `.env.example` and `.gitignore` rules to keep runtime secrets and local generated files out of public releases.
- Added a no-fabrication data policy for provider-backed match details.
