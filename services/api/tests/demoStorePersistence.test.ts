import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Prediction } from "../src/models.js";

const originalSnapshotPath = process.env.DEMO_PREDICTION_SNAPSHOT_PATH;
const originalMatchStatePath = process.env.DEMO_MATCH_STATE_SNAPSHOT_PATH;
let tempDirectory: string | undefined;

afterEach(() => {
  vi.resetModules();
  if (originalSnapshotPath === undefined) delete process.env.DEMO_PREDICTION_SNAPSHOT_PATH;
  else process.env.DEMO_PREDICTION_SNAPSHOT_PATH = originalSnapshotPath;
  if (originalMatchStatePath === undefined) delete process.env.DEMO_MATCH_STATE_SNAPSHOT_PATH;
  else process.env.DEMO_MATCH_STATE_SNAPSHOT_PATH = originalMatchStatePath;
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = undefined;
});

describe("demo prediction snapshots", () => {
  it("reloads a scheduled prediction after the demo store module restarts", async () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "football-demo-predictions-"));
    process.env.DEMO_PREDICTION_SNAPSHOT_PATH = join(tempDirectory, "predictions.json");
    const prediction: Prediction = {
      matchId: "qf-098",
      homeWinProb: 0.61,
      drawProb: 0.23,
      awayWinProb: 0.16,
      topScores: [
        { score: "2-1", probability: 0.18 },
        { score: "2-0", probability: 0.14 },
        { score: "1-0", probability: 0.12 }
      ],
      gameStyle: "balanced",
      upsetRisk: "medium",
      expectedHomeGoals: 2.1,
      expectedAwayGoals: 0.9,
      generatedAt: "2026-07-10T17:00:00.000Z",
      modelVersion: "persistent-snapshot-test"
    };

    const firstModule = await import("../src/demoStore.js");
    firstModule.demoStore.upsertPrediction(prediction);

    vi.resetModules();
    const restartedModule = await import("../src/demoStore.js");

    expect(restartedModule.demoStore.findById("qf-098")?.prediction?.modelVersion).toBe("persistent-snapshot-test");
    expect(restartedModule.demoStore.findById("qf-098")?.prediction?.topScores).toEqual(prediction.topScores);
  });

  it("reloads a shootout winner and resolves the next bracket after restart", async () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "football-demo-match-state-"));
    process.env.DEMO_MATCH_STATE_SNAPSHOT_PATH = join(tempDirectory, "match-state.json");

    const firstModule = await import("../src/demoStore.js");
    firstModule.demoStore.updateMatchState("qf-099", {
      homeTeamId: "norway",
      awayTeamId: "england",
      homeScore: 1,
      awayScore: 1,
      fullMatchHomeScore: 1,
      fullMatchAwayScore: 2,
      penaltyShootoutHomeScore: undefined,
      penaltyShootoutAwayScore: undefined,
      resultDecision: "extra_time",
      winnerTeamId: "england",
      status: "finished",
      startTime: "2026-07-11T21:00:00.000Z",
      minute: 90
    });

    vi.resetModules();
    const restartedModule = await import("../src/demoStore.js");

    expect(restartedModule.demoStore.findById("qf-099")).toEqual(
      expect.objectContaining({
        homeScore: 1,
        awayScore: 1,
        fullMatchHomeScore: 1,
        fullMatchAwayScore: 2,
        resultDecision: "extra_time",
        winnerTeamId: "england"
      })
    );
    expect(restartedModule.demoStore.findById("sf-102")?.homeTeam.id).toBe("england");
  });
});
