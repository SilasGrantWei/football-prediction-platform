# Release Notes

## v0.1.3

Version publication update for the verified score-sync and model-reliability release.

### Highlights

- Publishes the current root, Web, and API packages consistently as `0.1.3`.
- Includes the verified 90-minute/full-match score separation, automatic result synchronization, persistent match state, prediction calibration, and light broadcast dashboard delivered in the preceding update.
- Preserves `v0.1.2` as an immutable historical release instead of rewriting its tag.

### Verification

- Package metadata and lockfile versions are aligned at `0.1.3`.
- API, Web, AI, Python, lint, and production-build checks are rerun before publishing.

## v0.1.2

Reliability, model-calibration, and verified-score update for the public repository.

### Highlights

- Separates the official 90-minute score from the full-match score and penalty shootout, without changing prediction evaluation semantics.
- Adds automatic ESPN tournament refresh, Beijing-time schedule grouping, persistent match state, and reboot-safe local startup.
- Upgrades exact-score generation and post-match learning with Poisson + Elo + FIFA priors, causal rest context, participant-bound snapshots, and safer refresh checkpoints.
- Ships the light broadcast dashboard redesign with clearer score, status, lineup, and review presentation.
- Rejects invalid provider score pairs and prioritizes explicit shootout evidence to prevent fabricated or mislabeled results.

### Verification

Validated before publishing:

- Node API: 124 tests passed.
- Web: 7 tests passed.
- AI service: 6 tests passed.
- Python pipeline: 18 tests passed.
- ESLint and production builds passed.
- Runtime verification confirmed `qf-099` as 90 minutes `1-1`, full match `1-2`, decided after extra time.

## v0.1.1

Maintenance and data-pipeline update for the public repository.

### Highlights

- Adds an official football truth layer with source priority, generated match outputs, team master data, and API access.
- Adds a World Cup historical exact-score enhancer with ETL, rolling validation, score-prior artifacts, and tests.
- Adds frontend diagnostics for World Cup score enhancement and 3x1/parlay ranking workflows.
- Expands API services for official match lookup, exact-score Poisson ranking, match display policy, and failure analysis.
- Cleans release packaging by excluding TypeScript build info and documenting public data source provenance.

### Verification

Run before tagging:

```powershell
npm run build
npm run test:api
npm run test:ai
npm run test:worldcup-enhancer
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-oss-package.ps1
```

## v0.1.0

Initial public source release for Production Sports Intelligence System.

### Highlights

- Full-stack football intelligence monorepo with web dashboard, Node API, Python realtime backend, FastAPI AI service, PostgreSQL schema, and Docker Compose.
- Transparent data policy: provider facts and model predictions are separated, and missing provider fields stay missing.
- Local development scripts, tests, CI workflow, release checklist, and Codex for OSS application draft.

### Verification

Run before tagging:

```powershell
npm run build
npm run test:api
npm run test:ai
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-oss-package.ps1
```
