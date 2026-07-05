import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchEspnMatchDetail, type ExternalDetailFixture } from "../src/services/espnMatchDetailProvider.js";

const fixture: ExternalDetailFixture = {
  id: "local-score-only-arg-alg",
  startTime: "2026-06-17T01:00:00.000Z",
  homeTeam: { id: "argentina", name: "阿根廷" },
  awayTeam: { id: "algeria", name: "阿尔及利亚" },
  homeScore: 3,
  awayScore: 0
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchEspnMatchDetail", () => {
  it("searches ESPN friendlies when a local record has no external event id", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFriendlyDetailFetch);

    const detail = await fetchEspnMatchDetail(fixture);

    expect(detail?.sourceLabel).toContain("友谊赛");
    expect(detail?.stats?.home.shots).toBe(12);
    expect(detail?.stats?.away.shots).toBe(4);
    expect(detail?.lineups?.home.teamId).toBe("argentina");
    expect(detail?.lineups?.away.teamId).toBe("algeria");
    expect(detail?.events.map((event) => event.type)).toEqual(["goal", "offside"]);
  });

  it("keeps stats and lineups on the correct side when ESPN home and away are reversed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockSwappedFriendlyDetailFetch);

    const detail = await fetchEspnMatchDetail(fixture);

    expect(detail?.stats?.home.possession).toBe(60);
    expect(detail?.stats?.away.possession).toBe(40);
    expect(detail?.lineups?.home.teamId).toBe("argentina");
    expect(detail?.lineups?.home.teamName).toBe("阿根廷");
    expect(detail?.lineups?.away.teamId).toBe("algeria");
    expect(detail?.lineups?.away.teamName).toBe("阿尔及利亚");
  });

  it("keeps detailed ESPN commentary events such as VAR, offside, corner and free kicks", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockCommentaryDetailFetch);

    const detail = await fetchEspnMatchDetail({
      ...fixture,
      id: "commentary-detail",
      homeTeam: { id: "portugal", name: "葡萄牙" },
      awayTeam: { id: "croatia", name: "克罗地亚" },
      homeScore: 2,
      awayScore: 1
    });

    expect(detail?.events.map((event) => event.type)).toEqual(expect.arrayContaining(["var_review", "offside", "corner", "free_kick"]));
    expect(detail?.events.find((event) => event.type === "var_review")?.description).toContain("视频助理裁判判定");
    expect(detail?.events.find((event) => event.type === "var_review")?.description).toContain("进球无效");
    expect(detail?.events.find((event) => event.type === "offside")?.description).toContain("越位");
    expect(detail?.events.find((event) => event.type === "offside")?.player).toBe("安德雷·克拉马里奇");
    expect(detail?.events.find((event) => event.type === "corner")?.description).toContain("角球");
    expect(detail?.events.find((event) => event.type === "free_kick")?.description).toContain("任意球");
  });
});

async function mockFriendlyDetailFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);

  if (url.includes("fifa.world/scoreboard")) {
    return jsonResponse({ events: [] });
  }

  if (url.includes("fifa.friendly/scoreboard")) {
    return jsonResponse({
      events: [
        {
          id: "friendly-arg-alg",
          competitions: [
            {
              competitors: [
                { homeAway: "home", score: "3", team: { displayName: "Argentina", abbreviation: "ARG" } },
                { homeAway: "away", score: "0", team: { displayName: "Algeria", abbreviation: "ALG" } }
              ]
            }
          ]
        }
      ]
    });
  }

  return jsonResponse(buildSummary("home"));
}

async function mockSwappedFriendlyDetailFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);

  if (url.includes("fifa.world/scoreboard")) {
    return jsonResponse({ events: [] });
  }

  if (url.includes("fifa.friendly/scoreboard")) {
    return jsonResponse({
      events: [
        {
          id: "friendly-arg-alg-swapped",
          competitions: [
            {
              competitors: [
                { homeAway: "home", score: "0", team: { displayName: "Algeria", abbreviation: "ALG" } },
                { homeAway: "away", score: "3", team: { displayName: "Argentina", abbreviation: "ARG" } }
              ]
            }
          ]
        }
      ]
    });
  }

  return jsonResponse(buildSummary("away"));
}

