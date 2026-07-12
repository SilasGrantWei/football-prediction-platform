# Full-Match Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing 90-minute score unchanged and add verified full-match and penalty-shootout scores to the API, persistence layer, dashboard cards, and match detail page.

**Architecture:** Extend the existing `Match` and `ExternalScoreSnapshot` contracts with optional full-match fields. Preserve ESPN's aggregate score before the current regulation-time enrichment overwrites `homeScore`/`awayScore`, then carry all score groups through the synchronizer and persistence adapters. A small pure frontend presenter owns labels so detail and card views cannot drift.

**Tech Stack:** TypeScript, Express, Vitest, PostgreSQL migrations, Next.js 16, React, Tailwind CSS.

## Global Constraints

- `homeScore` / `awayScore` remain the 90-minute score and are the only score used by prediction evaluation.
- `fullMatchHomeScore` / `fullMatchAwayScore` include extra-time goals and exclude shootout kicks.
- Shootout scores are optional and separate.
- Never infer missing scores from `winnerTeamId`, team strength, or event counts.
- Existing demo-state JSON files remain readable.
- Finished prediction snapshots remain frozen.

---

### Task 1: Score Contracts and ESPN Parsing

**Files:**
- Modify: `services/api/src/models.ts`
- Modify: `services/api/src/services/liveScoreProvider.ts`
- Test: `services/api/tests/liveScoreProvider.test.ts`

**Interfaces:**
- Produces: `MatchDecision = "regulation" | "extra_time" | "penalties"`.
- Produces optional fields on `Match` and `ExternalScoreSnapshot`: `fullMatchHomeScore`, `fullMatchAwayScore`, `penaltyShootoutHomeScore`, `penaltyShootoutAwayScore`, `resultDecision`.
- ESPN `score` is the final on-field aggregate; `linescores.slice(0, 2)` remains the 90-minute truth.

- [ ] **Step 1: Write failing parser tests**

Add an extra-time event whose scoreboard score is `1-2` and summary first-two-period score is `1-1`; assert the returned snapshot preserves both groups. Add a penalties event with `shootoutScore` and assert shootout values are separate.

```ts
expect(snapshot).toMatchObject({
  homeScore: 1,
  awayScore: 1,
  fullMatchHomeScore: 1,
  fullMatchAwayScore: 2,
  resultDecision: "extra_time"
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test -w services/api -- --run tests/liveScoreProvider.test.ts`
Expected: FAIL because full-match fields are absent.

- [ ] **Step 3: Implement minimal parsing**

Extend `EspnCompetitor` with `shootoutScore?: string`. In `parseEspnEvent`, save validated aggregate scores as `fullMatch*` and derive `resultDecision` from ESPN status. In `enrichRegulationScores`, overwrite only `homeScore`/`awayScore`.

```ts
const aggregate = validatedScorePair(home.score, away.score);
return {
  homeScore: aggregate.home,
  awayScore: aggregate.away,
  fullMatchHomeScore: status === "finished" ? aggregate.home : undefined,
  fullMatchAwayScore: status === "finished" ? aggregate.away : undefined,
  resultDecision: parseResultDecision(event.status)
};
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run test -w services/api -- --run tests/liveScoreProvider.test.ts`
Expected: all provider tests pass.

---

### Task 2: Synchronization and Persistence

**Files:**
- Create: `infra/postgres/005_full_match_score.sql`
- Modify: `services/api/src/migrationRunner.ts`
- Modify: `services/api/src/repositories/matchRepository.ts`
- Modify: `services/api/src/demoStore.ts`
- Modify: `services/api/src/services/liveSimulator.ts`
- Test: `services/api/tests/migrationRunner.test.ts`
- Test: `services/api/tests/liveSimulator.test.ts`
- Test: `services/api/tests/demoStorePersistence.test.ts`

**Interfaces:**
- `MatchStateUpdate` carries all optional final-score fields.
- `updateMatchState()` writes the fields atomically with the 90-minute score.
- Reversed fixtures reverse all three score pairs.

