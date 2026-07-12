import { afterEach, describe, expect, it, vi } from "vitest";

import type { Match, Team } from "../src/models.js";
import { matchRepository } from "../src/repositories/matchRepository.js";
import { applyScoreSnapshots, syncLiveScoresOnce } from "../src/services/liveSimulator.js";
import type { ExternalScoreSnapshot } from "../src/services/liveScoreProvider.js";
import { predictionService } from "../src/services/predictionService.js";

describe("liveSimulator score sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates known ESPN event ids even when local round-of-16 teams are still placeholders", async () => {
    const placeholderMatch: Match = {
      id: "r16-093",
      competition: "2026世界杯淘汰赛 · 1/8决赛",
      homeTeam: team("winner_m83", "胜者M83"),
      awayTeam: team("winner_m84", "胜者M84"),
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-06T19:00:00.000Z",
      minute: 0
    };
    const snapshot: ExternalScoreSnapshot = {
      provider: "espn",
      externalId: "760506",
      homeTeamId: "portugal",
      awayTeamId: "spain",
      homeScore: 0,
      awayScore: 1,
      minute: 90,
      status: "finished",
      startTime: "2026-07-06T19:00:00.000Z",
      source: "unit-test"
    };
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([placeholderMatch]);
    const updateSpy = vi.spyOn(matchRepository, "updateMatchState").mockResolvedValue(undefined);

    const updated = await applyScoreSnapshots([snapshot]);

    expect(updated).toBe(1);
    expect(updateSpy).toHaveBeenCalledWith(
      "r16-093",
      expect.objectContaining({
        homeTeamId: "portugal",
        awayTeamId: "spain",
        homeScore: 0,
        awayScore: 1,
        status: "finished",
        minute: 90,
        startTime: "2026-07-06T19:00:00.000Z"
      })
    );
  });

  it("keeps local team order when matching by reversed teams instead of a known event id", async () => {
    const reversedLocalMatch: Match = {
      id: "custom-friendly",
      competition: "Unit Test Cup",
      homeTeam: team("spain", "西班牙"),
      awayTeam: team("portugal", "葡萄牙"),
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-06T19:00:00.000Z",
      minute: 0
    };
    const snapshot: ExternalScoreSnapshot = {
      provider: "espn",
      externalId: "unknown-event",
      homeTeamId: "portugal",
      awayTeamId: "spain",
      homeScore: 1,
      awayScore: 2,
      fullMatchHomeScore: 2,
      fullMatchAwayScore: 3,
      resultDecision: "extra_time",
      minute: 90,
      status: "finished",
      startTime: "2026-07-06T19:00:00.000Z",
      source: "unit-test"
    };
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([reversedLocalMatch]);
    const updateSpy = vi.spyOn(matchRepository, "updateMatchState").mockResolvedValue(undefined);

    const updated = await applyScoreSnapshots([snapshot]);

    expect(updated).toBe(1);
    expect(updateSpy).toHaveBeenCalledWith(
      "custom-friendly",
      expect.objectContaining({
        homeTeamId: "spain",
        awayTeamId: "portugal",
        homeScore: 2,
        awayScore: 1,
        fullMatchHomeScore: 3,
        fullMatchAwayScore: 2,
        resultDecision: "extra_time"
      })
    );
  });

  it("reverses the shootout score together with reversed provider team order", async () => {
    const reversedLocalMatch: Match = {
      id: "custom-shootout",
      competition: "Unit Test Cup",
      homeTeam: team("spain", "西班牙"),
      awayTeam: team("portugal", "葡萄牙"),
      homeScore: 2,
      awayScore: 2,
      status: "finished",
      startTime: "2026-07-06T19:00:00.000Z",
      minute: 90
    };
    const snapshot: ExternalScoreSnapshot = {
      provider: "espn",
      externalId: "unknown-shootout-event",
      homeTeamId: "portugal",
      awayTeamId: "spain",
      homeScore: 2,
      awayScore: 2,
      fullMatchHomeScore: 2,
      fullMatchAwayScore: 2,
      penaltyShootoutHomeScore: 4,
      penaltyShootoutAwayScore: 5,
      resultDecision: "penalties",
      score90Verified: true,
      winnerTeamId: "spain",
      minute: 90,
      status: "finished",
      startTime: reversedLocalMatch.startTime,
      source: "unit-test"
    };
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([reversedLocalMatch]);
    const updateSpy = vi.spyOn(matchRepository, "updateMatchState").mockResolvedValue(undefined);

    await applyScoreSnapshots([snapshot]);

    expect(updateSpy).toHaveBeenCalledWith(
      "custom-shootout",
      expect.objectContaining({
        homeTeamId: "spain",
        awayTeamId: "portugal",
        penaltyShootoutHomeScore: 5,
        penaltyShootoutAwayScore: 4,
        resultDecision: "penalties",
        winnerTeamId: "spain"
      })
    );
  });

  it("stores a penalty-shootout winner and refreshes future predictions automatically", async () => {
    const penaltyMatch: Match = {
      id: "r16-096",
      competition: "2026世界杯淘汰赛 · 1/8决赛",
      homeTeam: team("switzerland", "瑞士"),
      awayTeam: team("colombia", "哥伦比亚"),
      homeScore: 0,
      awayScore: 0,
      status: "finished",
      startTime: "2026-07-07T20:00:00.000Z",
      minute: 90
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "760508",
              name: "Colombia at Switzerland",
              date: "2026-07-07T20:00:00.000Z",
              status: {
                clock: 7200,
                displayClock: "120'",
                period: 5,
                type: {
                  state: "post",
                  completed: true,
                  description: "Final Score - After Penalties",
                  detail: "FT-Pens",
                  shortDetail: "FT-Pens"
                }
              },
              competitions: [
                {
                  competitors: [
                    { homeAway: "home", score: "0", winner: true, team: { displayName: "Switzerland" } },
                    { homeAway: "away", score: "0", winner: false, team: { displayName: "Colombia" } }
                  ]
                }
              ]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([penaltyMatch]);
    const updateSpy = vi.spyOn(matchRepository, "updateMatchState").mockResolvedValue(undefined);
    const predictionRefreshSpy = vi.spyOn(predictionService, "refreshUpcomingPredictions").mockResolvedValue({
      generatedAt: "2026-07-11T00:00:00.000Z",
      considered: 1,
      recalculated: 1,
      failed: 0,
      skipped: { alreadyStarted: 0, finishedLocked: 0, invalidKickoff: 0 },
      matches: [],
      failures: []
    });

    const result = await syncLiveScoresOnce();

    expect(result.updated).toBe(1);
    expect(updateSpy).toHaveBeenCalledWith(
      "r16-096",
      expect.objectContaining({ winnerTeamId: "switzerland" })
    );
    expect(predictionRefreshSpy).toHaveBeenCalledTimes(1);
  });

  it("preserves the local 90-minute score when an extended-time snapshot is not verified", async () => {
    const extraTimeMatch: Match = {
      id: "match-001",
      competition: "Unit Test Cup",
      homeTeam: team("belgium", "Belgium"),
      awayTeam: team("senegal", "Senegal"),
      homeScore: 2,
      awayScore: 2,
      status: "finished",
      startTime: "2026-07-01T20:00:00.000Z",
      minute: 90
    };
    const snapshot: ExternalScoreSnapshot = {
      provider: "espn",
      externalId: "760493",
      homeTeamId: "belgium",
      awayTeamId: "senegal",
      homeScore: 3,
      awayScore: 2,
      fullMatchHomeScore: 3,
      fullMatchAwayScore: 2,
      resultDecision: "extra_time",
      score90Verified: false,
      winnerTeamId: "belgium",
      minute: 90,
      status: "finished",
      startTime: extraTimeMatch.startTime,
      source: "unit-test"
    };
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([extraTimeMatch]);
    const updateSpy = vi.spyOn(matchRepository, "updateMatchState").mockResolvedValue(undefined);

    await applyScoreSnapshots([snapshot]);

    expect(updateSpy).toHaveBeenCalledWith(
      "match-001",
      expect.objectContaining({
        homeScore: 2,
        awayScore: 2,
        fullMatchHomeScore: 3,
        fullMatchAwayScore: 2,
        resultDecision: "extra_time",
        winnerTeamId: "belgium"
      })
    );
  });

  it("retries a failed bracket prediction refresh on the next score sync", async () => {
    const before: Match = {
      id: "r16-093",
      competition: "Unit Test Cup",
      homeTeam: team("portugal", "Portugal"),
      awayTeam: team("spain", "Spain"),
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-06T19:00:00.000Z",
      minute: 0
    };
    const after: Match = {
      ...before,
      homeScore: 0,
      awayScore: 1,
      status: "finished",
      minute: 90,
      winnerTeamId: "spain"
    };
    const scoreboard = new Response(
      JSON.stringify({
        events: [
          {
            id: "760506",
            date: before.startTime,
            status: { type: { state: "post", completed: true, description: "Final" } },
            competitions: [
              {
                competitors: [
                  { homeAway: "home", score: "0", winner: false, team: { displayName: "Portugal" } },
                  { homeAway: "away", score: "1", winner: true, team: { displayName: "Spain" } }
                ]
              }
            ]
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(scoreboard)
      .mockResolvedValueOnce(scoreboard.clone());
    vi.spyOn(matchRepository, "findMatches").mockResolvedValueOnce([before]).mockResolvedValueOnce([after]);
    vi.spyOn(matchRepository, "updateMatchState").mockResolvedValue(undefined);
    const predictionRefreshSpy = vi
      .spyOn(predictionService, "refreshUpcomingPredictions")
      .mockRejectedValueOnce(new Error("temporary prediction failure"))
      .mockResolvedValueOnce({
        generatedAt: "2026-07-11T00:01:00.000Z",
        considered: 1,
        recalculated: 1,
        failed: 0,
        skipped: { alreadyStarted: 0, finishedLocked: 0, invalidKickoff: 0 },
        matches: [],
        failures: []
      });

    await syncLiveScoresOnce();
    await syncLiveScoresOnce();

    expect(predictionRefreshSpy).toHaveBeenCalledTimes(2);
  });
});

function team(id: string, name: string): Team {
  return {
    id,
    name,
    fifaRating: 80,
    recentForm: 80,
    attackAvg: 1.5,
    defenseAvg: 78,
    xga: 1
  };
}
