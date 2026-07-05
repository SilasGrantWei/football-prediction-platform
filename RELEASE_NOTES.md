# Release Notes

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

