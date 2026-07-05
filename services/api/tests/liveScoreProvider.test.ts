import { describe, expect, it } from "vitest";

import { parseEspnScoreboard } from "../src/services/liveScoreProvider.js";

describe("parseEspnScoreboard", () => {
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
                  { homeAway: "home", score: "1", team: { displayName: "Australia" } },
                  { homeAway: "away", score: "1", team: { displayName: "Egypt" } }
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
        status: "finished",
        minute: 90
      })
    ]);
  });
});
