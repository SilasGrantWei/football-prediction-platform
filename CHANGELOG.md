# Changelog

All notable changes to this project will be documented in this file.

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

