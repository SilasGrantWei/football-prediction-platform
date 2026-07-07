import { afterEach, describe, expect, it, vi } from "vitest";

import type { Match, Team } from "../src/models.js";
import { matchRepository } from "../src/repositories/matchRepository.js";
import { applyScoreSnapshots } from "../src/services/liveSimulator.js";
import type { ExternalScoreSnapshot } from "../src/services/liveScoreProvider.js";

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
      homeScore: 0,
      awayScore: 1,
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
        homeScore: 1,
        awayScore: 0
      })
    );
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
