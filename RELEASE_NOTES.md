# Release Notes

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
