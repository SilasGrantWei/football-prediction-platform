import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import type { Match } from "../src/models.js";
import { matchRepository } from "../src/repositories/matchRepository.js";
import { clearEspnFriendlyRecordCache } from "../src/services/espnFriendlyRecordProvider.js";
import { buildTeamRecordComparison, buildTeamRecordMatchDetail } from "../src/services/teamRecordService.js";

const originalDemoMode = config.demoMode;
const originalExternalMatchDetailsEnabled = config.externalMatchDetailsEnabled;
const originalExternalFriendlyRecordsEnabled = config.externalFriendlyRecordsEnabled;

afterEach(() => {
  config.demoMode = originalDemoMode;
  config.externalMatchDetailsEnabled = originalExternalMatchDetailsEnabled;
  config.externalFriendlyRecordsEnabled = originalExternalFriendlyRecordsEnabled;
  clearEspnFriendlyRecordCache();
  vi.restoreAllMocks();
});

describe("buildTeamRecordComparison", () => {
  beforeEach(() => {
    config.externalMatchDetailsEnabled = false;
    config.externalFriendlyRecordsEnabled = false;
  });

  it("uses only same-year database matches completed before kickoff", async () => {
    config.demoMode = true;
    const match = await matchRepository.findById("match-004");
    expect(match).not.toBeNull();

    const records = await buildTeamRecordComparison(match!);
    const allRecordMatches = [...records.home.recentMatches, ...records.away.recentMatches, ...records.headToHead.matches];

    expect(records.seasonYear).toBe(2026);
    expect(records.home.teamId).toBe("spain");
    expect(records.away.teamId).toBe("austria");
    expect(records.home.recentMatches.some((item) => item.matchId === "match-004")).toBe(false);
    expect(records.away.recentMatches.some((item) => item.matchId === "match-004")).toBe(false);
    expect(allRecordMatches.some((item) => item.matchId.startsWith("prep-2026-"))).toBe(false);
    expect(allRecordMatches.some((item) => item.competition.includes("备战友谊赛"))).toBe(false);

    for (const item of allRecordMatches) {
      expect(new Date(item.date).getUTCFullYear()).toBe(2026);
      expect(new Date(item.date).getTime()).toBeLessThan(new Date(records.cutoffTime).getTime());
    }
  });

  it("does not backfill recent form with fabricated friendlies", async () => {
    config.demoMode = true;
    const match = await matchRepository.findById("match-003");
    expect(match).not.toBeNull();

    const records = await buildTeamRecordComparison(match!);

    expect(records.home.teamId).toBe("portugal");
    expect(records.away.teamId).toBe("croatia");
    expect(records.home.played).toBe(3);
    expect(records.away.played).toBe(3);
    expect(records.home.recentMatches.map((item) => item.matchId)).toEqual(["g-k-005", "g-k-003", "g-k-001"]);
    expect(records.away.recentMatches.map((item) => item.matchId)).toEqual(["g-l-006", "g-l-004", "g-l-001"]);
  });

  it("includes verified ESPN friendlies when the external friendly source returns completed records", async () => {
    config.demoMode = true;
    config.externalFriendlyRecordsEnabled = true;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "762550",
              date: "2026-03-27T19:45Z",
              status: { type: { completed: true, name: "STATUS_FULL_TIME" } },
              competitions: [
                {
                  competitors: [
                    { homeAway: "home", score: "3", team: { displayName: "Switzerland", abbreviation: "SUI" } },
                    { homeAway: "away", score: "4", team: { displayName: "Germany", abbreviation: "GER" } }
                  ]
                }
              ]
            },
            {
              id: "401862321",
              date: "2026-03-31T18:30Z",
              status: { type: { completed: true, name: "STATUS_FULL_TIME" } },
              competitions: [
                {
                  competitors: [
                    { homeAway: "home", score: "0", team: { displayName: "Algeria", abbreviation: "ALG" } },
                    { homeAway: "away", score: "0", team: { displayName: "Uruguay", abbreviation: "URU" } }
                  ]
                }
              ]
            },
            {
              id: "401873391",
              date: "2026-05-21T15:30Z",
              status: { type: { completed: false, name: "STATUS_CANCELED" } },
              competitions: [
                {
                  competitors: [
                    { homeAway: "home", score: "0", team: { displayName: "Qatar", abbreviation: "QAT" } },
                    { homeAway: "away", score: "0", team: { displayName: "Sudan", abbreviation: "SDN" } }
                  ]
                }
              ]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const match = await matchRepository.findById("match-005");
    expect(match).not.toBeNull();

    const records = await buildTeamRecordComparison(match!);

    expect(records.note).toContain("公开赛事数据源");
    expect(records.home.recentMatches.some((item) => item.matchId === "espn-friendly-762550")).toBe(true);
    expect(records.away.recentMatches.some((item) => item.matchId === "espn-friendly-401862321")).toBe(true);
    expect(records.home.recentMatches.some((item) => item.matchId === "espn-friendly-401873391")).toBe(false);
  });

  it("localizes external friendly opponent names before they reach the record panel", async () => {
    config.demoMode = true;
    config.externalFriendlyRecordsEnabled = true;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "friendly-honduras",
              date: "2026-06-07T18:00Z",
              status: { type: { completed: true, name: "STATUS_FULL_TIME" } },
              competitions: [
                {
                  competitors: [
                    { homeAway: "home", score: "2", team: { displayName: "Argentina", abbreviation: "ARG" } },
                    { homeAway: "away", score: "0", team: { displayName: "Honduras", abbreviation: "HON" } }
                  ]
                }
              ]
            },
            {
              id: "friendly-finland",
              date: "2026-03-30T18:00Z",
              status: { type: { completed: true, name: "STATUS_FULL_TIME" } },
              competitions: [
                {
                  competitors: [
                    { homeAway: "home", score: "1", team: { displayName: "Finland", abbreviation: "FIN" } },
                    { homeAway: "away", score: "1", team: { displayName: "Austria", abbreviation: "AUT" } }
                  ]
                }
              ]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const match: Match = {
      id: "localization-chain-target",
      competition: "2026世界杯淘汰赛",
      homeTeam: {
        id: "argentina",
        name: "阿根廷",
        fifaRating: 92,
        recentForm: 88,
        attackAvg: 2.1,
        defenseAvg: 86,
        xga: 0.82
      },
      awayTeam: {
        id: "austria",
        name: "奥地利",
        fifaRating: 80,
        recentForm: 78,
        attackAvg: 1.55,
        defenseAvg: 77,
        xga: 1.08
      },
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-03T00:00:00.000Z",
      minute: 0
    };

    const records = await buildTeamRecordComparison(match);

    expect(records.home.recentMatches.some((item) => item.opponent === "洪都拉斯")).toBe(true);
    expect(records.away.recentMatches.some((item) => item.opponent === "芬兰")).toBe(true);
    expect(records.home.recentMatches.some((item) => item.opponent === "Honduras")).toBe(false);
    expect(records.away.recentMatches.some((item) => item.opponent === "Finland")).toBe(false);
  });

  it("returns real database match detail without synthetic stats or lineups", async () => {
    config.demoMode = true;
    config.externalMatchDetailsEnabled = false;
    const match = await matchRepository.findById("match-003");
    expect(match).not.toBeNull();

    const detail = await buildTeamRecordMatchDetail(match!, "g-k-005");

    expect(detail).not.toBeNull();
    expect(detail?.matchId).toBe("g-k-005");
    expect(detail?.homeTeam.id).toBe("colombia");
    expect(detail?.awayTeam.id).toBe("portugal");
    expect(detail?.source).toBe("database");
    expect(detail?.stats).toBeNull();
    expect(detail?.lineups).toBeNull();
    expect(detail?.dataCompleteness.stats).toBe(false);
    expect(detail?.dataCompleteness.lineups).toBe(false);
    expect(detail?.basicFacts.fullTimeScore).toBe("0-0");
    expect(detail?.basicFacts.dataIntegrity).toBe("score_only");
    expect(detail?.missingDataReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("基础比分"),
        expect.stringContaining("真实技术统计"),
        expect.stringContaining("真实事件时间线"),
        expect.stringContaining("真实上场队员")
      ])
    );
    expect(detail?.events).toEqual([]);
  });

  it("rejects fabricated, current, and unrelated record details", async () => {
    config.demoMode = true;
    config.externalMatchDetailsEnabled = false;
    const match = await matchRepository.findById("match-003");
    expect(match).not.toBeNull();

    await expect(buildTeamRecordMatchDetail(match!, "prep-2026-017")).resolves.toBeNull();
    await expect(buildTeamRecordMatchDetail(match!, "match-003")).resolves.toBeNull();
    await expect(buildTeamRecordMatchDetail(match!, "g-d-001")).resolves.toBeNull();
  });
});
