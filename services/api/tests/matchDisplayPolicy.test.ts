import { describe, expect, it } from "vitest";

import type { Match } from "../src/models.js";
import { filterDisplayableMatches, isStaleScheduledPlaceholder } from "../src/services/matchDisplayPolicy.js";

const baseMatch: Match = {
  id: "display-policy-base",
  competition: "Unit Test Cup",
  homeTeam: {
    id: "home",
    name: "Home FC",
    fifaRating: 90,
    recentForm: 80,
    attackAvg: 1.8,
    defenseAvg: 82,
    xga: 0.9
  },
  awayTeam: {
    id: "away",
    name: "Away FC",
    fifaRating: 80,
    recentForm: 76,
    attackAvg: 1.3,
    defenseAvg: 75,
    xga: 1.1
  },
  homeScore: 0,
  awayScore: 0,
  status: "scheduled",
  startTime: "2099-01-01T09:00:00.000Z",
  minute: 0
};

describe("matchDisplayPolicy", () => {
  const now = new Date("2099-01-01T12:00:00.000Z");

  it("hides scheduled placeholders when kickoff is more than 150 minutes old", () => {
    const staleScheduled = {
      ...baseMatch,
      id: "stale-scheduled",
      startTime: "2099-01-01T09:20:00.000Z"
    };

    expect(isStaleScheduledPlaceholder(staleScheduled, now)).toBe(true);
    expect(filterDisplayableMatches([staleScheduled], now)).toEqual([]);
  });

  it("keeps scheduled matches visible at the 150-minute boundary", () => {
    const boundaryScheduled = {
      ...baseMatch,
      id: "boundary-scheduled",
      startTime: "2099-01-01T09:30:00.000Z"
    };

    expect(isStaleScheduledPlaceholder(boundaryScheduled, now)).toBe(false);
    expect(filterDisplayableMatches([boundaryScheduled], now)).toEqual([boundaryScheduled]);
  });

  it("keeps future, recent scheduled, live, and finished matches visible", () => {
    const futureScheduled = {
      ...baseMatch,
      id: "future-scheduled",
      startTime: "2099-01-01T13:00:00.000Z"
    };
    const recentScheduled = {
      ...baseMatch,
      id: "recent-scheduled",
      startTime: "2099-01-01T09:31:00.000Z"
    };
    const liveMatch: Match = {
      ...baseMatch,
      id: "live-match",
      status: "live",
      startTime: "2099-01-01T09:00:00.000Z",
      minute: 45
    };
    const finishedMatch: Match = {
      ...baseMatch,
      id: "finished-match",
      status: "finished",
      startTime: "2099-01-01T09:00:00.000Z",
      homeScore: 2,
      awayScore: 1,
      minute: 90
    };

    expect(filterDisplayableMatches([futureScheduled, recentScheduled, liveMatch, finishedMatch], now)).toEqual([
      futureScheduled,
      recentScheduled,
      liveMatch,
      finishedMatch
    ]);
  });
});
