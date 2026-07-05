import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExternalDetailFixture } from "../src/services/espnMatchDetailProvider.js";

const fixture: ExternalDetailFixture = {
  id: "api-football-test",
  startTime: "2026-07-03T03:00:00.000Z",
  homeTeam: { id: "switzerland", name: "瑞士" },
  awayTeam: { id: "algeria", name: "阿尔及利亚" },
  homeScore: 2,
  awayScore: 0,
  externalLeague: "fifa.world"
};

describe("apiFootballMatchDetailProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads real fixture lineups, statistics and events from API-Football responses", async () => {
    vi.stubEnv("API_FOOTBALL_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(mockApiFootballFetch));

    const { fetchApiFootballMatchDetail } = await import("../src/services/apiFootballMatchDetailProvider.js");
    const detail = await fetchApiFootballMatchDetail(fixture);

    expect(detail?.sourceLabel).toBe("接口足球数据源官方接口");
    expect(detail?.lineups?.home.starters).toHaveLength(11);
    expect(detail?.lineups?.away.starters).toHaveLength(11);
    expect(detail?.lineups?.home.starters[0]?.name).toBe("格雷戈尔·科贝尔");
    expect(detail?.stats?.home.possession).toBe(55);
    expect(detail?.stats?.away.shots).toBe(13);
    expect(detail?.events.map((event) => event.type)).toEqual(["goal", "yellow_card", "substitution", "var_review", "free_kick"]);
    expect(detail?.events[2]?.player).toContain("替换");
    expect(detail?.events.find((event) => event.type === "var_review")?.description).toContain("视频助理裁判判定");
    expect(detail?.events.find((event) => event.type === "free_kick")?.description).toContain("任意球");
  });
});

async function mockApiFootballFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);

  if (url.includes("/fixtures/lineups")) {
    return jsonResponse([
      lineupSide("Switzerland", "4-2-3-1", [
        "Gregor Kobel",
        "Manuel Akanji",
        "Nico Elvedi",
        "Ricardo Rodriguez",
        "Luca Jaquez",
        "Granit Xhaka",
        "Remo Freuler",
        "Johan Manzambi",
        "Rubén Vargas",
        "Breel Embolo",
        "Dan Ndoye"
      ]),
      lineupSide("Algeria", "4-2-3-1", [
        "Anthony Mandrea",
        "Youcef Atal",
        "Aissa Mandi",
        "Ramy Bensebaini",
        "Rayan Ait-Nouri",
        "Ismael Bennacer",
        "Nabil Bentaleb",
        "Riyad Mahrez",
        "Houssem Aouar",
        "Said Benrahma",
        "Baghdad Bounedjah"
      ])
    ]);
  }

  if (url.includes("/fixtures/statistics")) {
    return jsonResponse([
      statisticSide("Switzerland", [
        ["Ball Possession", "55%"],
        ["Total Shots", 6],
        ["Shots on Goal", 4],
        ["Corner Kicks", 2],
        ["Fouls", 19],
        ["Yellow Cards", 1],
        ["Red Cards", 0]
      ]),
      statisticSide("Algeria", [
        ["Ball Possession", "45%"],
        ["Total Shots", 13],
        ["Shots on Goal", 7],
        ["Corner Kicks", 7],
        ["Fouls", 13],
        ["Yellow Cards", 2],
        ["Red Cards", 0]
      ])
    ]);
  }

  if (url.includes("/fixtures/events")) {
    return jsonResponse([
      {
        time: { elapsed: 46, extra: null },
        team: { name: "Switzerland" },
        player: { name: "Rubén Vargas" },
        assist: { name: null },
        type: "Goal",
        detail: "Normal Goal"
      },
      {
        time: { elapsed: 57, extra: null },
        team: { name: "Algeria" },
        player: { name: "Ramy Bensebaini" },
        assist: { name: null },
        type: "Card",
        detail: "Yellow Card"
      },
      {
        time: { elapsed: 68, extra: null },
        team: { name: "Switzerland" },
        player: { name: "Breel Embolo" },
        assist: { name: "Zeki Amdouni" },
        type: "subst",
        detail: "Substitution 1"
      },
      {
        time: { elapsed: 71, extra: null },
        team: { name: "Switzerland" },
        player: { name: "Rubén Vargas" },
        assist: { name: null },
        type: "Var",
        detail: "VAR",
        comments: "VAR Decision: No Goal"
      },
      {
        time: { elapsed: 74, extra: null },
        team: { name: "Algeria" },
        player: { name: "Ramy Bensebaini" },
        assist: { name: null },
        type: "Free Kick",
        detail: "Free Kick",
        comments: "Ramy Bensebaini wins a free kick in the defensive half."
      }
    ]);
  }

  return jsonResponse([
    {
      fixture: { id: 12345 },
      teams: { home: { name: "Switzerland" }, away: { name: "Algeria" } },
      goals: { home: 2, away: 0 }
    }
  ]);
}

function lineupSide(teamName: string, formation: string, playerNames: string[]) {
  return {
    team: { name: teamName },
    formation,
    startXI: playerNames.map((name, index) => ({
      player: { id: index + 1, name, number: index + 1, pos: index === 0 ? "G" : index < 5 ? "D" : index < 8 ? "M" : "F" }
    })),
    substitutes: [{ player: { id: 30, name: "Sub Player", number: 30, pos: "M" } }]
  };
}

function statisticSide(teamName: string, values: Array<[string, string | number]>) {
  return {
    team: { name: teamName },
    statistics: values.map(([type, value]) => ({ type, value }))
  };
}

function jsonResponse(response: unknown): Response {
  return new Response(JSON.stringify({ response }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