async function mockCommentaryDetailFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);

  if (url.includes("fifa.world/scoreboard")) {
    return jsonResponse({ events: [] });
  }

  if (url.includes("fifa.friendly/scoreboard")) {
    return jsonResponse({
      events: [
        {
          id: "commentary-detail-event",
          competitions: [
            {
              competitors: [
                { homeAway: "home", score: "2", team: { displayName: "Portugal", abbreviation: "POR" } },
                { homeAway: "away", score: "1", team: { displayName: "Croatia", abbreviation: "CRO" } }
              ]
            }
          ]
        }
      ]
    });
  }

  return jsonResponse(buildCommentarySummary());
}

function buildSummary(argentinaSide: "home" | "away") {
  const algeriaSide = argentinaSide === "home" ? "away" : "home";
  return {
    boxscore: {
      teams: [
        statsSide(argentinaSide, 60, 12, 7),
        statsSide(algeriaSide, 40, 4, 1)
      ]
    },
    rosters: [
      rosterSide(argentinaSide, "Argentina", ["Lionel Messi", "Julian Alvarez"]),
      rosterSide(algeriaSide, "Algeria", ["Riyad Mahrez", "Ramy Bensebaini"])
    ],
    keyEvents: [
      {
        id: "1",
        type: { type: "goal", text: "Goal" },
        clock: { displayValue: "13'" },
        team: { displayName: "Argentina" },
        participants: [{ athlete: { displayName: "Lionel Messi" } }]
      },
      {
        id: "2",
        type: { type: "offside", text: "Offside" },
        clock: { displayValue: "21'" },
        team: { displayName: "Algeria" },
        participants: [{ athlete: { displayName: "Riyad Mahrez" } }]
      }
    ]
  };
}

function buildCommentarySummary() {
  return {
    commentary: [
      {
        play: {
          id: "91",
          clock: { displayValue: "90'+13'" },
          team: { displayName: "Croatia" },
          text: "VAR Decision: No Goal Portugal 2-1 Croatia."
        }
      },
      {
        play: {
          id: "92",
          clock: { displayValue: "90'+3'" },
          team: { displayName: "Croatia" },
          participants: [{ athlete: { displayName: "Marin Pongracic" } }],
          text: "Offside, Croatia. Andrej Kramaric is caught offside."
        }
      },
      {
        play: {
          id: "93",
          clock: { displayValue: "90'+1'" },
          team: { displayName: "Portugal" },
          participants: [{ athlete: { displayName: "Ruben Dias" } }],
          text: "Corner, Portugal. Conceded by Andrej Kramaric."
        }
      },
      {
        play: {
          id: "94",
          clock: { displayValue: "8'" },
          team: { displayName: "Portugal" },
          participants: [{ athlete: { displayName: "Ruben Neves" } }],
          text: "Ruben Neves (Portugal) wins a free kick in the defensive half."
        }
      }
    ]
  };
}

function statsSide(homeAway: "home" | "away", possession: number, shots: number, shotsOnTarget: number) {
  return {
    homeAway,
    statistics: [
      { name: "possessionPct", displayValue: `${possession}%` },
      { name: "totalShots", displayValue: String(shots) },
      { name: "shotsOnTarget", displayValue: String(shotsOnTarget) },
      { name: "wonCorners", displayValue: "3" },
      { name: "foulsCommitted", displayValue: "9" },
      { name: "yellowCards", displayValue: "1" },
      { name: "redCards", displayValue: "0" }
    ]
  };
}

function rosterSide(homeAway: "home" | "away", teamName: string, names: string[]) {
  return {
    homeAway,
    formation: "4-3-3",
    team: { displayName: teamName },
    roster: names.map((name, index) => ({
      starter: true,
      jersey: String(index + 1),
      athlete: { displayName: name },
      position: { displayName: index === 0 ? "Forward" : "Midfielder" }
    }))
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
