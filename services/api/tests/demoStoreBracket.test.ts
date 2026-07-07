import { describe, expect, it } from "vitest";

import { demoStore } from "../src/demoStore.js";

describe("demoStore bracket fixtures", () => {
  it("keeps both Beijing-date July 7 finished round-of-16 matches visible", () => {
    const todayMatches = demoStore.findMatches({ period: "today" });
    const todayIds = todayMatches.map((match) => match.id);
    const r16M93 = demoStore.findById("r16-093");
    const r16M94 = demoStore.findById("r16-094");

    expect(todayIds).toContain("r16-093");
    expect(todayIds).toContain("r16-094");
    expect(r16M93?.status).toBe("finished");
    expect(r16M93?.homeTeam.id).toBe("portugal");
    expect(r16M93?.awayTeam.id).toBe("spain");
    expect(`${r16M93?.homeScore}-${r16M93?.awayScore}`).toBe("0-1");
    expect(r16M94?.status).toBe("finished");
    expect(`${r16M94?.homeScore}-${r16M94?.awayScore}`).toBe("1-4");
  });

  it("uses known round-of-32 winners for the late round-of-16 fixtures", () => {
    const r16M95 = demoStore.findById("r16-095");
    const r16M96 = demoStore.findById("r16-096");

    expect(r16M95?.homeTeam.id).toBe("argentina");
    expect(r16M95?.awayTeam.id).toBe("egypt");
    expect(r16M96?.homeTeam.id).toBe("switzerland");
    expect(r16M96?.awayTeam.id).toBe("colombia");
    expect(`${r16M95?.homeTeam.name}${r16M95?.awayTeam.name}${r16M96?.homeTeam.name}${r16M96?.awayTeam.name}`).not.toContain("胜者");
  });

  it("uses known quarter-final teams after the July 7 Beijing-date results", () => {
    const qfM98 = demoStore.findById("qf-098");

    expect(qfM98?.homeTeam.id).toBe("spain");
    expect(qfM98?.awayTeam.id).toBe("belgium");
    expect(`${qfM98?.homeTeam.name}${qfM98?.awayTeam.name}`).not.toContain("胜者");
  });
});
