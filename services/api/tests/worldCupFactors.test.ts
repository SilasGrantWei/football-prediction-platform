import { describe, expect, it } from "vitest";

import type { Match, MatchResult, TeamRecordComparison, TeamRecordMatch, TeamRecordSummary } from "../src/models.js";
import { calculateLocalPrediction } from "../src/services/predictionService.js";
import { buildWorldCupFactors } from "../src/services/worldCupFactors.js";

const quarterFinal: Match = {
  id: "qf-100",
  competition: "2026世界杯淘汰赛 · 1/4决赛",
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
    id: "switzerland",
    name: "瑞士",
    fifaRating: 84,
    recentForm: 82,
    attackAvg: 1.58,
    defenseAvg: 82,
    xga: 0.98
  },
  homeScore: 0,
  awayScore: 0,
  status: "scheduled",
  startTime: "2026-07-12T01:00:00.000Z",
  minute: 0
};

describe("buildWorldCupFactors", () => {
  it("derives knockout rest days from each team's latest causal completed match", () => {
    const records = comparison(
      [record("r16-argentina", "2026-07-07T16:00:00.000Z")],
      [record("r16-switzerland", "2026-07-07T20:00:00.000Z")]
    );

    const factors = buildWorldCupFactors(quarterFinal, records);

    expect(factors.home.restDays).toBe(4);
    expect(factors.away.restDays).toBe(4);
    expect(factors.home.tournamentSummary).toContain("休息4天");
    expect(factors.away.tournamentSummary).toContain("休息4天");
  });

  it("ignores the target match and future records when selecting the latest played date", () => {
    const records = comparison(
      [
        record("future-home", "2026-07-13T01:00:00.000Z"),
        record(quarterFinal.id, "2026-07-12T01:00:00.000Z"),
        record("valid-home", "2026-07-08T18:00:00.000Z")
      ],
      [
        record("future-away", "2026-07-14T01:00:00.000Z"),
        record(quarterFinal.id, "2026-07-12T01:00:00.000Z"),
        record("valid-away", "2026-07-09T01:00:00.000Z")
      ]
    );

    const factors = buildWorldCupFactors(quarterFinal, records);

    expect(factors.home.restDays).toBe(3);
    expect(factors.away.restDays).toBe(3);
  });

  it("feeds causal rest days into the actual local prediction context", () => {
    const records = comparison(
      [record("r16-argentina", "2026-07-07T16:00:00.000Z")],
      [record("r16-switzerland", "2026-07-07T20:00:00.000Z")]
    );

    const prediction = calculateLocalPrediction(quarterFinal, records);
    const restFactor = prediction.preMatchContext?.factors.find((factor) => factor.name === "休息/旅行消耗");

    expect(restFactor?.homeValue).toMatch(/^4天休息/);
    expect(restFactor?.awayValue).toMatch(/^4天休息/);
  });
});

function comparison(homeMatches: TeamRecordMatch[], awayMatches: TeamRecordMatch[]): TeamRecordComparison {
  return {
    matchId: quarterFinal.id,
    seasonYear: 2026,
    cutoffTime: quarterFinal.startTime,
    note: "unit-test causal records",
    home: summary(quarterFinal.homeTeam.id, quarterFinal.homeTeam.name, homeMatches),
    away: summary(quarterFinal.awayTeam.id, quarterFinal.awayTeam.name, awayMatches),
    headToHead: {
      played: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      matches: []
    }
  };
}

function summary(teamId: string, teamName: string, recentMatches: TeamRecordMatch[]): TeamRecordSummary {
  return {
    teamId,
    teamName,
    played: recentMatches.length,
    wins: recentMatches.length,
    draws: 0,
    losses: 0,
    goalsFor: recentMatches.length,
    goalsAgainst: 0,
    goalDifference: recentMatches.length,
    winRate: recentMatches.length ? 1 : 0,
    cleanSheets: recentMatches.length,
    avgGoalsFor: recentMatches.length ? 1 : 0,
    avgGoalsAgainst: 0,
    recentForm: recentMatches.map(() => "win" as MatchResult),
    recentMatches
  };
}

function record(matchId: string, date: string): TeamRecordMatch {
  return {
    matchId,
    date,
    competition: "2026世界杯淘汰赛",
    opponent: "测试对手",
    venue: "home",
    score: "1-0",
    result: "win"
  };
}