- [ ] **Step 1: Write failing persistence and reversal tests**

Add assertions that an extra-time snapshot stores `1-1` for 90 minutes and `1-2` for full match. Add a reversed-order case and a demo-store reload case.

- [ ] **Step 2: Verify RED**

Run: `npm run test -w services/api -- --run tests/liveSimulator.test.ts tests/demoStorePersistence.test.ts tests/migrationRunner.test.ts`
Expected: FAIL on missing fields/columns.

- [ ] **Step 3: Add migration and adapters**

```sql
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS full_match_home_score INTEGER,
  ADD COLUMN IF NOT EXISTS full_match_away_score INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_shootout_home_score INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_shootout_away_score INTEGER,
  ADD COLUMN IF NOT EXISTS result_decision TEXT;
```

Map nullable row values into `Match`, pass score fields through `MatchStateUpdate`, and extend demo snapshots with optional fields. Update `applyScoreSnapshotsDetailed()` comparison and reverse-order mapping.

- [ ] **Step 4: Verify GREEN**

Run the focused command from Step 2.
Expected: all focused tests pass and legacy demo snapshots still load.

---

### Task 3: Shared Presentation and UI

**Files:**
- Create: `apps/web/lib/fullMatchScorePresentation.ts`
- Create: `apps/web/lib/fullMatchScorePresentation.test.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/match/[id]/page.tsx`
- Modify: `apps/web/components/MatchCard.tsx`

**Interfaces:**
- Produces `getFullMatchScorePresentation(match): { score: string; suffix: string; penaltyScore?: string } | null`.
- Consumers render only non-null verified finished results.

- [ ] **Step 1: Write failing presenter tests**

```ts
expect(getFullMatchScorePresentation(extraTimeMatch)).toEqual({
  score: "1-2",
  suffix: "加时后"
});
expect(getFullMatchScorePresentation(matchWithoutVerifiedFullScore)).toBeNull();
```

- [ ] **Step 2: Verify RED**

Run: `npm exec -w apps/web vitest -- run lib/fullMatchScorePresentation.test.ts`
Expected: FAIL because the presenter does not exist.

- [ ] **Step 3: Implement presenter and views**

Keep the dark primary score unchanged. Under it, render a light strip:

```tsx
{fullMatch ? (
  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">
    整场比分 <span className="score-text text-base text-ink">{fullMatch.score}</span> · {fullMatch.suffix}
    {fullMatch.penaltyScore ? ` · 点球 ${fullMatch.penaltyScore}` : ""}
  </div>
) : null}
```

Use the same presenter in `MatchCard` with smaller typography.

- [ ] **Step 4: Verify GREEN**

Run the focused presenter test and `npm run lint -w apps/web`.
Expected: tests and lint pass.

---

### Task 4: Runtime Backfill and End-to-End Verification

**Files:**
- Modify only if needed: `services/api/data/demo-match-state.json` through the existing sync endpoint, never by hand.

**Interfaces:**
- `POST /api/sync/manual` refreshes verified tournament scores.
- `GET /api/matches/qf-099` exposes both score groups.

- [ ] **Step 1: Run full verification**

Run: `npm run test`, `python -m unittest discover -s tests -p "test_*.py"`, `npm run lint`, `npm run build`.
Expected: zero failures.

- [ ] **Step 2: Restart through the existing supervisor-safe script**

Restart only the API listener, then run `scripts/start-local.ps1`; verify one keep-alive supervisor and HTTP 200 on ports 3000/4000.

- [ ] **Step 3: Sync and verify API truth**

Call `POST /api/sync/manual`, then assert `qf-099` returns:

```json
{
  "homeScore": 1,
  "awayScore": 1,
  "fullMatchHomeScore": 1,
  "fullMatchAwayScore": 2,
  "resultDecision": "extra_time"
}
```

- [ ] **Step 4: Verify rendered page**

Open `http://127.0.0.1:3000/match/qf-099` and verify both visible labels: `90分钟比分` with `1-1`, and `整场比分 1-2 · 加时后`.
