import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchWorldCupTournamentScoreboardScores,
  parseEspnScoreboard
} from "../src/services/liveScoreProvider.js";

describe("parseEspnScoreboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats completed penalty matches as finished 90-minute results instead of stale live extra time", () => {
    const snapshots = parseEspnScoreboard(
      {
        events: [
          {
            id: "760499",
            name: "Australia vs Egypt",
            date: "2026-07-03T18:00:00.000Z",
            status: {
              clock: 7200,
              displayClock: "119'",
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
                  {
                    homeAway: "home",
                    score: "1",
                    shootoutScore: "3",
                    winner: false,
                    team: { displayName: "Australia" }
                  },
                  {
                    homeAway: "away",
                    score: "1",
                    shootoutScore: "4",
                    winner: true,
                    team: { displayName: "Egypt" }
                  }
                ]
              }
            ]
          }
        ]
      },
      "unit-test"
    );

    expect(snapshots).toEqual([
      expect.objectContaining({
        externalId: "760499",
        homeTeamId: "australia",
        awayTeamId: "egypt",
        homeScore: 1,
        awayScore: 1,
        fullMatchHomeScore: 1,
        fullMatchAwayScore: 1,
        penaltyShootoutHomeScore: 3,
        penaltyShootoutAwayScore: 4,
        resultDecision: "penalties",
        winnerTeamId: "egypt",
        score90Verified: false,
        status: "finished",
        minute: 90
      })
    ]);
  });

  it("uses the first two period scores as the official 90-minute result after extra time", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            events: [
              {
                id: "760493",
                name: "Senegal at Belgium",
                date: "2026-07-01T20:00:00.000Z",
                status: {
                  type: {
                    state: "post",
                    completed: true,
                    description: "Final Score - After Extra Time",
                    detail: "AET",
                    shortDetail: "AET"
                  }
                },
                competitions: [
                  {
                    competitors: [
                      { homeAway: "home", score: "3", winner: true, team: { displayName: "Belgium" } },
                      { homeAway: "away", score: "2", winner: false, team: { displayName: "Senegal" } }
                    ]
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            header: {
              competitions: [
                {
                  competitors: [
                    {
                      homeAway: "home",
                      score: "3",
                      winner: true,
                      team: { displayName: "Belgium" },
                      linescores: [
                        { displayValue: "0" },
                        { displayValue: "2" },
                        { displayValue: "0" },
                        { displayValue: "1" }
                      ]
                    },
                    {
                      homeAway: "away",
                      score: "2",
                      winner: false,
                      team: { displayName: "Senegal" },
                      linescores: [
                        { displayValue: "1" },
                        { displayValue: "1" },
                        { displayValue: "0" },
                        { displayValue: "0" }
                      ]
                    }
                  ]
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const snapshots = await fetchWorldCupTournamentScoreboardScores();

    expect(snapshots).toEqual([
      expect.objectContaining({
        externalId: "760493",
        homeScore: 2,
        awayScore: 2,
        fullMatchHomeScore: 3,
        fullMatchAwayScore: 2,
        resultDecision: "extra_time",
        winnerTeamId: "belgium",
        score90Verified: true
      })
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats a completed fourth period as extended time even when ESPN only says Final", () => {
    const snapshots = parseEspnScoreboard(
      {
        events: [
          {
            id: "period-only-extra-time",
            date: "2026-07-01T20:00:00.000Z",
            status: {
              period: 4,
              type: { state: "post", completed: true, description: "Final" }
            },
            competitions: [
              {
                competitors: [
                  { homeAway: "home", score: "3", winner: true, team: { displayName: "Belgium" } },
                  { homeAway: "away", score: "2", winner: false, team: { displayName: "Senegal" } }
                ]
              }
            ]
          }
        ]
      },
      "unit-test"
    );

    expect(snapshots[0]).toEqual(expect.objectContaining({ score90Verified: false }));
  });

  it("rejects a finished score pair when either side is missing, negative, or non-numeric", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const snapshots = parseEspnScoreboard(
      {
        events: [
          {
            id: "missing-home-score",
            date: "2026-07-12T01:00:00.000Z",
            status: { type: { state: "post", completed: true, description: "Final" } },
            competitions: [
              {
                competitors: [
                  { homeAway: "home", winner: false, team: { displayName: "Argentina" } },
                  { homeAway: "away", score: "2", winner: true, team: { displayName: "England" } }
                ]
              }
            ]
          },
          {
            id: "negative-away-score",
            date: "2026-07-12T01:00:00.000Z",
            status: { type: { state: "post", completed: true, description: "Final" } },
            competitions: [
              {
                competitors: [
                  { homeAway: "home", score: "1", winner: true, team: { displayName: "Argentina" } },
                  { homeAway: "away", score: "-1", winner: false, team: { displayName: "England" } }
                ]
              }
            ]
          },
          {
            id: "non-numeric-home-score",
            date: "2026-07-12T01:00:00.000Z",
            status: { type: { state: "post", completed: true, description: "Final" } },
            competitions: [
              {
                competitors: [
                  { homeAway: "home", score: "n/a", winner: false, team: { displayName: "Argentina" } },
                  { homeAway: "away", score: "2", winner: true, team: { displayName: "England" } }
                ]
              }
            ]
          }
        ]
      },
      "unit-test"
    );

    expect(snapshots).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it("accepts ESPN numeric shootout fields as the strongest evidence for a penalty decision", () => {
    const snapshots = parseEspnScoreboard(
      {
        events: [
          {
            id: "generic-final-with-shootout",
            date: "2026-07-12T01:00:00.000Z",
            status: {
              period: 5,
              type: { state: "post", completed: true, description: "Final" }
            },
            competitions: [
              {
                competitors: [
                  {
                    homeAway: "home",
                    score: "1",
                    shootoutScore: 5,
                    winner: true,
                    team: { displayName: "Argentina" }
                  },
                  {
                    homeAway: "away",
                    score: "1",
                    shootoutScore: 4,
                    winner: false,
                    team: { displayName: "England" }
                  }
                ]
              }
            ]
          }
        ]
      },
      "unit-test"
    );

    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        fullMatchHomeScore: 1,
        fullMatchAwayScore: 1,
        penaltyShootoutHomeScore: 5,
        penaltyShootoutAwayScore: 4,
        resultDecision: "penalties"
      })
    );
  });
});
