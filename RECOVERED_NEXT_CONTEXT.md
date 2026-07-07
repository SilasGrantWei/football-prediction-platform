# Recovered Project Context

This is the readable continuation context for the old Codex thread:

`构建足球比赛预测网站`

The full original 16GB rollout is preserved at:

`C:\Users\helen\Desktop\codex-left-sidebar-repair-20260707-103735\ORIGINAL-16GB-rollout-2026-07-02T05-30-24-019f1f96-fef5-7392-89b3-b4bdfd3190f8.jsonl`

Do not put that 16GB file back into the active Codex session path. It makes the
left sidebar and `codex doctor` slow or empty again. Use this file as the
working context.

## Original User Request

Build a football match prediction website.

Required features from the original prompt:

- Match list for World Cup / league matches
- Realtime score
- AI win/draw/loss prediction
- Top 3 score predictions
- Upset risk analysis
- Match trend chart
- WebSocket updates
- Redis cache
- 10 second refresh
- Dashboard, match detail, live, and analytics pages
- Next.js, TypeScript, TailwindCSS, Recharts frontend
- Node.js, PostgreSQL, Redis backend
- FastAPI/Python AI layer
- Poisson model plus rule-based prediction logic

## Real Project Path

`C:\Code\CodexRepair\football-prediction-platform`

## Implemented Structure

- `apps/web`
  - Next.js app pages: `/dashboard`, `/match/[id]`, `/live`, `/analytics`, `/parlay`, `/simulation`
  - Main components include match cards, realtime refresh, live board/feed, odds panel, prediction chart, analytics charts, post-match review, lineup validation, score top 3, and probability bars.
- `services/api`
  - Node/Express API routes for matches, live matches, odds, sync, analytics, official data, and simulation.
  - Prediction service uses Poisson/Dixon-Coles, team records, pre-match context, lineup projection, post-match calibration, and World Cup score enhancement.
  - Demo mode can run without PostgreSQL.
- `backend`
  - Python gateway, ingestion, realtime websocket hub, ML models, scheduler, simulation, backtest, and DB helpers.
- `data_sources` and `etl`
  - Official football truth layer with FIFA / UEFA / Kaggle priority.
- `scripts`
  - Local startup, Windows scheduled task registration, OSS packaging, AI test, and World Cup ETL scripts.
- `docs`
  - OSS release checklist, Codex for OSS application draft, security audit, and SBOM.

## Important Scripts

```powershell
npm run dev
npm run dev:demo
npm run start:local
npm run startup:register
npm run startup:unregister
npm run build
npm run test:api
npm run test:ai
npm run etl:official
npm run etl:official:teams
npm run etl:worldcup:download
npm run etl:worldcup:elo
npm run etl:worldcup:reg90
npm run etl:worldcup:priors
npm run backtest:worldcup-enhancer
npm run test:worldcup-enhancer
```

## Latest Recovered Conversation Segment

The tail of the original thread contained two active user issues:

1. "每次重启电脑，网站就打不开了"
2. "比赛都结束了，你这个接口还在这个页面，修复下"

The second issue was fixed after recovery:

- Added `services/api/src/services/matchDisplayPolicy.ts`
- Added `services/api/tests/matchDisplayPolicy.test.ts`
- Updated `services/api/src/routes/matches.ts`
- Rule: if a match is still `scheduled` more than 150 minutes after kickoff,
  treat it as a stale placeholder for list displays.
- Keep the match available by ID for debugging, but do not show it in `/matches`
  list responses or dashboard sections.

Verification after that fix:

```powershell
npm run test:api
npm run build
```

Both passed. API tests reported 11 test files and 80 tests passing.

## Current Project Status

The project is real and mostly implemented, but not finished as a polished
local product.

Known implemented areas:

- Local demo mode
- Dashboard and match detail pages
- Live/realtime UI pieces
- Node API for matches, live matches, odds, analytics, official data, and simulation
- Prediction model with Poisson/Dixon-Coles and World Cup-specific context
- Post-match calibration and model quality checks
- Official result truth layer
- ESPN/public match detail provider scaffolding
- Optional commercial provider scaffolding for API-Football and Sportmonks
- World Cup historical score enhancement pipeline
- OSS release packaging and application docs
- Windows local startup scripts

Still likely needs follow-up:

- Confirm the Windows startup task is actually registered on this machine.
- Run `npm run start:local` and verify `http://localhost:3000/dashboard`.
- If startup fails after reboot, inspect `logs/startup.log`, `logs/api.log`, and `logs/web.log`.
- Decide whether demo mode is enough or PostgreSQL/Redis/Docker should be the default local setup.
- Verify current live score/result data after the stale scheduled filter.
- Continue hardening official result sync so completed matches become `finished`
  instead of only being hidden as stale placeholders.
- Re-run release packaging after final fixes.

## Safe Continuation Prompt

Use this if continuing in a new Codex thread:

```text
Continue work in C:\Code\CodexRepair\football-prediction-platform.
Read RECOVERED_NEXT_CONTEXT.md first.
The old 16GB Codex thread is preserved but must not be restored to the active sessions path.
Focus on finishing the local football prediction website, especially:
1. verify Windows startup after reboot,
2. verify dashboard at http://localhost:3000/dashboard,
3. fix any startup/log/service issues,
4. verify stale finished/scheduled match behavior,
5. run npm run test:api and npm run build.
Do not rebuild the project from scratch.
```
