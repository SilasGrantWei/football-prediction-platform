import { describe, expect, it } from "vitest";

import { demoStore } from "../src/demoStore.js";

describe("demoStore bracket fixtures", () => {
  it("keeps both Beijing-date July 7 finished round-of-16 matches visible", () => {
    const july7Matches = demoStore.findMatches().filter((match) => beijingDateKey(match.startTime) === "2026-07-07");
    const july7Ids = july7Matches.map((match) => match.id);
    const r16M93 = demoStore.findById("r16-093");
    const r16M94 = demoStore.findById("r16-094");

    expect(july7Ids).toContain("r16-093");
    expect(july7Ids).toContain("r16-094");
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
    const qfM97 = demoStore.findById("qf-097");
    const qfM98 = demoStore.findById("qf-098");
    const qfM99 = demoStore.findById("qf-099");
    const qfM100 = demoStore.findById("qf-100");

    expect(qfM97?.homeTeam.id).toBe("france");
    expect(qfM97?.awayTeam.id).toBe("morocco");
    expect(qfM98?.homeTeam.id).toBe("spain");
    expect(qfM98?.awayTeam.id).toBe("belgium");
    expect(qfM99?.homeTeam.id).toBe("norway");
    expect(qfM99?.awayTeam.id).toBe("england");
    expect(qfM100?.homeTeam.id).toBe("argentina");
    expect(qfM100?.awayTeam.id).toBe("switzerland");
    expect(demoStore.findById("r16-096")?.winnerTeamId).toBe("switzerland");
    expect(qfM100?.awayTeam.name).toBe("瑞士");
    expect(`${qfM97?.homeTeam.name}${qfM97?.awayTeam.name}${qfM98?.homeTeam.name}${qfM98?.awayTeam.name}${qfM99?.homeTeam.name}${qfM99?.awayTeam.name}${qfM100?.homeTeam.name}${qfM100?.awayTeam.name}`).not.toContain("胜者");
  });

  it("resolves the July 10 04:00 Beijing-time quarter-final from upstream winners", () => {
    const qfM97 = demoStore.findById("qf-097");

    expect(beijingDateTime(qfM97?.startTime ?? "")).toBe("2026-07-10 04:00");
    expect(qfM97?.homeTeam.name).toBe("法国");
    expect(qfM97?.awayTeam.name).toBe("摩洛哥");
  });
});

function beijingDateKey(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function beijingDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(value));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}`;
}
