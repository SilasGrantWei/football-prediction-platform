import { describe, expect, it } from "vitest";

import { getMatchCardPresentation } from "./matchCardPresentation.js";

describe("getMatchCardPresentation", () => {
  it("shows Beijing kickoff time instead of a fake 0-0 for scheduled matches", () => {
    expect(
      getMatchCardPresentation({
        status: "scheduled",
        kickoffLabel: "07/11 03:00 北京时间",
        homeScore: 0,
        awayScore: 0,
        minute: 0
      })
    ).toMatchObject({
      primary: "03:00",
      secondary: "07/11 · 北京时间",
      showRealScore: false,
      tone: "scheduled"
    });
  });

  it("shows the real score and 90-minute label for finished matches", () => {
    expect(
      getMatchCardPresentation({
        status: "finished",
        kickoffLabel: "07/10 04:00 北京时间",
        homeScore: 2,
        awayScore: 0,
        minute: 90
      })
    ).toMatchObject({
      primary: "2-0",
      secondary: "90 分钟",
      showRealScore: true,
      tone: "finished"
    });
  });
});
